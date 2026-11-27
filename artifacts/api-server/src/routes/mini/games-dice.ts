import { Router, type IRouter } from "express";
import { randomInt } from "crypto";
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";
import { settleSingleRoundGame } from "../../lib/game-balance.js";

const router: IRouter = Router();
const MIN_STAKE = 0.1;
const MAX_STAKE = 100;
router.get("/info", (_req, res) => res.json({ minStake: MIN_STAKE, maxStake: MAX_STAKE, minThreshold: 1, maxThreshold: 98, houseEdge: 0.03 }));
router.post("/play", async (req, res) => {
  try {
    if (!(await isGameEnabled("dice"))) return void res.status(403).json({ error: GAME_DISABLED_MESSAGE });
    const telegramId = String(req.body?.telegramId ?? "");
    const stakeRaw = Number(req.body?.stake);
    const threshold = Number(req.body?.threshold);
    const direction = String(req.body?.direction ?? "");
    if (!telegramId) return void res.status(400).json({ error: "telegramId required" });
    if (!Number.isFinite(stakeRaw) || stakeRaw < MIN_STAKE || stakeRaw > MAX_STAKE) return void res.status(400).json({ error: "Invalid stake" });
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 98) return void res.status(400).json({ error: "Threshold must be an integer from 1 to 98" });
    if (direction !== "over" && direction !== "under") return void res.status(400).json({ error: "direction must be over or under" });
    const stake = Math.round(stakeRaw * 1000) / 1000;
    const roll = randomInt(0, 100);
    const won = direction === "over" ? roll > threshold : roll < threshold;
    const winOutcomes = direction === "over" ? 99 - threshold : threshold;
    const multiplier = Math.round((0.97 / (winOutcomes / 100)) * 10000) / 10000;
    const payout = won ? Math.round(stake * multiplier * 1000) / 1000 : 0;
    const newBalance = await settleSingleRoundGame({ telegramId, stake, payout, won });
    if (newBalance === null) return void res.status(400).json({ error: "User not found or insufficient balance" });
    return void res.json({ ok: true, roll, threshold, direction, won, probability: winOutcomes / 100, multiplier, stake, payout, profit: Math.round((payout - stake) * 1000) / 1000, newBalance });
  } catch (error) {
    console.error("[dice/play]", error);
    return void res.status(500).json({ error: "Dice failed" });
  }
});
export default router;
