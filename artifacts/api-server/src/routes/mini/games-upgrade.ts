import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";
import { randomBytes } from "crypto";

const router: IRouter = Router();

const MIN_STAKE = 0.1;
const HOUSE = 0.04; // 4% edge baked into payout mult

router.get("/info", (_req, res) => {
  res.json({ minStake: MIN_STAKE, houseEdge: HOUSE, chanceMin: 5, chanceMax: 90 });
});

/**
 * POST /play
 * body: { telegramId, stake, chance }  // chance 5..90 (%)
 * Win → payout = stake * (100/chance) * (1-HOUSE)
 */
router.post("/play", async (req, res) => {
  try {
    if (!(await isGameEnabled("upgrade"))) {
      res.status(403).json({ error: GAME_DISABLED_MESSAGE });
      return;
    }

    const telegramId = String(req.body?.telegramId ?? "");
    const stakeRaw = Number(req.body?.stake);
    const chanceRaw = Number(req.body?.chance);

    if (!telegramId) {
      res.status(400).json({ error: "telegramId required" });
      return;
    }
    if (!Number.isFinite(stakeRaw) || stakeRaw < MIN_STAKE) {
      res.status(400).json({ error: `Minimum stake is ${MIN_STAKE} TON` });
      return;
    }
    if (!Number.isFinite(chanceRaw) || chanceRaw < 5 || chanceRaw > 90) {
      res.status(400).json({ error: "chance must be 5–90" });
      return;
    }

    const stake = Math.round(stakeRaw * 1000) / 1000;
    const chance = Math.round(chanceRaw);
    const mult = Math.round(((100 / chance) * (1 - HOUSE)) * 1000) / 1000;

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

    const roll = randomBytes(2).readUInt16BE(0) / 65536; // 0..1
    let won = roll * 100 < chance;
    if (user.forceWin) won = true;

    let payout = 0;
    if (won) {
      payout = Math.round(stake * mult * 1000) / 1000;
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

    res.json({
      ok: true,
      stake,
      chance,
      multiplier: mult,
      roll: Math.round(roll * 10000) / 100,
      won,
      payout,
      profit: won ? Math.round((payout - stake) * 1000) / 1000 : -stake,
      newBalance,
    });
  } catch (e: any) {
    console.error("[upgrade/play]", e);
    res.status(500).json({ error: e?.message ?? "Upgrade failed" });
  }
});

export default router;
