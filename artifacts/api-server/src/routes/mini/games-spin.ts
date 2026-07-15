import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniSpinRoomsTable } from "@workspace/db/schema";
import { eq, desc, or } from "drizzle-orm";
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

type SpinPlayer = { telegramId: string; username: string | null; stake: number; chance: number };

function recalcChances(players: SpinPlayer[]): SpinPlayer[] {
  const total = players.reduce((s, p) => s + p.stake, 0);
  return players.map((p) => ({
    ...p,
    chance: total > 0 ? Math.round((p.stake / total) * 10000) / 100 : 0,
  }));
}

function formatRound(room: typeof miniSpinRoomsTable.$inferSelect) {
  const players = (room.players as SpinPlayer[]) ?? [];
  const totalPool = players.reduce((s, p) => s + p.stake, 0);
  const isFinished = room.status === "finished";
  return {
    id: room.id,
    status: room.status,
    totalPool: Math.round(totalPool * 1000) / 1000,
    players,
    winnerId: room.winnerId ?? null,
    winnerUsername: room.winnerUsername ?? null,
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
  const payout = Math.round((winnerStake + othersPool * (1 - COMMISSION_RATE)) * 1000) / 1000;

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

/* ── GET /state ── */
router.get("/state", async (_req, res) => {
  const round = await getActiveRound();
  res.json(formatRound(round));
});

/* ── GET /history ── */
router.get("/history", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "20")), 50);
  const finished = await db
    .select()
    .from(miniSpinRoomsTable)
    .where(eq(miniSpinRoomsTable.status, "finished"))
    .orderBy(desc(miniSpinRoomsTable.finishedAt))
    .limit(limit);

  const mapped = finished.filter((r) => r.winnerId).map((r) => {
    const players = (r.players as SpinPlayer[]) ?? [];
    const totalPool = players.reduce((s, p) => s + p.stake, 0);
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

/* ── GET /biggest-winner ── */
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

/* ── GET /lucky-players ── */
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

/* ── GET /last-winner ── */
router.get("/last-winner", async (_req, res) => {
  const room = await db.select().from(miniSpinRoomsTable).where(eq(miniSpinRoomsTable.status, "finished")).orderBy(desc(miniSpinRoomsTable.finishedAt)).limit(1).then((r) => r[0] ?? null);
  if (!room?.winnerId) { res.json({ winner: null }); return; }
  const players = (room.players as SpinPlayer[]) ?? [];
  const totalPool = players.reduce((s, p) => s + p.stake, 0);
  const wp = players.find((p) => p.telegramId === room.winnerId);
  const ws = wp?.stake ?? 0;
  const payout = Math.round((ws + (totalPool - ws) * (1 - COMMISSION_RATE)) * 1000) / 1000;
  res.json({ winner: { telegramId: room.winnerId, username: room.winnerUsername, payout, totalPool: Math.round(totalPool * 1000) / 1000, finishedAt: room.finishedAt?.toISOString() ?? null } });
});

/* ── POST /join ── */
router.post("/join", async (req, res) => {
  if (!(await isGameEnabled("spin"))) {
    res.status(403).json({ error: GAME_DISABLED_MESSAGE });
    return;
  }
  const { telegramId, stake } = req.body as { telegramId?: string; stake?: number };
  if (!telegramId || typeof stake !== "number" || stake < MIN_STAKE) {
    res.status(400).json({ error: `telegramId и stake >= ${MIN_STAKE} обязательны` }); return;
  }
  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null);
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }
  if (Number(user.ton) < stake) { res.status(400).json({ error: "Недостаточно TON" }); return; }

  const round = await getActiveRound();
  if (round.status === "finished") { res.status(400).json({ error: "Раунд завершён, подожди новый" }); return; }

  const players = (round.players as SpinPlayer[]) ?? [];
  if (players.some((p) => p.telegramId === telegramId)) {
    res.status(400).json({ error: "Ты уже в этом раунде" }); return;
  }

  const stakeR = Math.round(stake * 1000) / 1000;
  await db.update(usersTable).set({ ton: String(Math.round((Number(user.ton) - stakeR) * 1000) / 1000), updatedAt: new Date() }).where(eq(usersTable.telegramId, telegramId));

  const newPlayers: SpinPlayer[] = recalcChances([
    ...players,
    { telegramId, username: user.username ?? null, stake: stakeR, chance: 0 },
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

  res.json(formatRound(updated));
});

/* ── POST /increase ── */
router.post("/increase", async (req, res) => {
  const { telegramId, additionalStake } = req.body as { telegramId?: string; additionalStake?: number };
  if (!telegramId || typeof additionalStake !== "number" || additionalStake <= 0) {
    res.status(400).json({ error: "telegramId и additionalStake > 0 обязательны" }); return;
  }
  const round = await getActiveRound();
  if (round.status !== "starting" && round.status !== "waiting") {
    res.status(400).json({ error: "Увеличить ставку можно только пока раунд активен" }); return;
  }
  const players = (round.players as SpinPlayer[]) ?? [];
  const idx = players.findIndex((p) => p.telegramId === telegramId);
  if (idx === -1) { res.status(400).json({ error: "Ты не в этом раунде" }); return; }

  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null);
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }
  const addR = Math.round(additionalStake * 1000) / 1000;
  if (Number(user.ton) < addR) { res.status(400).json({ error: "Недостаточно TON" }); return; }

  await db.update(usersTable).set({ ton: String(Math.round((Number(user.ton) - addR) * 1000) / 1000), updatedAt: new Date() }).where(eq(usersTable.telegramId, telegramId));

  const newPlayers = recalcChances(
    players.map((p, i) => i === idx ? { ...p, stake: Math.round((p.stake + addR) * 1000) / 1000 } : p)
  );

  const [updated] = await db
    .update(miniSpinRoomsTable)
    .set({ players: newPlayers, totalPool: String(Math.round(newPlayers.reduce((s, p) => s + p.stake, 0) * 1000) / 1000) })
    .where(eq(miniSpinRoomsTable.id, round.id))
    .returning();

  res.json(formatRound(updated));
});

/* ── POST /client-seed ── */
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

/* ── GET /fair/:id ── */
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

/* ── Legacy room endpoints ── */
router.get("/rooms", async (_req, res) => { res.json({ rooms: [] }); });
router.get("/rooms/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const room = await db.select().from(miniSpinRoomsTable).where(eq(miniSpinRoomsTable.id, id)).then((r) => r[0] ?? null);
  if (!room) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatRound(room));
});
router.post("/rooms", async (_req, res) => { res.status(410).json({ error: "Use POST /join instead." }); });
router.post("/rooms/:id/join", async (_req, res) => { res.status(410).json({ error: "Use POST /join instead." }); });

export default router;
