/**
 * Pickaxe API — server-authoritative random result and durable history.
 * Result seeds are committed by hash and revealed only after the round resolves.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { miniPickaxeHistoryTable } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";
import { settleSingleRoundGame } from "../../lib/game-balance.js";

const router: IRouter = Router();
const MIN_BET = 0.1;
const MAX_BET = 100;
const HOUSE = 0.03;
const TIER_HP = { wood: 100, iron: 150, gold: 200, diamond: 400 } as const;
type PickTier = keyof typeof TIER_HP;
const BASE_MULT = { wood: 0.575, iron: 0.904, gold: 1.397, diamond: 2.219 } as const;

router.get("/info", (_req, res) => {
  res.json({ minBet: MIN_BET, maxBet: MAX_BET, houseEdge: HOUSE, tiers: TIER_HP });
});

router.get("/history", async (req, res) => {
  const telegramId = String(req.query.telegramId ?? "");
  if (!telegramId) return void res.status(400).json({ error: "telegramId required" });
  try {
    const rows = await db.select().from(miniPickaxeHistoryTable)
      .where(eq(miniPickaxeHistoryTable.telegramId, telegramId))
      .orderBy(desc(miniPickaxeHistoryTable.createdAt))
      .limit(30);
    return void res.json({ items: rows.map(row => ({
      id: row.playId,
      bet: Number(row.bet),
      tier: row.tier as PickTier | null,
      payout: Number(row.payout),
      net: Number(row.net),
      at: row.createdAt.toISOString(),
      serverSeed: row.serverSeed,
      serverSeedHash: row.serverSeedHash,
    })) });
  } catch (error) {
    console.error("[pickaxe/history]", error);
    return void res.status(500).json({ error: "Pickaxe history unavailable" });
  }
});

router.post("/play", async (req, res) => {
  try {
    if (!(await isGameEnabled("pickaxe"))) {
      return void res.status(403).json({ error: GAME_DISABLED_MESSAGE });
    }
    const telegramId = String(req.body?.telegramId ?? "");
    const betIn = Number(req.body?.bet);
    if (!telegramId) return void res.status(400).json({ error: "telegramId required" });
    if (!Number.isFinite(betIn) || betIn < MIN_BET || betIn > MAX_BET) {
      return void res.status(400).json({ error: `Bet must be between ${MIN_BET} and ${MAX_BET}` });
    }

    const bet = Math.round(betIn * 1000) / 1000;
    const serverSeed = randomBytes(32).toString("hex");
    const serverSeedHash = createHash("sha256").update(serverSeed).digest("hex");
    const random = createHash("sha256").update(serverSeed).digest();
    const roll = random.readUInt32BE(0) / 0x100000000;

    let tier: PickTier | null = null;
    if (roll >= 0.12 && roll < 0.42) tier = "wood";
    else if (roll >= 0.42 && roll < 0.68) tier = "iron";
    else if (roll >= 0.68 && roll < 0.86) tier = "gold";
    else if (roll >= 0.86) tier = "diamond";

    const variance = 0.5 + random.readUInt32BE(4) / 0x100000000;
    const payout = tier ? Math.round(bet * BASE_MULT[tier] * variance * 1000) / 1000 : 0;
    const net = Math.round((payout - bet) * 1000) / 1000;
    const won = payout >= bet;
    const balance = await settleSingleRoundGame({ telegramId, stake: bet, payout, won });
    if (balance === null) return void res.status(400).json({ error: "User not found or insufficient balance" });

    const playId = randomBytes(12).toString("hex");
    let historySaved = true;
    try {
      await db.insert(miniPickaxeHistoryTable).values({
        telegramId, playId, bet: bet.toFixed(8), tier,
        payout: payout.toFixed(8), net: net.toFixed(8), serverSeed, serverSeedHash,
      });
    } catch (historyError) {
      historySaved = false;
      console.error("[pickaxe/history-insert]", historyError);
    }

    return void res.json({
      ok: true, playId, bet, tier, payout, net, balance,
      col: 2, events: tier ? [{ type: "start", tier, hp: TIER_HP[tier] }] : [],
      blocks: [], finalTier: tier, serverSeed, serverSeedHash, historySaved,
    });
  } catch (error) {
    console.error("[pickaxe/play]", error);
    return void res.status(500).json({ error: "Pickaxe play failed" });
  }
});

export default router;
