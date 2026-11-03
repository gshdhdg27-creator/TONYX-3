import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";
import { createHash } from "crypto";

const router: IRouter = Router();

const MIN_STAKE = 0.1;
const MAX_CASHOUT = 100;

/** Global always-on schedule (ms) */
const ROUND_MS = 20_000;
const BETTING_MS = 10_000;
const FLY_MS = 7_500;
const RESULT_MS = ROUND_MS - BETTING_MS - FLY_MS;

function crashForRound(roundId: number): number {
  const h = createHash("sha256").update(`tonyx-crash-${roundId}`).digest();
  const r = h[0]! / 255;
  if (r < 0.03) return 1;
  const r2 = ((h[1]! << 8) | h[2]!) / 65535;
  const point = Math.floor((1 / (1 - r2 * 0.96)) * 100) / 100;
  return Math.min(MAX_CASHOUT, Math.max(1.01, point));
}

function getRoundState(now = Date.now()) {
  const roundId = Math.floor(now / ROUND_MS);
  const elapsed = now % ROUND_MS;
  let phase: "betting" | "fly" | "result";
  let phaseElapsed: number;
  let phaseRemaining: number;

  if (elapsed < BETTING_MS) {
    phase = "betting";
    phaseElapsed = elapsed;
    phaseRemaining = BETTING_MS - elapsed;
  } else if (elapsed < BETTING_MS + FLY_MS) {
    phase = "fly";
    phaseElapsed = elapsed - BETTING_MS;
    phaseRemaining = BETTING_MS + FLY_MS - elapsed;
  } else {
    phase = "result";
    phaseElapsed = elapsed - BETTING_MS - FLY_MS;
    phaseRemaining = ROUND_MS - elapsed;
  }

  const crashPoint = phase === "betting" ? null : crashForRound(roundId);

  return {
    roundId,
    phase,
    elapsed,
    phaseElapsed,
    phaseRemaining,
    bettingMs: BETTING_MS,
    flyMs: FLY_MS,
    resultMs: RESULT_MS,
    roundMs: ROUND_MS,
    crashPoint,
    serverNow: now,
  };
}

router.get("/info", (_req, res) => {
  res.json({
    minStake: MIN_STAKE,
    maxCashout: MAX_CASHOUT,
    bettingMs: BETTING_MS,
    roundMs: ROUND_MS,
  });
});

/** Current global round — always running even with 0 players */
router.get("/state", (_req, res) => {
  res.json(getRoundState());
});

/**
 * Place bet only during the global betting window.
 * body: { telegramId, stake, cashoutAt, roundId }
 */
router.post("/play", async (req, res) => {
  try {
    if (!(await isGameEnabled("crash"))) {
      res.status(403).json({ error: GAME_DISABLED_MESSAGE });
      return;
    }

    const st = getRoundState();
    const telegramId = String(req.body?.telegramId ?? "");
    const stakeRaw = Number(req.body?.stake);
    const cashoutAt = Number(req.body?.cashoutAt);
    const clientRound = Number(req.body?.roundId);

    if (!telegramId) {
      res.status(400).json({ error: "telegramId required" });
      return;
    }
    if (st.phase !== "betting") {
      res.status(400).json({ error: "Ставки закрыты — ждите следующий раунд" });
      return;
    }
    if (Number.isFinite(clientRound) && clientRound !== st.roundId) {
      res.status(400).json({ error: "Раунд уже сменился" });
      return;
    }
    if (!Number.isFinite(stakeRaw) || stakeRaw < MIN_STAKE) {
      res.status(400).json({ error: `Minimum stake is ${MIN_STAKE} TON` });
      return;
    }
    if (!Number.isFinite(cashoutAt) || cashoutAt < 1.01 || cashoutAt > MAX_CASHOUT) {
      res.status(400).json({ error: `cashoutAt must be 1.01–${MAX_CASHOUT}` });
      return;
    }

    const stake = Math.round(stakeRaw * 1000) / 1000;
    const cashout = Math.round(cashoutAt * 100) / 100;
    const crashPoint = crashForRound(st.roundId);

    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .then((r) => r[0] ?? null);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const bal = Number(user.ton ?? 0);
    if (bal < stake) {
      res.status(400).json({ error: `Insufficient TON. You have ${bal}` });
      return;
    }

    let effectiveCrash = crashPoint;
    if (user.forceWin) {
      effectiveCrash = Math.max(crashPoint, Math.round((cashout + 0.15) * 100) / 100);
    }

    const won = cashout <= effectiveCrash;
    let newBalance = Math.round((bal - stake) * 1000) / 1000;
    let payout = 0;

    if (won) {
      payout = Math.round(stake * cashout * 1000) / 1000;
      newBalance = Math.round((newBalance + payout) * 1000) / 1000;
      await db
        .update(usersTable)
        .set({
          ton: String(newBalance),
          wins: (user.wins ?? 0) + 1,
          totalGamesPlayed: (user.totalGamesPlayed ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.telegramId, telegramId));
    } else {
      await db
        .update(usersTable)
        .set({
          ton: String(newBalance),
          losses: (user.losses ?? 0) + 1,
          totalGamesPlayed: (user.totalGamesPlayed ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.telegramId, telegramId));
    }

    res.json({
      ok: true,
      roundId: st.roundId,
      stake,
      cashoutAt: cashout,
      crashPoint: effectiveCrash,
      publicCrashPoint: crashPoint,
      won,
      payout,
      profit: won ? Math.round((payout - stake) * 1000) / 1000 : -stake,
      newBalance,
      phaseRemaining: st.phaseRemaining,
    });
  } catch (e: any) {
    console.error("[crash/play]", e);
    res.status(500).json({ error: e?.message ?? "Crash failed" });
  }
});

export default router;
