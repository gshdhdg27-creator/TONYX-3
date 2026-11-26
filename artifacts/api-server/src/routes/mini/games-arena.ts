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

  // Pre-compute winner sector angles so frontend can reliably set ball target
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

  // Prefer recently finished room over empty waiting so client can play win animation
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
  // Commission only from pure TON in the pot (never from NFT face value).
  // NFTs always transfer to the winner — they must not vanish into SYSTEM on normal bets.
  const totalPureTon = players.reduce((s, p) => s + pureTonOf(p), 0);
  const commissionTon = Math.round(Math.min(commissionNeeded, totalPureTon) * 1000) / 1000;
  const payout = Math.round((totalPureTon - commissionTon) * 1000) / 1000;

  // NFT stakes: losers' gifts → winner (or SYSTEM if commission > winner stake)
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
        delete m.spinRoundPending;
        delete m.spinRoundId;
        delete m.arenaLocked;
        delete m.arenaRoundPending;
        delete m.arenaRoundId;
        delete m.lockedAt;
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
        const toSystem = commissionTon > winnerStake + 1e-9; // extreme only; normal bets → NFT to winner
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
              winnerStake,
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

/* ── GET /state ── */
/** On Vercel setTimeout is unreliable — resolve when startAt has passed on any request. */
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

/* ── GET /history ── */
router.get("/history", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "20")), 50);
  const finished = await db
    .select()
    .from(miniArenaRoomsTable)
    .where(eq(miniArenaRoomsTable.status, "finished"))
    .orderBy(desc(miniArenaRoomsTable.finishedAt))
    .limit(limit);

  res.json({
    rooms: finished
      .filter((r) => r.winnerId)
      .map((r) => {
        const players = (r.players as ArenaPlayer[]) ?? [];
        const totalPool = Number(r.totalPool);
        const wp = players.find((p) => p.telegramId === r.winnerId);
        const ws = wp?.stake ?? 0;
        const winnerPayout = Math.round((ws + (totalPool - ws) * 0.80) * 1000) / 1000;
        return {
          id: r.id,
          winnerId: r.winnerId,
          winnerUsername: r.winnerUsername,
          winnerPayout,
          totalPool,
          playerCount: players.length,
          players,
          finishedAt: r.finishedAt?.toISOString() ?? null,
          fair: {
            serverSeed: r.serverSeed ?? null,
            serverSeedHash: r.serverSeedHash,
            clientSeed: r.clientSeed,
            nonce: r.nonce,
            hash: r.fairnessHash ?? null,
          },
        };
      }),
  });
});

/* ── GET /lucky-players ── */
router.get("/lucky-players", async (_req, res) => {
  const finished = await db
    .select()
    .from(miniArenaRoomsTable)
    .where(eq(miniArenaRoomsTable.status, "finished"))
    .orderBy(desc(miniArenaRoomsTable.finishedAt))
    .limit(500);
  const map = new Map<string, { telegramId: string; username: string | null; wins: number; totalWon: number; minChance: number }>();
  for (const r of finished) {
    if (!r.winnerId) continue;
    const players = (r.players as ArenaPlayer[]) ?? [];
    const totalPool = Number(r.totalPool);
    const wp = players.find((p) => p.telegramId === r.winnerId);
    const ws = wp?.stake ?? 0;
    const payout = Math.round((ws + (totalPool - ws) * 0.80) * 1000) / 1000;
    const chance = totalPool > 0 ? (ws / totalPool) * 100 : 100;
    const entry = map.get(r.winnerId) ?? { telegramId: r.winnerId, username: r.winnerUsername, wins: 0, totalWon: 0, minChance: 100 };
    entry.wins++;
    entry.totalWon = Math.round((entry.totalWon + payout) * 1000) / 1000;
    entry.minChance = Math.min(entry.minChance, chance);
    map.set(r.winnerId, entry);
  }
  const sorted = [...map.values()].sort((a, b) => b.wins - a.wins).slice(0, 20);
  res.json({ players: sorted });
});

