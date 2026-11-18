import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniSpinRoomsTable, miniUserInventoryTable } from "@workspace/db/schema";
import { eq, desc, or, inArray, and } from "drizzle-orm";
import { getNftCollection } from "../../lib/nft-catalog.js";
import {
  generateServerSeed,
  hashServerSeed,
  computeFairnessHash,
  pickWinnerByHash,
} from "../../lib/fairness.js";
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";

const router: IRouter = Router();

const MIN_STAKE = 0.1;
const TIMER_SECONDS = 20;
const COMMISSION_RATE = 0.20;

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

async function formatRound(room: typeof miniSpinRoomsTable.$inferSelect) {
  const rawPlayers = (room.players as SpinPlayer[]) ?? [];
  const totalPool = rawPlayers.reduce((s, p) => s + p.stake, 0);
  const isFinished = room.status === "finished";

  const photos = rawPlayers.length
    ? await db
        .select({ telegramId: usersTable.telegramId, photoUrl: usersTable.photoUrl })
        .from(usersTable)
        .where(inArray(usersTable.telegramId, rawPlayers.map((p) => p.telegramId)))
    : [];
  const photoById = new Map(photos.map((u) => [u.telegramId, u.photoUrl]));

  const players = rawPlayers.map((p) => ({
    ...p,
    chance: totalPool > 0 ? Math.round((p.stake / totalPool) * 10000) / 100 : 0,
    photoUrl: photoById.get(p.telegramId) ?? null,
  }));

  return {
    id: room.id,
    status: room.status,
    totalPool: Math.round(totalPool * 1000) / 1000,
    players,
    winnerId: room.winnerId ?? null,
    winnerUsername: room.winnerUsername ?? null,
    startAt: room.startAt?.toISOString() ?? null,
    finishedAt: room.finishedAt?.toISOString() ?? null,
    stopFrac: isFinished ? computeStopFrac(room.fairnessHash) : null,
    fair: {
      serverSeedHash: room.serverSeedHash,
      serverSeed: isFinished ? (room.serverSeed ?? null) : null,
      clientSeed: room.clientSeed,
      nonce: room.nonce,
      hash: isFinished ? (room.fairnessHash ?? null) : null,
    },
  };
}

