import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniSpinRoomsTable, miniUserInventoryTable } from "@workspace/db/schema";
import { eq, desc, or, and, gte, inArray } from "drizzle-orm";
import {
  generateServerSeed,
  hashServerSeed,
  computeFairnessHash,
  pickWinnerByHash,
} from "../../lib/fairness.js";
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";

const router: IRouter = Router();
const COMMISSION_RATE = 0.20;
const MIN_STAKE = 0.1;

/** Deterministic 0..1 offset inside winner sector — same for every client. */
function computeStopFrac(hash: string | null | undefined): number {
  if (!hash || hash.length < 16) return 0.5;
  const n = parseInt(hash.slice(8, 16), 16);
  if (Number.isNaN(n)) return 0.5;
  return n / 0xffffffff;
}

type NftStake = {
  inventoryId: number;
  itemId: string;
  valueTon: number;
  nameRu?: string;
  imageUrl?: string | null;
  meta?: Record<string, unknown>;
};

type SpinPlayer = {
  telegramId: string;
  username: string | null;
  stake: number;
  chance: number;
  nftStakes?: NftStake[];
};

function recalcChances(players: SpinPlayer[]): SpinPlayer[] {
  const total = players.reduce((s, p) => s + p.stake, 0);
  return players.map((p) => ({
    ...p,
    chance: total > 0 ? Math.round((p.stake / total) * 10000) / 100 : 0,
  }));
}

/** Pure TON part of a player's stake (stake value minus NFT values). */
function pureTonOf(p: SpinPlayer): number {
  const nftSum = (p.nftStakes ?? []).reduce((s, n) => s + (Number(n.valueTon) || 0), 0);
  return Math.max(0, Math.round((p.stake - nftSum) * 1000) / 1000);
}

async function resolveRound(roundId: number) {
  const round = await db
    .select()
    .from(miniSpinRoomsTable)
    .where(eq(miniSpinRoomsTable.id, roundId))
    .then((r) => r[0] ?? null);
  if (!round || round.status !== "starting") return;

  const players = (round.players as SpinPlayer[]) ?? [];
  if (players.length < 2) {
    await db.update(miniSpinRoomsTable).set({ status: "waiting", startAt: null }).where(eq(miniSpinRoomsTable.id, roundId));
    return;
  }

  const totalPool = players.reduce((s, p) => s + p.stake, 0);
  const serverSeed = round.serverSeed ?? generateServerSeed();
  const clientSeed = round.clientSeed ?? "default";
  const nonce = round.nonce ?? 1;
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
        delete m.spinRoundId;
        delete m.spinRoundPending;
        if (p.telegramId === winner.telegramId) {
          await db
            .update(miniUserInventoryTable)
            .set({
              telegramId: winner.telegramId,
              meta: { ...m, source: "spin_win_own", spinRoundId: roundId },
              acquiredAt: new Date(),
            })
            .where(eq(miniUserInventoryTable.id, item.id));
          continue;
        }
        const toSystem = !canPayCommission;
        const dest = toSystem ? "SYSTEM_PVP_SPIN" : winner.telegramId;
        await db
          .update(miniUserInventoryTable)
          .set({
            telegramId: dest,
            meta: {
              ...m,
              source: toSystem ? "spin_burn_commission" : "spin_win",
              fromPlayer: p.telegramId,
              spinRoundId: roundId,
              game: "spin",
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
        console.error("[spin/resolve nft]", e);
      }
    }
  }

  await db
    .update(miniSpinRoomsTable)
    .set({
      status: "finished",
      winnerId: winner.telegramId,
      winnerUsername: winner.username,
      finishedAt: new Date(),
      serverSeed,
      fairnessHash: fairHash,
    })
    .where(eq(miniSpinRoomsTable.id, roundId));

  const winnerUser = await db.select().from(usersTable).where(eq(usersTable.telegramId, winner.telegramId)).then((r) => r[0] ?? null);
  if (winnerUser) {
    await db.update(usersTable).set({
      ton: String(Math.round((Number(winnerUser.ton) + payout) * 1000) / 1000),
      wins: (winnerUser.wins ?? 0) + 1,
      totalGamesPlayed: (winnerUser.totalGamesPlayed ?? 0) + 1,
      updatedAt: new Date(),
    }).where(eq(usersTable.telegramId, winner.telegramId));
  }

  for (const p of players) {
    if (p.telegramId === winner.telegramId) continue;
    const u = await db.select().from(usersTable).where(eq(usersTable.telegramId, p.telegramId)).then((r) => r[0] ?? null);
    if (u) {
      await db.update(usersTable).set({
        losses: (u.losses ?? 0) + 1,
        totalGamesPlayed: (u.totalGamesPlayed ?? 0) + 1,
        updatedAt: new Date(),
      }).where(eq(usersTable.telegramId, p.telegramId));
    }
  }
}

export default router;
