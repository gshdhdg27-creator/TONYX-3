import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";
import { randomBytes } from "crypto";

const router: IRouter = Router();

const MIN_STAKE = 0.1;

/** Multiplier tables by risk (rows=12 slots = rows+1 buckets) */
const TABLES: Record<string, number[]> = {
  low: [0.5, 0.7, 0.9, 1.0, 1.1, 1.2, 1.4, 1.2, 1.1, 1.0, 0.9, 0.7, 0.5],
  med: [0.2, 0.4, 0.6, 0.9, 1.2, 1.8, 3.0, 1.8, 1.2, 0.9, 0.6, 0.4, 0.2],
  high: [0, 0.1, 0.3, 0.6, 1.0, 2.5, 15, 2.5, 1.0, 0.6, 0.3, 0.1, 0],
};

function dropBall(slots: number): { path: number[]; slot: number } {
  const path: number[] = [];
  let pos = 0;
  const rows = slots - 1;
  for (let i = 0; i < rows; i++) {
    const right = (randomBytes(1)[0]! & 1) === 1;
    path.push(right ? 1 : 0);
    if (right) pos += 1;
  }
  return { path, slot: pos };
}

router.get("/info", (_req, res) => {
  res.json({ minStake: MIN_STAKE, risks: Object.keys(TABLES), tables: TABLES });
});

/**
 * POST /play
 * body: { telegramId, stake, risk: "low"|"med"|"high" }
 */
router.post("/play", async (req, res) => {
  try {
    if (!(await isGameEnabled("plinko"))) {
      res.status(403).json({ error: GAME_DISABLED_MESSAGE });
      return;
    }

    const telegramId = String(req.body?.telegramId ?? "");
    const stakeRaw = Number(req.body?.stake);
    const risk = String(req.body?.risk ?? "med");

    if (!telegramId) {
      res.status(400).json({ error: "telegramId required" });
      return;
    }
    if (!Number.isFinite(stakeRaw) || stakeRaw < MIN_STAKE) {
      res.status(400).json({ error: `Minimum stake is ${MIN_STAKE} TON` });
      return;
    }
    const table = TABLES[risk];
    if (!table) {
      res.status(400).json({ error: "risk must be low, med, or high" });
      return;
    }

    const stake = Math.round(stakeRaw * 1000) / 1000;

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

    let { path, slot } = dropBall(table.length);
    if (user.forceWin) {
      // bias to center-high multipliers
      const best = table.reduce((bi, v, i, a) => (v > a[bi]! ? i : bi), 0);
      slot = best;
      path = path.map((_, i) => (i < best ? 1 : 0));
    }

    const mult = table[slot] ?? 0;
    const payout = Math.round(stake * mult * 1000) / 1000;
    const won = payout > 0;

    if (payout > 0) {
      newBalance = Math.round((newBalance + payout) * 1000) / 1000;
      await db
        .update(usersTable)
        .set({
          ton: String(newBalance),
          wins: (user.wins ?? 0) + (payout >= stake ? 1 : 0),
          losses: (user.losses ?? 0) + (payout < stake ? 1 : 0),
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

    res.json({
      ok: true,
      stake,
      risk,
      path,
      slot,
      multiplier: mult,
      multipliers: table,
      payout,
      won,
      profit: Math.round((payout - stake) * 1000) / 1000,
      newBalance,
    });
  } catch (e: any) {
    console.error("[plinko/play]", e);
    res.status(500).json({ error: e?.message ?? "Plinko failed" });
  }
});

export default router;