/* ── GET /biggest-winner ── */
router.get("/biggest-winner", async (_req, res) => {
  const finished = await db
    .select()
    .from(miniArenaRoomsTable)
    .where(eq(miniArenaRoomsTable.status, "finished"))
    .orderBy(desc(miniArenaRoomsTable.finishedAt))
    .limit(200);
  let best: { telegramId: string | null; username: string | null; payout: number; totalPool: number; playerCount: number; finishedAt: string | null } | null = null;
  for (const r of finished) {
    if (!r.winnerId) continue;
    const players = (r.players as ArenaPlayer[]) ?? [];
    const totalPool = Number(r.totalPool);
    const wp = players.find((p) => p.telegramId === r.winnerId);
    const ws = wp?.stake ?? 0;
    const payout = Math.round((ws + (totalPool - ws) * 0.80) * 1000) / 1000;
    if (!best || payout > best.payout) {
      best = { telegramId: r.winnerId, username: r.winnerUsername, payout, totalPool, playerCount: players.length, finishedAt: r.finishedAt?.toISOString() ?? null };
    }
  }
  res.json({ winner: best });
});

/* ── GET /last-winner ── */
router.get("/last-winner", async (_req, res) => {
  const room = await db
    .select()
    .from(miniArenaRoomsTable)
    .where(eq(miniArenaRoomsTable.status, "finished"))
    .orderBy(desc(miniArenaRoomsTable.finishedAt))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (!room?.winnerId) { res.json({ winner: null }); return; }
  const players = (room.players as ArenaPlayer[]) ?? [];
  const totalPool = Number(room.totalPool);
  const wp = players.find((p) => p.telegramId === room.winnerId);
  const ws = wp?.stake ?? 0;
  const payout = Math.round((ws + (totalPool - ws) * 0.80) * 1000) / 1000;
  res.json({ winner: { telegramId: room.winnerId, username: room.winnerUsername, payout, totalPool, playerCount: players.length, finishedAt: room.finishedAt?.toISOString() ?? null } });
});

/* ── POST /join ── */
router.post("/join", async (req, res) => {
  if (!(await isGameEnabled("arena"))) {
    res.status(403).json({ error: GAME_DISABLED_MESSAGE });
    return;
  }
  const body = req.body as {
    telegramId?: string;
    stake?: number;
    giftInventoryId?: number;
    inventoryId?: number;
    giftInventoryIds?: number[];
  };
  const telegramId = body.telegramId;
  const idsFromArray = Array.isArray(body.giftInventoryIds)
    ? body.giftInventoryIds.map((x) => Number(x)).filter((n) => n > 0)
    : [];
  const singleId = Number(body.giftInventoryId ?? body.inventoryId ?? 0) || 0;
  const giftIds = [...new Set(idsFromArray.length ? idsFromArray : singleId ? [singleId] : [])];
  const isGift = giftIds.length > 0;
  const stakeIn = typeof body.stake === "number" ? body.stake : 0;

  if (!telegramId) {
    res.status(400).json({ error: "telegramId обязателен" });
    return;
  }
  if (!isGift && (typeof stakeIn !== "number" || stakeIn < MIN_STAKE)) {
    res.status(400).json({ error: `telegramId и stake >= ${MIN_STAKE} обязательны` });
    return;
  }

  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null);
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }

  const nftStakes: NftStake[] = [];
  let stakeR = 0;

  if (isGift) {
    for (const giftInventoryId of giftIds) {
      const item = await db
        .select()
        .from(miniUserInventoryTable)
        .where(and(eq(miniUserInventoryTable.id, giftInventoryId), eq(miniUserInventoryTable.telegramId, telegramId)))
        .then((r) => r[0] ?? null);
      if (!item) { res.status(404).json({ error: "Подарок не найден в инвентаре" }); return; }
      const t = String(item.itemType || "").toLowerCase();
      if (!(t.includes("nft") || t.includes("gift"))) {
        res.status(400).json({ error: "Можно ставить только NFT подарок" }); return;
      }
      const m = (item.meta ?? {}) as Record<string, unknown>;
      if (m.listed === true || m.spinLocked === true || m.arenaLocked === true) {
        res.status(400).json({ error: "Подарок недоступен для ставки" }); return;
      }
      const col = getNftCollection(item.itemId);
      const valueTon = Math.max(
        0.1,
        Number(m.priceTon) || Number(m.valueTon) || col?.valueTon || 1
      );
      const v = Math.round(valueTon * 1000) / 1000;
      stakeR = Math.round((stakeR + v) * 1000) / 1000;
      const nameRu = String(m.giftName || m.nameRu || col?.nameRu || item.itemId);
      const imageUrl = (m.imageUrl as string | null | undefined) ?? col?.imageUrl ?? null;
      nftStakes.push({ inventoryId: item.id, itemId: item.itemId, valueTon: v, nameRu, imageUrl, meta: m });
      await db
        .update(miniUserInventoryTable)
        .set({
          meta: {
            ...m,
            arenaLocked: true,
            arenaRoundPending: true,
            lockedAt: new Date().toISOString(),
          },
        })
        .where(eq(miniUserInventoryTable.id, item.id));
    }
  } else {
    if (Number(user.ton) < stakeIn) { res.status(400).json({ error: "Недостаточно TON" }); return; }
    stakeR = Math.round(stakeIn * 1000) / 1000;
    await db.update(usersTable).set({ ton: String(Math.round((Number(user.ton) - stakeR) * 1000) / 1000), updatedAt: new Date() }).where(eq(usersTable.telegramId, telegramId));
  }

  let arena = await getActiveArena();
  arena = await maybeResolveExpired(arena);
  if (arena.status === "finished") {
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
    arena = created;
  }
  if (arena.status !== "waiting" && arena.status !== "starting") {
    res.status(400).json({ error: "Сейчас нельзя присоединиться" });
    return;
  }
  const players = (arena.players as ArenaPlayer[]) ?? [];
  if (players.some((p) => p.telegramId === telegramId)) {
    res.status(400).json({ error: "Вы уже участвуете в арене" }); return;
  }

  const newPlayers: ArenaPlayer[] = [
    ...players,
    { telegramId, username: user.username ?? null, stake: stakeR, nftStakes: nftStakes.length ? nftStakes : undefined },
  ];
  const newPool = Math.round((Number(arena.totalPool) + stakeR) * 1000) / 1000;

  let newStatus = arena.status;
  let startAt = arena.startAt;
  // Timer starts once when 2nd player joins and must NOT reset for later joins.
  if (newPlayers.length >= MIN_PLAYERS && arena.status === "waiting") {
    newStatus = "starting";
    startAt = new Date(Date.now() + TIMER_SECONDS * 1000);
  }

  const [updated] = await db
    .update(miniArenaRoomsTable)
    .set({ players: newPlayers, totalPool: String(newPool), status: newStatus, startAt })
    .where(eq(miniArenaRoomsTable.id, arena.id))
    .returning();

  res.json(await formatArena(updated));
});