async function getActiveRound() {
  const existing = await db
    .select()
    .from(miniSpinRoomsTable)
    .where(or(eq(miniSpinRoomsTable.status, "waiting"), eq(miniSpinRoomsTable.status, "starting")))
    .orderBy(desc(miniSpinRoomsTable.id))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (existing) return existing;

  const seed = generateServerSeed();
  const [created] = await db
    .insert(miniSpinRoomsTable)
    .values({
      players: [] as SpinPlayer[],
      totalPool: "0",
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
    await createNewRound();
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
  // Commission only from pure TON in the pot (never from NFT face value).
  // NFTs always transfer to the winner — they must not vanish into SYSTEM on normal bets.
  const totalPureTon = players.reduce((s, p) => s + pureTonOf(p), 0);
  const commissionTon = Math.round(Math.min(commissionNeeded, totalPureTon) * 1000) / 1000;
  const payout = Math.round((totalPureTon - commissionTon) * 1000) / 1000;

  // NFT stakes: losers' gifts → winner, or SYSTEM_PVP if commission > winner stake
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
        // only transfer if still owned by the staker (or already locked)
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
          // winner keeps own NFT
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
        const toSystem = commissionTon > winnerStake + 1e-9; // extreme only; normal bets → NFT to winner
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
              winnerStake,
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

  await createNewRound();
}

async function createNewRound() {
  const seed = generateServerSeed();
  await db.insert(miniSpinRoomsTable).values({
    players: [] as SpinPlayer[],
    totalPool: "0",
    status: "waiting",
    serverSeed: seed,
    serverSeedHash: hashServerSeed(seed),
    clientSeed: "default",
    nonce: 1,
  });
}

async function ensureSpinResolved(round: typeof miniSpinRoomsTable.$inferSelect) {
  if (
    round.status === "starting" &&
    round.startAt &&
    round.startAt.getTime() <= Date.now()
  ) {
    const finishedId = round.id;
    await resolveRound(finishedId);
    const finished = await db
      .select()
      .from(miniSpinRoomsTable)
      .where(eq(miniSpinRoomsTable.id, finishedId))
      .then((r) => r[0] ?? null);
    if (finished && finished.status === "finished" && finished.winnerId) {
      return finished;
    }
    return getActiveRound();
  }
  return round;
}

const ANIMATION_WINDOW_MS = 12_000;
async function getRecentFinishedForAnimation() {
  const room = await db
    .select()
    .from(miniSpinRoomsTable)
    .where(eq(miniSpinRoomsTable.status, "finished"))
    .orderBy(desc(miniSpinRoomsTable.finishedAt))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (!room?.finishedAt || !room.winnerId) return null;
  const age = Date.now() - new Date(room.finishedAt).getTime();
  if (age < 0 || age > ANIMATION_WINDOW_MS) return null;
  const players = (room.players as SpinPlayer[]) ?? [];
  if (players.length < 2) return null;
  return room;
}

router.get("/state", async (_req, res) => {
  let round = await getActiveRound();
  round = await ensureSpinResolved(round);

  if (round.status === "waiting") {
    const players = (round.players as SpinPlayer[]) ?? [];
    if (players.length === 0) {
      const recent = await getRecentFinishedForAnimation();
      if (recent) {
        res.json(await formatRound(recent));
        return;
      }
    }
  }

  res.json(await formatRound(round));
});

router.get("/history", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "40")), 120);
  const finished = await db
    .select()
    .from(miniSpinRoomsTable)
    .where(eq(miniSpinRoomsTable.status, "finished"))
    .orderBy(desc(miniSpinRoomsTable.id))
    .limit(limit);

  const allIds = new Set<string>();
  for (const r of finished) {
    for (const p of ((r.players as SpinPlayer[]) ?? [])) allIds.add(p.telegramId);
  }
  const photoById = new Map<string, string | null>();
  if (allIds.size) {
    const photos = await db
      .select({ telegramId: usersTable.telegramId, photoUrl: usersTable.photoUrl })
      .from(usersTable)
      .where(inArray(usersTable.telegramId, [...allIds]));
    for (const u of photos) photoById.set(u.telegramId, u.photoUrl ?? null);
  }

  const mapped = finished.filter((r) => r.winnerId).map((r) => {
    const rawPlayers = (r.players as SpinPlayer[]) ?? [];
    const totalPool = rawPlayers.reduce((s, p) => s + p.stake, 0);
    const players = rawPlayers.map((p) => ({
      ...p,
      chance: totalPool > 0 ? Math.round((p.stake / totalPool) * 10000) / 100 : 0,
      photoUrl: photoById.get(p.telegramId) ?? null,
    }));
    const wp = players.find((p) => p.telegramId === r.winnerId);
    const ws = wp?.stake ?? 0;
    const winnerPayout = Math.round((ws + (totalPool - ws) * (1 - COMMISSION_RATE)) * 1000) / 1000;
    return {
      id: r.id,
      winnerId: r.winnerId,
      winnerUsername: r.winnerUsername,
      winnerPayout,
      totalPool: Math.round(totalPool * 1000) / 1000,
      playerCount: players.length,
      players,
      finishedAt: r.finishedAt?.toISOString() ?? null,
      stopFrac: computeStopFrac(r.fairnessHash),
      fair: {
        serverSeed: r.serverSeed ?? null,
        serverSeedHash: r.serverSeedHash,
        clientSeed: r.clientSeed,
        nonce: r.nonce,
        hash: r.fairnessHash ?? null,
      },
    };
  });

  res.json({
    rooms: mapped,
    history: mapped.map((r) => ({
      id: r.id,
      telegramId: r.winnerId,
      username: r.winnerUsername,
      payout: r.winnerPayout,
      totalPool: r.totalPool,
      playerCount: r.playerCount,
      finishedAt: r.finishedAt,
    })),
  });
});

router.get("/biggest-winner", async (_req, res) => {
  const finished = await db.select().from(miniSpinRoomsTable).where(eq(miniSpinRoomsTable.status, "finished")).orderBy(desc(miniSpinRoomsTable.finishedAt)).limit(200);
  let best: { telegramId: string | null; username: string | null; payout: number; totalPool: number; finishedAt: string | null } | null = null;
  for (const r of finished) {
    if (!r.winnerId) continue;
    const players = (r.players as SpinPlayer[]) ?? [];
    const totalPool = players.reduce((s, p) => s + p.stake, 0);
    const wp = players.find((p) => p.telegramId === r.winnerId);
    const ws = wp?.stake ?? 0;
    const payout = Math.round((ws + (totalPool - ws) * (1 - COMMISSION_RATE)) * 1000) / 1000;
    if (!best || payout > best.payout) best = { telegramId: r.winnerId, username: r.winnerUsername, payout, totalPool: Math.round(totalPool * 1000) / 1000, finishedAt: r.finishedAt?.toISOString() ?? null };
  }
  res.json({ winner: best });
});

