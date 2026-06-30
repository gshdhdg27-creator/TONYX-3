import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, adViewsTable } from "@workspace/db/schema";
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
const DAILY_LIMIT = 100;
const MINI_BLOCK_ID = "33819";
const REFERRAL_PCT = 0.10;

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

  const canWatch = todayViews.length < DAILY_LIMIT && cooldownSeconds === 0;

  const data = GetMiniEarnStatusResponse.parse({
    canWatch,
    cooldownSeconds,
    adsWatchedToday: todayViews.length,
    dailyLimit: DAILY_LIMIT,
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

  if (todayViews.length >= DAILY_LIMIT) {
    res.status(429).json({ error: `Daily limit of ${DAILY_LIMIT} ads reached` });
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
