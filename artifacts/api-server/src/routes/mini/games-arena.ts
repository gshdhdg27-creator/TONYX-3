import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniArenaRoomsTable, miniUserInventoryTable } from "@workspace/db/schema";
import { eq, desc, or, and, gte, inArray } from "drizzle-orm";
import {
  generateServerSeed,
  hashServerSeed,
  computeFairnessHash,
  pickWinnerByHash,
} from "../../lib/fairness.js";
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";
import { getNftCollection } from "../../lib/nft-catalog.js";

const router: IRouter = Router();

const TIMER_SECONDS = 15;
const COMMISSION_RATE = 0.20;
const MIN_STAKE = 0.1;
const MIN_PLAYERS = 2;

type NftStake = {
  inventoryId: number;
  itemId: string;
  valueTon: number;
  nameRu?: string;
  imageUrl?: string | null;
  meta?: Record<string, unknown>;
};

type ArenaPlayer = {
  telegramId: string;
  username: string | null;
  stake: number;
  nftStakes?: NftStake[];
};

async function formatArena(room: typeof miniArenaRoomsTable.$inferSelect) {
  const players = (room.players as ArenaPlayer[]) ?? [];
  const photos = players.length
    ? await db.select({ telegramId: usersTable.telegramId, photoUrl: usersTable.photoUrl })
        .from(usersTable)
        .where(inArray(usersTable.telegramId, players.map((p) => p.telegramId)))
    : [];
  const photoById = new Map(photos.map((u) => [u.telegramId, u.photoUrl]));
  const totalPool = Number(room.totalPool);
  const isFinished = room.status === "finished";

  let winnerSector: { startDeg: number; endDeg: number } | null = null;
  if (isFinished && room.winnerId && players.length > 0) {
    let acc = 0;
    for (const p of players) {
      const frac = totalPool > 0 ? p.stake / totalPool : 1 / players.length;
      const startDeg = acc * 360;
      const endDeg   = (acc + frac) * 360;
      if (p.telegramId === room.winnerId) {
        winnerSector = { startDeg, endDeg };
        break;
      }
      acc += frac;
    }
  }

  return {
    id: room.id,
    status: room.status,
    totalPool,
    playerCount: players.length,
    players: players.map((p) => ({
      telegramId: p.telegramId,
      username: p.username,
      stake: p.stake,
      chance: totalPool > 0 ? Math.round((p.stake / totalPool) * 10000) / 100 : 0,
      photoUrl: photoById.get(p.telegramId) ?? null,
      nftStakes: p.nftStakes ?? [],
    })),
    winnerId: room.winnerId ?? null,
    winnerUsername: room.winnerUsername ?? null,
    winnerSector,
    startAt: room.startAt?.toISOString() ?? null,
    finishedAt: room.finishedAt?.toISOString() ?? null,
    fair: {
      serverSeedHash: room.serverSeedHash,
      serverSeed: isFinished ? (room.serverSeed ?? null) : null,
      clientSeed: room.clientSeed,
      nonce: room.nonce,
      hash: isFinished ? (room.fairnessHash ?? null) : null,
    },
  };
}

async function getRecentFinished() {
  const cutoff = new Date(Date.now() - 20_000);
  return db
    .select()
    .from(miniArenaRoomsTable)
    .where(and(eq(miniArenaRoomsTable.status, "finished"), gte(miniArenaRoomsTable.finishedAt, cutoff)))
    .orderBy(desc(miniArenaRoomsTable.id))
    .limit(1)
    .then((r) => r[0] ?? null);
}

async function getActiveArena() {
  const arena = await db
    .select()
    .from(miniArenaRoomsTable)
    .where(or(eq(miniArenaRoomsTable.status, "waiting"), eq(miniArenaRoomsTable.status, "starting")))
    .orderBy(desc(miniArenaRoomsTable.id))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (arena) {
    const players = (arena.players as ArenaPlayer[]) ?? [];
    if (arena.status === "waiting" && players.length === 0) {
      const recent = await getRecentFinished();
      if (recent) return recent;
    }
    return arena;
  }

  const recent = await getRecentFinished();
  if (recent) return recent;

  const seed = generateServerSeed();
  const [created] = await db
    .insert(miniArenaRoomsTable)
    .values({
      entryFee: "0",
      totalPool: "0",
      players: [] as ArenaPlayer[],
      status: "waiting",
      serverSeed: seed,
      serverSeedHash: hashServerSeed(seed),
      clientSeed: "default",
      nonce: 1,
    })
    .returning();
  return created;
}

/** Pure TON part of a player's stake (stake value minus NFT values). */
function pureTonOf(p: ArenaPlayer): number {
  const nftSum = (p.nftStakes ?? []).reduce((s, n) => s + (Number(n.valueTon) || 0), 0);
  return Math.max(0, Math.round((p.stake - nftSum) * 1000) / 1000);
}