/* ── POST /increase ── (TON или NFT-гифты к уже сделанной ставке) */
router.post("/increase", async (req, res) => {
  const body = req.body as {
    telegramId?: string;
    additionalStake?: number;
    giftInventoryId?: number;
    inventoryId?: number;
    giftInventoryIds?: number[];
  };
  const telegramId = body.telegramId;
  const idsFromArray = Array.isArray(body.giftInventoryIds)
    ? body.giftInventoryIds.map((x) => Number(x)).filter((n) => n > 0)
    : [];
  const singleId = Number(body.giftInventoryId ?? body.inventoryId ?? 0) || 0;
  const giftIds = [...new Set(idsFromArray.length ? idsFromArray : singleId ? [singleId] : [])];
  const isGift = giftIds.length > 0;
  const additionalStake = typeof body.additionalStake === "number" ? body.additionalStake : 0;

  if (!telegramId) {
    res.status(400).json({ error: "telegramId обязателен" }); return;
  }
  if (!isGift && !(additionalStake > 0)) {
    res.status(400).json({ error: "telegramId и additionalStake > 0 обязательны" }); return;
  }

  let arena = await getActiveArena();
  arena = await maybeResolveExpired(arena);
  if (!["waiting", "starting"].includes(arena.status)) {
    res.status(400).json({ error: "Нельзя изменить ставку — игра уже завершена" }); return;
  }
  const players = (arena.players as ArenaPlayer[]) ?? [];
  const idx = players.findIndex((p) => p.telegramId === telegramId);
  if (idx === -1) { res.status(400).json({ error: "Вы не участвуете в арене" }); return; }

  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null);
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }

  let addR = 0;
  const extraNfts: NftStake[] = [];

  if (isGift) {
    for (const giftInventoryId of giftIds) {
      const item = await db
        .select()
        .from(miniUserInventoryTable)
        .where(and(eq(miniUserInventoryTable.id, giftInventoryId), eq(miniUserInventoryTable.telegramId, telegramId)))
        .then((r) => r[0] ?? null);
      if (!item) { res.status(404).json({ error: "Подарок не найден в инвентаре" }); return; }
      const t = String(item.itemType || "").toLowerCase();
      if (!(t.includes("nft") || t.includes("gift"))) {
        res.status(400).json({ error: "Можно ставить только NFT подарок" }); return;
      }
      const m = (item.meta ?? {}) as Record<string, unknown>;
      if (m.listed === true || m.spinLocked === true || m.arenaLocked === true) {
        res.status(400).json({ error: "Подарок недоступен для ставки" }); return;
      }
      const col = getNftCollection(item.itemId);
      const valueTon = Math.max(0.1, Number(m.priceTon) || Number(m.valueTon) || col?.valueTon || 1);
      const v = Math.round(valueTon * 1000) / 1000;
      addR = Math.round((addR + v) * 1000) / 1000;
      const nameRu = String(m.giftName || m.nameRu || col?.nameRu || item.itemId);
      const imageUrl = (m.imageUrl as string | null | undefined) ?? col?.imageUrl ?? null;
      extraNfts.push({ inventoryId: item.id, itemId: item.itemId, valueTon: v, nameRu, imageUrl, meta: m });
      await db
        .update(miniUserInventoryTable)
        .set({
          meta: {
            ...m,
            arenaLocked: true,
            arenaRoundPending: true,
            lockedAt: new Date().toISOString(),
          },
        })
        .where(eq(miniUserInventoryTable.id, item.id));
    }
  } else {
    addR = Math.round(additionalStake * 1000) / 1000;
    if (Number(user.ton) < addR) { res.status(400).json({ error: "Недостаточно TON" }); return; }
    await db.update(usersTable).set({
      ton: String(Math.round((Number(user.ton) - addR) * 1000) / 1000),
      updatedAt: new Date(),
    }).where(eq(usersTable.telegramId, telegramId));
  }

  const newPlayers = players.map((p, i) => {
    if (i !== idx) return p;
    const prevNfts = p.nftStakes ?? [];
    return {
      ...p,
      stake: Math.round((p.stake + addR) * 1000) / 1000,
      nftStakes: extraNfts.length ? [...prevNfts, ...extraNfts] : (prevNfts.length ? prevNfts : undefined),
    };
  });
  const newPool = Math.round((Number(arena.totalPool) + addR) * 1000) / 1000;

  const [updated] = await db
    .update(miniArenaRoomsTable)
    .set({ players: newPlayers, totalPool: String(newPool) })
    .where(eq(miniArenaRoomsTable.id, arena.id))
    .returning();

  res.json(await formatArena(updated));
});

