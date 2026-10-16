import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";
import { randomBytes } from "crypto";

const router: IRouter = Router();

const MIN_STAKE = 0.1;
/** House edge ~4% on even money → payout multiplier */
const MULTIPLIER = 1.92;

export type CoinSide = "heads" | "tails";

function rollSide(): CoinSide {
  const b = randomBytes(1)[0]!;
  return (b & 1) === 0 ? "heads" : "tails";
}

router.get("/info", (_req, res) => {
  res.json({
    multiplier: MULTIPLIER,
    minStake: MIN_STAKE,
    sides: ["heads", "tails"],
  });
});

/**
 * POST /play
 * body: { telegramId, stake, side: "heads" | "tails" }
 */
router.post("/play", async (req, res) => {
  try {
    if (!(await isGameEnabled("coin"))) {
      res.status(403).json({ error: GAME_DISABLED_MESSAGE });
      return;
    }

    const telegramId = String(req.body?.telegramId ?? "");
    const stakeRaw = Number(req.body?.stake);
    const side = String(req.body?.side ?? "") as CoinSide;

    if (!telegramId) {
      res.status(400).json({ error: "telegramId required" });
      return;
    }
    if (!Number.isFinite(stakeRaw) || stakeRaw < MIN_STAKE) {
      res.status(400).json({ error: `Minimum stake is ${MIN_STAKE} TON` });
      return;
    }
    if (side !== "heads" && side !== "tails") {
      res.status(400).json({ error: "side must be heads or tails" });
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

    let result: CoinSide = rollSide();
    if (user.forceWin) result = side;

    const won = result === side;
    let payout = 0;

    if (won) {
      payout = Math.round(stake * MULTIPLIER * 1000) / 1000;
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
      side,
      result,
      won,
      stake,
      multiplier: MULTIPLIER,
      payout,
      profit: won ? Math.round((payout - stake) * 1000) / 1000 : -stake,
      newBalance,
    });
  } catch (e: any) {
    console.error("[coin/play]", e);
    res.status(500).json({ error: e?.message ?? "Coin flip failed" });
  }
});

export default router;
