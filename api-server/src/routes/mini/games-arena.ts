import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniArenaRoomsTable } from "@workspace/db/schema";
import { eq, desc, or, and, gte } from "drizzle-orm";
import {
  generateServerSeed,
  hashServerSeed,
  computeFairnessHash,
  pickWinnerByHash,
} from "../../lib/fairness.js";

const router: IRouter = Router();

const TIMER_SECONDS = 20;
const COMMISSION_RATE = 0.20;
const MIN_STAKE = 0.1;
const MIN_PLAYERS = 2;

type ArenaPlayer = { telegramId: string; username: string | null; stake: number };

function formatArena(room: typeof miniArenaRoomsTable.$inferSelect) {
  const players = (room.players as ArenaPlayer[]) ?? [];
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

async function getActiveArena() {
  const arena = await db
    .select()
    .from(miniArenaRoomsTable)
    .where(or(eq(miniArenaRoomsTable.status, "waiting"), eq(miniArenaRoomsTable.status, "starting")))
    .orderBy(desc(miniArenaRoomsTable.id))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (arena) return arena;

  // Return recently finished room for up to 18s so the frontend can play animation
  const cutoff = new Date(Date.now() - 18_000);
  const recent = await db
    .select()
    .from(miniArenaRoomsTable)
    .where(and(eq(miniArenaRoomsTable.status, "finished"), gte(miniArenaRoomsTable.finishedAt, cutoff)))
    .orderBy(desc(miniArenaRoomsTable.id))
    .limit(1)
    .then((r) => r[0] ?? null);
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
  const payout = Math.round((winnerStake + othersPool * (1 - COMMISSION_RATE)) * 1000) / 1000;

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

  const nextSeed = generateServerSeed();
  await db.insert(miniArenaRoomsTable).values({
    entryFee: "0",
    totalPool: "0",
    players: [] as ArenaPlayer[],
    status: "waiting",
    serverSeed: nextSeed,
    serverSeedHash: hashServerSeed(nextSeed),
    clientSeed: "default",
    nonce: 1,
  });
}

/* ── GET /state ── */
router.get("/state", async (_req, res) => {
  const arena = await getActiveArena();
  res.json(formatArena(arena));
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
  const { telegramId, stake } = req.body as { telegramId?: string; stake?: number };
  if (!telegramId || typeof stake !== "number" || stake < MIN_STAKE) {
    res.status(400).json({ error: `telegramId и stake >= ${MIN_STAKE} обязательны` });
    return;
  }
  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null);
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }
  if (Number(user.ton) < stake) { res.status(400).json({ error: "Недостаточно TON" }); return; }

  const arena = await getActiveArena();
  const players = (arena.players as ArenaPlayer[]) ?? [];
  if (players.some((p) => p.telegramId === telegramId)) {
    res.status(400).json({ error: "Вы уже участвуете в арене" }); return;
  }

  const stakeR = Math.round(stake * 1000) / 1000;
  await db.update(usersTable).set({ ton: String(Math.round((Number(user.ton) - stakeR) * 1000) / 1000), updatedAt: new Date() }).where(eq(usersTable.telegramId, telegramId));

  const newPlayers: ArenaPlayer[] = [...players, { telegramId, username: user.username ?? null, stake: stakeR }];
  const newPool = Math.round((Number(arena.totalPool) + stakeR) * 1000) / 1000;

  let newStatus = arena.status;
  let startAt = arena.startAt;
  if (newPlayers.length >= MIN_PLAYERS && arena.status === "waiting") {
    newStatus = "starting";
    startAt = new Date(Date.now() + TIMER_SECONDS * 1000);
    setTimeout(() => resolveArena(arena.id), TIMER_SECONDS * 1000);
  }

  const [updated] = await db
    .update(miniArenaRoomsTable)
    .set({ players: newPlayers, totalPool: String(newPool), status: newStatus, startAt })
    .where(eq(miniArenaRoomsTable.id, arena.id))
    .returning();

  res.json(formatArena(updated));
});

/* ── POST /increase ── */
router.post("/increase", async (req, res) => {
  const { telegramId, additionalStake } = req.body as { telegramId?: string; additionalStake?: number };
  if (!telegramId || typeof additionalStake !== "number" || additionalStake <= 0) {
    res.status(400).json({ error: "telegramId и additionalStake > 0 обязательны" }); return;
  }
  const arena = await getActiveArena();
  if (!["waiting", "starting"].includes(arena.status)) {
    res.status(400).json({ error: "Нельзя изменить ставку — игра уже завершена" }); return;
  }
  const players = (arena.players as ArenaPlayer[]) ?? [];
  const idx = players.findIndex((p) => p.telegramId === telegramId);
  if (idx === -1) { res.status(400).json({ error: "Вы не участвуете в арене" }); return; }

  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null);
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }
  const addR = Math.round(additionalStake * 1000) / 1000;
  if (Number(user.ton) < addR) { res.status(400).json({ error: "Недостаточно TON" }); return; }

  await db.update(usersTable).set({ ton: String(Math.round((Number(user.ton) - addR) * 1000) / 1000), updatedAt: new Date() }).where(eq(usersTable.telegramId, telegramId));

  const newPlayers = players.map((p, i) => i === idx ? { ...p, stake: Math.round((p.stake + addR) * 1000) / 1000 } : p);
  const newPool = Math.round((Number(arena.totalPool) + addR) * 1000) / 1000;

  const [updated] = await db
    .update(miniArenaRoomsTable)
    .set({ players: newPlayers, totalPool: String(newPool) })
    .where(eq(miniArenaRoomsTable.id, arena.id))
    .returning();

  res.json(formatArena(updated));
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
