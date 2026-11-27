import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";
import { settleSingleRoundGame } from "../../lib/game-balance.js";

const router: IRouter = Router();
const MIN_STAKE = 0.1;
const MULTIPLIER = 1.92;
export type CoinSide = "heads" | "tails";
function rollSide(): CoinSide {
  return (randomBytes(1)[0]! & 1) === 0 ? "heads" : "tails";
}
router.get("/info", (_req, res) => res.json({ multiplier: MULTIPLIER, minStake: MIN_STAKE, sides: ["heads", "tails"] }));
router.post("/play", async (req, res) => {
  try {
    if (!(await isGameEnabled("coin"))) return void res.status(403).json({ error: GAME_DISABLED_MESSAGE });
    const telegramId = String(req.body?.telegramId ?? "");
    const stakeRaw = Number(req.body?.stake);
    const side = String(req.body?.side ?? "") as CoinSide;
    if (!telegramId) return void res.status(400).json({ error: "telegramId required" });
    if (!Number.isFinite(stakeRaw) || stakeRaw < MIN_STAKE || stakeRaw > 100) return void res.status(400).json({ error: "Stake must be between 0.1 and 100 TON" });
    if (side !== "heads" && side !== "tails") return void res.status(400).json({ error: "side must be heads or tails" });
    const stake = Math.round(stakeRaw * 1000) / 1000;
    const result = rollSide();
    const won = result === side;
    const payout = won ? Math.round(stake * MULTIPLIER * 1000) / 1000 : 0;
    const newBalance = await settleSingleRoundGame({ telegramId, stake, payout, won });
    if (newBalance === null) return void res.status(400).json({ error: "User not found or insufficient balance" });
    return void res.json({ ok: true, side, result, won, stake, multiplier: MULTIPLIER, payout, profit: Math.round((payout - stake) * 1000) / 1000, newBalance });
  } catch (error) {
    console.error("[coin/play]", error);
    return void res.status(500).json({ error: "Coin flip failed" });
  }
});
export default router;