router.get("/lucky-players", async (_req, res) => {
  const finished = await db.select().from(miniSpinRoomsTable).where(eq(miniSpinRoomsTable.status, "finished")).orderBy(desc(miniSpinRoomsTable.finishedAt)).limit(500);
  const map = new Map<string, { telegramId: string; username: string | null; wins: number; totalWon: number }>();
  for (const r of finished) {
    if (!r.winnerId) continue;
    const players = (r.players as SpinPlayer[]) ?? [];
    const totalPool = players.reduce((s, p) => s + p.stake, 0);
    const wp = players.find((p) => p.telegramId === r.winnerId);
    const ws = wp?.stake ?? 0;
    const payout = Math.round((ws + (totalPool - ws) * (1 - COMMISSION_RATE)) * 1000) / 1000;
    const entry = map.get(r.winnerId) ?? { telegramId: r.winnerId, username: r.winnerUsername, wins: 0, totalWon: 0 };
    entry.wins++;
    entry.totalWon = Math.round((entry.totalWon + payout) * 1000) / 1000;
    map.set(r.winnerId, entry);
  }
  const sorted = [...map.values()].sort((a, b) => b.wins - a.wins).slice(0, 20);
  res.json({ players: sorted });
});

router.get("/last-winner", async (_req, res) => {
  const room = await db.select().from(miniSpinRoomsTable).where(eq(miniSpinRoomsTable.status, "finished")).orderBy(desc(miniSpinRoomsTable.finishedAt)).limit(1).then((r) => r[0] ?? null);
  if (!room || !room.winnerId) {
    res.json({ winner: null });
    return;
  }
  const players = (room.players as SpinPlayer[]) ?? [];
  const totalPool = players.reduce((s, p) => s + p.stake, 0);
  const wp = players.find((p) => p.telegramId === room.winnerId);
  const ws = wp?.stake ?? 0;
  const payout = Math.round((ws + (totalPool - ws) * (1 - COMMISSION_RATE)) * 1000) / 1000;
  res.json({ winner: { telegramId: room.winnerId, username: room.winnerUsername, payout, totalPool: Math.round(totalPool * 1000) / 1000, finishedAt: room.finishedAt?.toISOString() ?? null } });
});

