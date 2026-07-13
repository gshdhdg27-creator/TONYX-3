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

const TON_PER_AD = 0.0001;
const COOLDOWN_SECONDS = 60;
const DEDUP_SECONDS = 2;
const DEFAULT_DAILY_LIMIT = 100;
const MINI_BLOCK_ID = "33819";
const REFERRAL_PCT = 0.10;

/** Admin-configured daily ad-watch cap (Игра → Реклама → "Дневной лимит"); falls back to 100 when unset. */
async function getAdDailyLimit(): Promise<number> {
  const row = await db.select().from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "ad_daily_limit")).then(r => r[0] ?? null);
  const parsed = row ? parseInt(row.value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_LIMIT;
}

function startOfDayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

router.get("/status/:telegramId", async (req, res) => {
  const { telegramId } = GetMiniEarnStatusParams.parse(req.params);

  const todayViews = await db
    .select()
    .from(adViewsTable)
    .where(
      and(
        eq(adViewsTable.telegramId, telegramId),
        gte(adViewsTable.viewedAt, startOfDayUtc()),
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

  const dailyLimit = await getAdDailyLimit();
  const canWatch = todayViews.length < dailyLimit && cooldownSeconds === 0;

  const data = GetMiniEarnStatusResponse.parse({
    canWatch,
    cooldownSeconds,
    adsWatchedToday: todayViews.length,
    dailyLimit,
    minCoins: 0,
    maxCoins: 0,
  });
  res.json({ ...data, minTon: TON_PER_AD, maxTon: TON_PER_AD });
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

  const todayViews = await db
    .select()
    .from(adViewsTable)
    .where(
      and(
        eq(adViewsTable.telegramId, body.telegramId),
        gte(adViewsTable.viewedAt, startOfDayUtc()),
        eq(adViewsTable.blockId, MINI_BLOCK_ID)
      )
    );

  const dailyLimit = await getAdDailyLimit();
  if (todayViews.length >= dailyLimit) {
    res.status(429).json({ error: `Daily limit of ${dailyLimit} ads reached` });
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
        coinsEarned: 0,
        newBalance: Number(user.ton),
        adsWatchedToday: todayViews.length,
        cooldownSeconds: Math.ceil(DEDUP_SECONDS - elapsed),
      });
      return;
    }
  }

  const tonEarned = TON_PER_AD;
  const newTon = Number(user.ton) + tonEarned;

  await db.insert(adViewsTable).values({
    telegramId: body.telegramId,
    blockId: MINI_BLOCK_ID,
    coinsEarned: 0,
    tonEarned: String(tonEarned),
  });

  await db
    .update(usersTable)
    .set({ ton: String(newTon), totalAdsWatched: user.totalAdsWatched + 1, updatedAt: new Date() })
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
    coinsEarned: 0,
    newBalance: newTon,
    adsWatchedToday: todayViews.length + 1,
    cooldownSeconds: COOLDOWN_SECONDS,
  });
});

export default router;
