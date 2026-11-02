import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";
import { randomBytes } from "crypto";

const router: IRouter = Router();

const MIN_STAKE = 0.1;
const MAX_CASHOUT = 100;
/** Instant crash chance ~3% at 1.00x */
const INSTANT_CRASH_P = 0.03;

/** Crash point distribution: heavy house edge, long tail */
function rollCrashPoint(): number {
  if (Math.random() < INSTANT_CRASH_P) return 1;
  // Inverse: e = 0.04 house → crash = floor(100 / (1-r)) / 100 style
  const r = Math.random();
  const point = Math.floor((1 / (1 - r * 0.96)) * 100) / 100;
  return Math.min(MAX_CASHOUT, Math.max(1.01, point));
}

router.get("/info", (_req, res) => {
  res.json({ minStake: MIN_STAKE, maxCashout: MAX_CASHOUT });
});

/**
 * POST /play
 * body: { telegramId, stake, cashoutAt }
 * Server rolls crash point; if cashoutAt <= crash → win stake * cashoutAt
 */
router.post("/play", async (req, res) => {
  try {
    if (!(await isGameEnabled("crash"))) {
      res.status(403).json({ error: GAME_DISABLED_MESSAGE });
      return;
    }

    const telegramId = String(req.body?.telegramId ?? "");
    const stakeRaw = Number(req.body?.stake);
    const cashoutAt = Number(req.body?.cashoutAt);

    if (!telegramId) {
      res.status(400).json({ error: "telegramId required" });
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

    let newBalance = Math.round((bal - stake) * 1000) / 1000;
    await db
      .update(usersTable)
      .set({ ton: String(newBalance), updatedAt: new Date() })
      .where(eq(usersTable.telegramId, telegramId));

    let crashPoint = rollCrashPoint();
    // forceWin: guarantee cashout succeeds with small buffer
    if (user.forceWin) {
      crashPoint = Math.max(crashPoint, Math.round((cashout + 0.15) * 100) / 100);
    }

    const won = cashout <= crashPoint;
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
          losses: (user.losses ?? 0) + 1,
          totalGamesPlayed: (user.totalGamesPlayed ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.telegramId, telegramId));
    }

    // entropy leftover
    void randomBytes(4);

    res.json({
      ok: true,
      stake,
      cashoutAt: cashout,
      crashPoint,
      won,
      payout,
      profit: won ? Math.round((payout - stake) * 1000) / 1000 : -stake,
      newBalance,
    });
  } catch (e: any) {
    console.error("[crash/play]", e);
    res.status(500).json({ error: e?.message ?? "Crash failed" });
  }
});

export default router;