async function resolveArena(arenaId: number) {
  const arena = await db
    .select()
    .from(miniArenaRoomsTable)
    .where(eq(miniArenaRoomsTable.id, arenaId))
    .then((r) => r[0] ?? null);
  if (!arena || arena.status !== "starting") return;

  const players = (arena.players as ArenaPlayer[]) ?? [];
  if (players.length < MIN_PLAYERS) {
    await db
      .update(miniArenaRoomsTable)
      .set({ status: "waiting", startAt: null })
      .where(eq(miniArenaRoomsTable.id, arenaId));
    return;
  }

  const totalPool = Number(arena.totalPool);
  const serverSeed = arena.serverSeed ?? generateServerSeed();
  const clientSeed = arena.clientSeed ?? "default";
  const nonce = arena.nonce ?? 1;
  const fairHash = computeFairnessHash(serverSeed, clientSeed, nonce);

  const winner = pickWinnerByHash(fairHash, players, totalPool);

  const winnerStake = winner.stake;
  const othersPool = totalPool - winnerStake;
  const commissionNeeded = Math.round(othersPool * COMMISSION_RATE * 1000) / 1000;

  const totalPureTon = players.reduce((s, p) => s + pureTonOf(p), 0);
  const winnerPure = pureTonOf(winner);
  const canPayCommission = totalPureTon + 1e-9 >= commissionNeeded;
  const payout = canPayCommission
    ? Math.round((totalPureTon - commissionNeeded) * 1000) / 1000
    : Math.round((winnerPure + othersPool * (1 - COMMISSION_RATE)) * 1000) / 1000;
  const commissionTon = commissionNeeded;

  for (const p of players) {
    const stakes = p.nftStakes ?? [];
    if (!stakes.length) continue;
    for (const ns of stakes) {
      try {
        const item = await db
          .select()
          .from(miniUserInventoryTable)
          .where(eq(miniUserInventoryTable.id, ns.inventoryId))
          .then((r) => r[0] ?? null);
        if (!item) continue;
        const m = { ...(item.meta ?? {}) } as Record<string, unknown>;
        delete m.listed;
        delete m.priceTon;
        delete m.listedAt;
        delete m.spinLocked;
        delete m.arenaLocked;
        delete m.arenaRoundId;
        delete m.arenaRoundPending;
        if (p.telegramId === winner.telegramId) {
          await db
            .update(miniUserInventoryTable)
            .set({
              telegramId: winner.telegramId,
              meta: { ...m, source: "arena_win_own", arenaRoundId: arenaId },
              acquiredAt: new Date(),
            })
            .where(eq(miniUserInventoryTable.id, item.id));
          continue;
        }
        const toSystem = !canPayCommission;
        const dest = toSystem ? "SYSTEM_PVP_ARENA" : winner.telegramId;
        await db
          .update(miniUserInventoryTable)
          .set({
            telegramId: dest,
            meta: {
              ...m,
              source: toSystem ? "arena_burn_commission" : "arena_win",
              fromPlayer: p.telegramId,
              arenaRoundId: arenaId,
              game: "arena",
              commissionTon,
              commissionNeeded,
              totalPureTon,
              winnerStake,
              burned: toSystem,
            },
            acquiredAt: new Date(),
          })
          .where(eq(miniUserInventoryTable.id, item.id));
      } catch (e) {
        console.error("[arena/resolve nft]", e);
      }
    }
  }

  await db
    .update(miniArenaRoomsTable)
    .set({
      status: "finished",
      winnerId: winner.telegramId,
      winnerUsername: winner.username,
      finishedAt: new Date(),
      serverSeed,
      fairnessHash: fairHash,
    })
    .where(eq(miniArenaRoomsTable.id, arenaId));

  const winnerUser = await db.select().from(usersTable).where(eq(usersTable.telegramId, winner.telegramId)).then((r) => r[0] ?? null);
  if (winnerUser) {
    await db.update(usersTable).set({
      ton: String(Math.round((Number(winnerUser.ton) + payout) * 1000) / 1000),
      wins: winnerUser.wins + 1,
      totalGamesPlayed: winnerUser.totalGamesPlayed + 1,
      updatedAt: new Date(),
    }).where(eq(usersTable.telegramId, winner.telegramId));
  }

  for (const p of players) {
    if (p.telegramId === winner.telegramId) continue;
    const u = await db.select().from(usersTable).where(eq(usersTable.telegramId, p.telegramId)).then((r) => r[0] ?? null);
    if (u) {
      await db.update(usersTable).set({
        losses: u.losses + 1,
        totalGamesPlayed: u.totalGamesPlayed + 1,
        updatedAt: new Date(),
      }).where(eq(usersTable.telegramId, p.telegramId));
    }
  }
}

async function maybeResolveExpired(
  arena: typeof miniArenaRoomsTable.$inferSelect,
): Promise<typeof miniArenaRoomsTable.$inferSelect> {
  if (
    arena.status === "starting" &&
    arena.startAt &&
    arena.startAt.getTime() <= Date.now()
  ) {
    await resolveArena(arena.id);
    return getActiveArena();
  }
  return arena;
}

router.get("/state", async (_req, res) => {
  let arena = await getActiveArena();
  arena = await maybeResolveExpired(arena);
  res.json(await formatArena(arena));
});

export default router;
