/**
 * Pickaxe API — Craft & Drop mechanics
 * tiers: wood 100 / iron 150 / gold 200 / diamond 400
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";

const router: IRouter = Router();
const MIN_BET = 0.1;
const MAX_BET = 500;
const HOUSE = 0.08;

const TIER_HP = { wood: 100, iron: 150, gold: 200, diamond: 400 } as const;
type PickTier = keyof typeof TIER_HP;

const BASE_MULT = { wood: 0.35, iron: 0.55, gold: 0.85, diamond: 1.35 } as const;

const historyByUser = new Map<
  string,
  Array<{ id: string; bet: number; tier: PickTier | null; payout: number; net: number; at: string }>
>();

router.get("/info", (_req, res) => {
  res.json({ minBet: MIN_BET, maxBet: MAX_BET, houseEdge: HOUSE, tiers: TIER_HP });
});

router.get("/history", (req, res) => {
  const telegramId = String(req.query.telegramId ?? "");
  res.json({ items: historyByUser.get(telegramId) ?? [] });
});

router.post("/play", async (req, res) => {
  try {
    const on = await isGameEnabled("pickaxe").catch(() => true);
    if (on === false) {
      res.status(403).json({ error: GAME_DISABLED_MESSAGE });
      return;
    }
    const telegramId = String(req.body?.telegramId ?? "");
    const betIn = Number(req.body?.bet);
    if (!telegramId) {
      res.status(400).json({ error: "telegramId required" });
      return;
    }
    if (!Number.isFinite(betIn) || betIn < MIN_BET || betIn > MAX_BET) {
      res.status(400).json({ error: `Ставка от ${MIN_BET} до ${MAX_BET} TON` });
      return;
    }
    const bet = Math.round(betIn * 1000) / 1000;
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
    if (bal < bet) {
      res.status(400).json({ error: "Недостаточно TON" });
      return;
    }
    const afterBet = Math.round((bal - bet) * 1000) / 1000;
    await db
      .update(usersTable)
      .set({ ton: String(afterBet), updatedAt: new Date() })
      .where(eq(usersTable.telegramId, telegramId));

    const seed = randomBytes(32);
    const roll = seed.readUInt32BE(0) / 0x100000000;
    let tier: PickTier | null = null;
    if (roll < 0.12) tier = null;
    else if (roll < 0.42) tier = "wood";
    else if (roll < 0.68) tier = "iron";
    else if (roll < 0.86) tier = "gold";
    else tier = "diamond";

    const playId = seed.toString("hex").slice(0, 16);
    const serverSeed = seed.toString("hex");
    const serverSeedHash = createHash("sha256").update(seed).digest("hex");

    if (!tier) {
      const row = { id: playId, bet, tier: null, payout: 0, net: -bet, at: new Date().toISOString() };
      const list = historyByUser.get(telegramId) ?? [];
      list.unshift(row);
      historyByUser.set(telegramId, list.slice(0, 30));
      res.json({
        ok: true,
        playId,
        bet,
        tier: null,
        payout: 0,
        net: -bet,
        balance: afterBet,
        col: 2,
        events: [],
        blocks: [],
        finalTier: null,
        serverSeed,
        serverSeedHash,
      });
      return;
    }

    const baseMult = BASE_MULT[tier];
    const variance = 0.5 + seed.readUInt32BE(4) / 0x100000000;
    const payout = Math.round(bet * baseMult * variance * 1000) / 1000;
    const balance = Math.round((afterBet + payout) * 1000) / 1000;
    await db
      .update(usersTable)
      .set({ ton: String(balance), updatedAt: new Date() })
      .where(eq(usersTable.telegramId, telegramId));
    const net = Math.round((payout - bet) * 1000) / 1000;
    const row = { id: playId, bet, tier, payout, net, at: new Date().toISOString() };
    const list = historyByUser.get(telegramId) ?? [];
    list.unshift(row);
    historyByUser.set(telegramId, list.slice(0, 30));

    res.json({
      ok: true,
      playId,
      bet,
      tier,
      finalTier: tier,
      hp: TIER_HP[tier],
      payout,
      net,
      balance,
      col: 2,
      events: [{ type: "start", tier, hp: TIER_HP[tier] }],
      blocks: [],
      serverSeed,
      serverSeedHash,
    });
  } catch (e: any) {
    console.error("[pickaxe/play]", e);
    res.status(500).json({ error: e?.message ?? "Play failed" });
  }
});

export default router;