/* ── POST /client-seed ── */
router.post("/client-seed", async (req, res) => {
  const { clientSeed } = req.body as { clientSeed?: string };
  if (!clientSeed || typeof clientSeed !== "string" || clientSeed.trim().length === 0) {
    res.status(400).json({ error: "clientSeed обязателен" }); return;
  }
  const arena = await getActiveArena();
  if (arena.status !== "waiting") {
    res.status(400).json({ error: "Нельзя изменить clientSeed — игра уже начата" }); return;
  }
  const [updated] = await db
    .update(miniArenaRoomsTable)
    .set({ clientSeed: clientSeed.trim().slice(0, 64) })
    .where(eq(miniArenaRoomsTable.id, arena.id))
    .returning();
  res.json({ ok: true, clientSeed: updated.clientSeed, serverSeedHash: updated.serverSeedHash, nonce: updated.nonce });
});

/* ── GET /fair/:id ── */
router.get("/fair/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const room = await db.select().from(miniArenaRoomsTable).where(eq(miniArenaRoomsTable.id, id)).then((r) => r[0] ?? null);
  if (!room) { res.status(404).json({ error: "Not found" }); return; }
  const isFinished = room.status === "finished";
  res.json({
    id: room.id,
    serverSeedHash: room.serverSeedHash,
    serverSeed: isFinished ? (room.serverSeed ?? null) : null,
    clientSeed: room.clientSeed,
    nonce: room.nonce,
    hash: isFinished ? (room.fairnessHash ?? null) : null,
    status: room.status,
    winnerId: room.winnerId ?? null,
  });
});

export default router;
