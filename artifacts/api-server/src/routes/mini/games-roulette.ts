import { Router, type IRouter } from "express";
import { randomInt } from "crypto";
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";
import { settleSingleRoundGame } from "../../lib/game-balance.js";

const router: IRouter = Router();
const MIN_STAKE = 0.1;
const MAX_STAKE = 100;
const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
type BetColor = "red" | "black" | "green";
function colorOf(number: number): BetColor {
  if (number === 0) return "green";
  return RED.has(number) ? "red" : "black";
}
router.get("/info", (_req, res) => res.json({ minStake: MIN_STAKE, maxStake: MAX_STAKE, colors: ["red", "black", "green"], pockets: 37, payouts: { red: 2, black: 2, green: 36 } }));
router.post("/play", async (req, res) => {
  try {
    if (!(await isGameEnabled("roulette"))) return void res.status(403).json({ error: GAME_DISABLED_MESSAGE });
    const telegramId = String(req.body?.telegramId ?? "");
    const stakeRaw = Number(req.body?.stake);
    const betColor = String(req.body?.color ?? "") as BetColor;
    if (!telegramId) return void res.status(400).json({ error: "telegramId required" });
    if (!Number.isFinite(stakeRaw) || stakeRaw < MIN_STAKE || stakeRaw > MAX_STAKE) return void res.status(400).json({ error: "Invalid stake" });
    if (!["red", "black", "green"].includes(betColor)) return void res.status(400).json({ error: "Invalid color" });
    const stake = Math.round(stakeRaw * 1000) / 1000;
    const number = randomInt(0, 37);
    const resultColor = colorOf(number);
    const won = resultColor === betColor;
    const multiplier = betColor === "green" ? 36 : 2;
    const payout = won ? Math.round(stake * multiplier * 1000) / 1000 : 0;
    const newBalance = await settleSingleRoundGame({ telegramId, stake, payout, won });
    if (newBalance === null) return void res.status(400).json({ error: "User not found or insufficient balance" });
    return void res.json({ ok: true, number, resultColor, betColor, won, multiplier, stake, payout, profit: Math.round((payout - stake) * 1000) / 1000, newBalance });
  } catch (error) {
    console.error("[roulette/play]", error);
    return void res.status(500).json({ error: "Roulette failed" });
  }
});
export default router;