router.post("/join", async (req, res) => {
  if (!(await isGameEnabled("spin"))) {
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
    res.status(400).json({ error: "telegramId обязателен" }); return;
  }
  if (!isGift && (typeof stakeIn !== "number" || stakeIn < MIN_STAKE)) {
    res.status(400).json({ error: `telegramId и stake >= ${MIN_STAKE} обязательны` }); return;
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
      if (m.listed === true || m.spinLocked === true) {
        res.status(400).json({ error: "Подарок недоступен для ставки" }); return;
      }
      const col = getNftCollection(item.itemId);
      const valueTon = Math.max(
        0.1,
        Number(m.priceTon) || Number(m.valueTon) || col?.valueTon || 1
      );
      const v = Math.round(valueTon * 1000) / 1000;
      stakeR = Math.round((stakeR + v) * 1000) / 1000;
      nftStakes.push({
        inventoryId: item.id,
        itemId: item.itemId,
        valueTon: v,
        nameRu: String(m.giftName || m.nameRu || col?.nameRu || item.itemId),
        imageUrl: (m.imageUrl as string | null | undefined) ?? col?.imageUrl ?? null,
        meta: m,
      });
      await db
        .update(miniUserInventoryTable)
        .set({
          meta: {
            ...m,
            spinLocked: true,
            spinRoundPending: true,
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

  let round = await getActiveRound();
  round = await ensureSpinResolved(round);
  if (round.status === "finished") {
    round = await getActiveRound();
  }
  if (round.status === "finished") {
    res.status(400).json({ error: "Раунд завершён, подожди новый" });
    return;
  }

  const players = (round.players as SpinPlayer[]) ?? [];
  if (players.some((p) => p.telegramId === telegramId)) {
    res.status(400).json({ error: "Ты уже в этом раунде" }); return;
  }

  const newPlayers: SpinPlayer[] = recalcChances([
    ...players,
    {
      telegramId,
      username: user.username ?? null,
      stake: stakeR,
      chance: 0,
      nftStakes,
    },
  ]);

  let newStatus = round.status;
  let startAt = round.startAt;
  if (newPlayers.length >= 2 && round.status === "waiting") {
    newStatus = "starting";
    startAt = new Date(Date.now() + TIMER_SECONDS * 1000);
    setTimeout(() => resolveRound(round.id), TIMER_SECONDS * 1000);
  }

  const [updated] = await db
    .update(miniSpinRoomsTable)
    .set({ players: newPlayers, totalPool: String(Math.round(newPlayers.reduce((s, p) => s + p.stake, 0) * 1000) / 1000), status: newStatus, startAt })
    .where(eq(miniSpinRoomsTable.id, round.id))
    .returning();

  res.json(await formatRound(updated));
});

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

  let round = await getActiveRound();
  round = await ensureSpinResolved(round);
  if (round.status === "finished") {
    round = await getActiveRound();
  }
  if (round.status !== "starting" && round.status !== "waiting") {
    res.status(400).json({ error: "Увеличить ставку можно только пока раунд активен" }); return;
  }
  const players = (round.players as SpinPlayer[]) ?? [];
  const idx = players.findIndex((p) => p.telegramId === telegramId);
  if (idx === -1) { res.status(400).json({ error: "Ты не в этом раунде" }); return; }

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
      if (m.listed === true || m.spinLocked === true) {
        res.status(400).json({ error: "Подарок недоступен для ставки" }); return;
      }
      const col = getNftCollection(item.itemId);
      const valueTon = Math.max(0.1, Number(m.priceTon) || Number(m.valueTon) || col?.valueTon || 1);
      const v = Math.round(valueTon * 1000) / 1000;
      addR = Math.round((addR + v) * 1000) / 1000;
      const nameRu = String(m.giftName || m.nameRu || col?.nameRu || item.itemId);
      const imageUrl = (m.imageUrl as string | null | undefined) ?? col?.imageUrl ?? null;
      extraNfts.push({
        inventoryId: item.id,
        itemId: item.itemId,
        valueTon: v,
        nameRu,
        imageUrl,
        meta: m,
      });
      await db
        .update(miniUserInventoryTable)
        .set({
          meta: {
            ...m,
            spinLocked: true,
            spinRoundPending: true,
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

  const newPlayers = recalcChances(
    players.map((p, i) => {
      if (i !== idx) return p;
      const prevNfts = p.nftStakes ?? [];
      return {
        ...p,
        stake: Math.round((p.stake + addR) * 1000) / 1000,
        nftStakes: extraNfts.length ? [...prevNfts, ...extraNfts] : (prevNfts.length ? prevNfts : undefined),
      };
    })
  );

  const [updated] = await db
    .update(miniSpinRoomsTable)
    .set({
      players: newPlayers,
      totalPool: String(Math.round(newPlayers.reduce((s, p) => s + p.stake, 0) * 1000) / 1000),
    })
    .where(eq(miniSpinRoomsTable.id, round.id))
    .returning();

  res.json(await formatRound(updated));
});

router.post("/client-seed", async (req, res) => {
  const { clientSeed } = req.body as { clientSeed?: string };
  if (!clientSeed || typeof clientSeed !== "string" || clientSeed.trim().length === 0) {
    res.status(400).json({ error: "clientSeed обязателен" }); return;
  }
  const round = await getActiveRound();
  if (round.status !== "waiting") {
    res.status(400).json({ error: "Нельзя изменить clientSeed — игра уже начата" }); return;
  }
  const [updated] = await db
    .update(miniSpinRoomsTable)
    .set({ clientSeed: clientSeed.trim().slice(0, 64) })
    .where(eq(miniSpinRoomsTable.id, round.id))
    .returning();
  res.json({ ok: true, clientSeed: updated.clientSeed, serverSeedHash: updated.serverSeedHash, nonce: updated.nonce });
});

router.get("/fair/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const room = await db.select().from(miniSpinRoomsTable).where(eq(miniSpinRoomsTable.id, id)).then((r) => r[0] ?? null);
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

router.get("/rooms", async (_req, res) => { res.json({ rooms: [] }); });
router.get("/rooms/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const room = await db.select().from(miniSpinRoomsTable).where(eq(miniSpinRoomsTable.id, id)).then((r) => r[0] ?? null);
  if (!room) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await formatRound(room));
});
router.post("/rooms", async (_req, res) => { res.status(410).json({ error: "Use POST /join instead." }); });
router.post("/rooms/:id/join", async (_req, res) => { res.status(410).json({ error: "Use POST /join instead." }); });

export default router;
