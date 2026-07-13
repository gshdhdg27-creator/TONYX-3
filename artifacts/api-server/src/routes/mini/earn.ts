import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, adViewsTable, systemSettingsTable } from "@workspace/db/schema";
import {
  GetMiniEarnStatusParams,
  GetMiniEarnStatusResponse,
  RecordMiniAdWatchBody,
} from "@workspace/api-zod";
import { eq, and, gte, desc } from "drizzle-orm";

const router: IRouter = Router();

const DEFAULT_REWARD_TON   = 0.0001;
const DEFAULT_REWARD_TONYX = 0;
const COOLDOWN_SECONDS = 60;
const DEDUP_SECONDS = 2;
const DEFAULT_DAILY_LIMIT = 100;
const DEFAULT_RESET_HOURS = 24;
const MINI_BLOCK_ID = "33819";
const REFERRAL_PCT = 0.10;

/**
 * Admin-configured ad settings (Игра → Реклама). Only TON/TONYX are ever paid out —
 * there is no separate "points" currency in this app.
 */
async function getAdConfig(): Promise<{ rewardTon: number; rewardTonyx: number; dailyLimit: number; resetHours: number }> {
  const rows = await db.select().from(systemSettingsTable);
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;
  const rewardTon   = parseFloat(s["ad_reward_ton"] ?? "");
  const rewardTonyx = parseFloat(s["ad_reward_tonyx"] ?? "");
  const dailyLimit  = parseInt(s["ad_daily_limit"] ?? "");
  const resetHours  = parseFloat(s["ad_reset_hours"] ?? "");
  return {
    rewardTon:   Number.isFinite(rewardTon)   && rewardTon   >= 0 ? rewardTon   : DEFAULT_REWARD_TON,
    rewardTonyx: Number.isFinite(rewardTonyx) && rewardTonyx >= 0 ? rewardTonyx : DEFAULT_REWARD_TONYX,
    dailyLimit:  Number.isFinite(dailyLimit)  && dailyLimit  > 0  ? dailyLimit  : DEFAULT_DAILY_LIMIT,
    resetHours:  Number.isFinite(resetHours)  && resetHours  > 0  ? resetHours  : DEFAULT_RESET_HOURS,
  };
}

/** Sliding window start: `resetHours` ago, instead of a fixed UTC-midnight boundary — so admin-configured reset periods (e.g. "10 ads, then wait 2h") work. */
function windowStart(resetHours: number): Date {
  return new Date(Date.now() - resetHours * 60 * 60 * 1000);
}

router.get("/status/:telegramId", async (req, res) => {
  const { telegramId } = GetMiniEarnStatusParams.parse(req.params);
  const cfg = await getAdConfig();

  const windowViews = await db
    .select()
    .from(adViewsTable)
    .where(
      and(
        eq(adViewsTable.telegramId, telegramId),
        gte(adViewsTable.viewedAt, windowStart(cfg.resetHours)),
        eq(adViewsTable.blockId, MINI_BLOCK_ID)
      )
    );

  const lastView = await db
    .select()
    .from(adViewsTable)
    .where(and(eq(adViewsTable.telegramId, telegramId), eq(adViewsTable.blockId, MINI_BLOCK_ID)))
    .orderBy(desc(adViewsTable.viewedAt))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  let cooldownSeconds = 0;
  if (lastView) {
    const elapsed = (Date.now() - lastView.viewedAt.getTime()) / 1000;
    if (elapsed < COOLDOWN_SECONDS) {
      cooldownSeconds = Math.ceil(COOLDOWN_SECONDS - elapsed);
    }
  }

  const canWatch = windowViews.length < cfg.dailyLimit && cooldownSeconds === 0;

  const data = GetMiniEarnStatusResponse.parse({
    canWatch,
    cooldownSeconds,
    adsWatchedToday: windowViews.length,
    dailyLimit: cfg.dailyLimit,
    minCoins: 0,
    maxCoins: 0,
  });
  res.json({ ...data, minTon: cfg.rewardTon, maxTon: cfg.rewardTon, rewardTonyx: cfg.rewardTonyx });
});

router.post("/watch", async (req, res) => {
  const body = RecordMiniAdWatchBody.parse(req.body);

  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, body.telegramId))
    .then((rows) => rows[0] ?? null);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.isBlocked) {
    res.status(403).json({ error: "Account is blocked" });
    return;
  }

  const cfg = await getAdConfig();

  const windowViews = await db
    .select()
    .from(adViewsTable)
    .where(
      and(
        eq(adViewsTable.telegramId, body.telegramId),
        gte(adViewsTable.viewedAt, windowStart(cfg.resetHours)),
        eq(adViewsTable.blockId, MINI_BLOCK_ID)
      )
    );

  if (windowViews.length >= cfg.dailyLimit) {
    res.status(429).json({ error: `Daily limit of ${cfg.dailyLimit} ads reached` });
    return;
  }

  const lastView = await db
    .select()
    .from(adViewsTable)
    .where(and(eq(adViewsTable.telegramId, body.telegramId), eq(adViewsTable.blockId, MINI_BLOCK_ID)))
    .orderBy(desc(adViewsTable.viewedAt))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (lastView) {
    const elapsed = (Date.now() - lastView.viewedAt.getTime()) / 1000;
    if (elapsed < DEDUP_SECONDS) {
      res.json({
        tonEarned: 0,
        tonyxEarned: 0,
        coinsEarned: 0,
        newBalance: Number(user.ton),
        adsWatchedToday: windowViews.length,
        cooldownSeconds: Math.ceil(DEDUP_SECONDS - elapsed),
      });
      return;
    }
  }

  const tonEarned   = cfg.rewardTon;
  const tonyxEarned = cfg.rewardTonyx;
  const newTon   = Number(user.ton) + tonEarned;
  const newTonyx = user.tonyxCoins + tonyxEarned;

  await db.insert(adViewsTable).values({
    telegramId: body.telegramId,
    blockId: MINI_BLOCK_ID,
    coinsEarned: 0,
    tonEarned: String(tonEarned),
  });

  await db
    .update(usersTable)
    .set({ ton: String(newTon), tonyxCoins: newTonyx, totalAdsWatched: user.totalAdsWatched + 1, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, body.telegramId));

  if (user.referredBy && user.referredBy !== body.telegramId) {
    const referrer = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, user.referredBy))
      .then((rows) => rows[0] ?? null);
    if (referrer && !referrer.isBlocked) {
      const bonus = tonEarned * REFERRAL_PCT;
      const newReferrerTon = Number(referrer.ton) + bonus;
      await db
        .update(usersTable)
        .set({ ton: String(newReferrerTon), referralEarnings: referrer.referralEarnings + 1, updatedAt: new Date() })
        .where(eq(usersTable.telegramId, user.referredBy));
    }
  }

  res.json({
    tonEarned,
    tonyxEarned,
    coinsEarned: 0,
    newBalance: newTon,
    adsWatchedToday: windowViews.length + 1,
    cooldownSeconds: COOLDOWN_SECONDS,
  });
});

export default router;
