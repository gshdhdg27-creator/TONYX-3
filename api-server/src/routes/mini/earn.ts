import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, adViewsTable } from "@workspace/db/schema";
import {
  GetMiniEarnStatusParams,
  GetMiniEarnStatusResponse,
  RecordMiniAdWatchBody,
  RecordMiniAdWatchResponse,
} from "@workspace/api-zod";
import { eq, and, gte, desc } from "drizzle-orm";

const router: IRouter = Router();

const MIN_COINS = 1;
const MAX_COINS = 2;
const COOLDOWN_SECONDS = 60;
const DEDUP_SECONDS = 2;
const DAILY_LIMIT = 100;
const MINI_BLOCK_ID = "int-32141";

function randomCoins(): number {
  return Math.random() < 0.5 ? MIN_COINS : MAX_COINS;
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

  const canWatch = todayViews.length < DAILY_LIMIT && cooldownSeconds === 0;

  const data = GetMiniEarnStatusResponse.parse({
    canWatch,
    cooldownSeconds,
    adsWatchedToday: todayViews.length,
    dailyLimit: DAILY_LIMIT,
    minCoins: MIN_COINS,
    maxCoins: MAX_COINS,
  });
  res.json(data);
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
      const data = RecordMiniAdWatchResponse.parse({
        coinsEarned: 0,
        newBalance: user.coins,
        adsWatchedToday: todayViews.length,
        cooldownSeconds: Math.ceil(DEDUP_SECONDS - elapsed),
      });
      res.json(data);
      return;
    }
  }

  const coinsEarned = randomCoins();

  await db.insert(adViewsTable).values({
    telegramId: body.telegramId,
    blockId: MINI_BLOCK_ID,
    coinsEarned,
  });

  const newCoins = user.coins + coinsEarned;
  await db
    .update(usersTable)
    .set({ coins: newCoins, totalAdsWatched: user.totalAdsWatched + 1, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, body.telegramId));

  if (user.referredBy && user.referredBy !== body.telegramId) {
    const referrer = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, user.referredBy))
      .then((rows) => rows[0] ?? null);
    if (referrer && !referrer.isBlocked) {
      const bonus = Math.max(1, Math.round(coinsEarned * 0.1));
      await db
        .update(usersTable)
        .set({ coins: referrer.coins + bonus, referralEarnings: referrer.referralEarnings + bonus, updatedAt: new Date() })
        .where(eq(usersTable.telegramId, user.referredBy));
    }
  }

  const data = RecordMiniAdWatchResponse.parse({
    coinsEarned,
    newBalance: newCoins,
    adsWatchedToday: todayViews.length + 1,
    cooldownSeconds: COOLDOWN_SECONDS,
  });
  res.json(data);
});

export default router;
