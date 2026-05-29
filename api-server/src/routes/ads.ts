import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, adViewsTable, userAchievementsTable } from "@workspace/db/schema";
import {
  RecordAdWatchBody,
  RecordAdWatchResponse,
  GetAdStatusParams,
  GetAdStatusResponse,
} from "@workspace/api-zod";
import { eq, and, gte, desc } from "drizzle-orm";

const router: IRouter = Router();

const COINS_PER_AD = 1;
const REFERRAL_BONUS_PERCENT = 10;
const COOLDOWN_SECONDS = 4;      // для UI-статуса (кнопка кулдаун)
const DEDUP_SECONDS = 2;         // только дедупликация в /watch (не блокирует реальные награды)
const DAILY_LIMIT = 5000;

function randomCoins(): number {
  return COINS_PER_AD;
}

// Полночь по ташкентскому времени (UTC+5)
function startOfDayTashkent(): Date {
  const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
  const nowUtc = Date.now();
  const tashkentMs = nowUtc + TASHKENT_OFFSET_MS;
  const tashkentMidnight = new Date(tashkentMs);
  tashkentMidnight.setUTCHours(0, 0, 0, 0);
  // Сдвигаем обратно в UTC для сравнения с полем viewedAt (хранится в UTC)
  return new Date(tashkentMidnight.getTime() - TASHKENT_OFFSET_MS);
}

function startOfDay(): Date {
  return startOfDayTashkent();
}

const AD_ACHIEVEMENTS = [
  { id: "watch_10", requirement: 10, reward: 20 },
  { id: "watch_100", requirement: 100, reward: 100 },
  { id: "watch_1000", requirement: 1000, reward: 1000 },
];

router.post("/watch", async (req, res) => {
  const body = RecordAdWatchBody.parse(req.body);

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
    res.status(403).json({ error: "Account is blocked due to suspicious activity" });
    return;
  }

  const todayViews = await db
    .select()
    .from(adViewsTable)
    .where(
      and(
        eq(adViewsTable.telegramId, body.telegramId),
        gte(adViewsTable.viewedAt, startOfDay())
      )
    );

  if (todayViews.length >= DAILY_LIMIT) {
    res.status(429).json({ error: `Daily limit of ${DAILY_LIMIT} ads reached. Come back tomorrow!` });
    return;
  }

  const lastView = await db
    .select()
    .from(adViewsTable)
    .where(eq(adViewsTable.telegramId, body.telegramId))
    .orderBy(desc(adViewsTable.viewedAt))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  // Только дедупликация: отклоняем только полный дубликат в течение 2 секунд
  // (не блокируем реальные награды от AdsGram — cooldown для UI, не для записи)
  if (lastView) {
    const secondsSinceLast = (Date.now() - lastView.viewedAt.getTime()) / 1000;
    if (secondsSinceLast < DEDUP_SECONDS) {
      console.log(`[Ads] Duplicate reward ignored for ${body.telegramId} (${secondsSinceLast.toFixed(1)}s since last)`);
      // Возвращаем 200 (не ошибку), чтобы клиент не терял событие
      const data = RecordAdWatchResponse.parse({
        coinsEarned: 0,
        newBalance: user.coins,
        adsWatchedToday: todayViews.length,
        cooldownSeconds: Math.ceil(DEDUP_SECONDS - secondsSinceLast),
        achievementsUnlocked: [],
      });
      res.json(data);
      return;
    }
  }

  const coinsEarned = randomCoins();

  await db.insert(adViewsTable).values({
    telegramId: body.telegramId,
    blockId: body.blockId ?? "29470",
    coinsEarned,
  });

  const newCoins = user.coins + coinsEarned;
  const newTotalAds = user.totalAdsWatched + 1;
  await db
    .update(usersTable)
    .set({
      coins: newCoins,
      totalAdsWatched: newTotalAds,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.telegramId, body.telegramId));

  // Check and award ad-watching achievements
  const unlockedAchievements: string[] = [];
  const existingAchievements = await db
    .select()
    .from(userAchievementsTable)
    .where(eq(userAchievementsTable.telegramId, body.telegramId));
  const existingIds = new Set(existingAchievements.map((a) => a.achievementId));

  for (const ach of AD_ACHIEVEMENTS) {
    if (!existingIds.has(ach.id) && newTotalAds >= ach.requirement) {
      await db.insert(userAchievementsTable).values({
        telegramId: body.telegramId,
        achievementId: ach.id,
      });
      await db
        .update(usersTable)
        .set({ coins: newCoins + ach.reward })
        .where(eq(usersTable.telegramId, body.telegramId));
      unlockedAchievements.push(ach.id);
    }
  }

  // Award referral bonus (10% of coins earned, min 1)
  if (user.referredBy && user.referredBy !== body.telegramId) {
    const referrer = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, user.referredBy))
      .then((rows) => rows[0] ?? null);
    if (referrer && !referrer.isBlocked) {
      const bonus = Math.max(1, Math.round(coinsEarned * REFERRAL_BONUS_PERCENT / 100));
      await db
        .update(usersTable)
        .set({
          coins: referrer.coins + bonus,
          referralEarnings: referrer.referralEarnings + bonus,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.telegramId, user.referredBy));
    }
  }

  const data = RecordAdWatchResponse.parse({
    coinsEarned,
    newBalance: newCoins,
    adsWatchedToday: todayViews.length + 1,
    cooldownSeconds: COOLDOWN_SECONDS,
    achievementsUnlocked: unlockedAchievements,
  });
  res.json(data);
});

// ── AdsGram Server-Side Reward callback ─────────────────────────────────────
// AdsGram calls this URL with `?userid=<telegramId>` after a verified ad watch.
// We must respond 200 OK on success (or the SDK will retry).
router.get("/adsgram-reward", async (req, res) => {
  const userid = String(req.query.userid ?? "").trim();
  if (!userid) {
    res.status(400).json({ error: "Missing userid" });
    return;
  }

  console.log(`[AdsGram] Reward callback received for userid=${userid}`);

  try {
    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, userid))
      .then((rows) => rows[0] ?? null);

    if (!user) {
      console.warn(`[AdsGram] User not found: ${userid}`);
      res.status(200).json({ ok: false, reason: "user_not_found" });
      return;
    }

    if (user.isBlocked) {
      res.status(200).json({ ok: false, reason: "blocked" });
      return;
    }

    // Daily limit
    const todayViews = await db
      .select()
      .from(adViewsTable)
      .where(
        and(
          eq(adViewsTable.telegramId, userid),
          gte(adViewsTable.viewedAt, startOfDay())
        )
      );
    if (todayViews.length >= DAILY_LIMIT) {
      res.status(200).json({ ok: false, reason: "daily_limit" });
      return;
    }

    // Cooldown protection (prevents double-award if AdsGram retries)
    const lastView = await db
      .select()
      .from(adViewsTable)
      .where(eq(adViewsTable.telegramId, userid))
      .orderBy(desc(adViewsTable.viewedAt))
      .limit(1)
      .then((rows) => rows[0] ?? null);
    if (lastView) {
      const secondsSince = (Date.now() - lastView.viewedAt.getTime()) / 1000;
      if (secondsSince < 5) {
        // Same callback retried within 5s — already credited
        res.status(200).json({ ok: false, reason: "duplicate" });
        return;
      }
    }

    const coinsEarned = randomCoins();

    await db.insert(adViewsTable).values({
      telegramId: userid,
      blockId: "adsgram",
      coinsEarned,
    });

    const newCoins = user.coins + coinsEarned;
    const newTotalAds = user.totalAdsWatched + 1;
    await db
      .update(usersTable)
      .set({
        coins: newCoins,
        totalAdsWatched: newTotalAds,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.telegramId, userid));

    // Achievements
    const existingAchievements = await db
      .select()
      .from(userAchievementsTable)
      .where(eq(userAchievementsTable.telegramId, userid));
    const existingIds = new Set(existingAchievements.map((a) => a.achievementId));
    let bonusFromAchievements = 0;
    for (const ach of AD_ACHIEVEMENTS) {
      if (!existingIds.has(ach.id) && newTotalAds >= ach.requirement) {
        await db.insert(userAchievementsTable).values({
          telegramId: userid,
          achievementId: ach.id,
        });
        bonusFromAchievements += ach.reward;
      }
    }
    if (bonusFromAchievements > 0) {
      await db
        .update(usersTable)
        .set({ coins: newCoins + bonusFromAchievements })
        .where(eq(usersTable.telegramId, userid));
    }

    // Referral bonus
    if (user.referredBy && user.referredBy !== userid) {
      const referrer = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.telegramId, user.referredBy))
        .then((rows) => rows[0] ?? null);
      if (referrer && !referrer.isBlocked) {
        const bonus = Math.max(1, Math.round(coinsEarned * REFERRAL_BONUS_PERCENT / 100));
        await db
          .update(usersTable)
          .set({
            coins: referrer.coins + bonus,
            referralEarnings: referrer.referralEarnings + bonus,
            updatedAt: new Date(),
          })
          .where(eq(usersTable.telegramId, user.referredBy));
      }
    }

    console.log(`[AdsGram] Awarded ${coinsEarned} coins to ${userid} (new balance: ${newCoins + bonusFromAchievements})`);
    res.status(200).json({ ok: true, coinsEarned, newBalance: newCoins + bonusFromAchievements });
  } catch (err) {
    console.error("[AdsGram] Callback error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/status/:telegramId", async (req, res) => {
  const params = GetAdStatusParams.parse(req.params);

  const todayViews = await db
    .select()
    .from(adViewsTable)
    .where(
      and(
        eq(adViewsTable.telegramId, params.telegramId),
        gte(adViewsTable.viewedAt, startOfDay())
      )
    );

  const lastView = await db
    .select()
    .from(adViewsTable)
    .where(eq(adViewsTable.telegramId, params.telegramId))
    .orderBy(desc(adViewsTable.viewedAt))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  let cooldownSeconds = 0;
  if (lastView) {
    const secondsSinceLast = (Date.now() - lastView.viewedAt.getTime()) / 1000;
    if (secondsSinceLast < COOLDOWN_SECONDS) {
      cooldownSeconds = Math.ceil(COOLDOWN_SECONDS - secondsSinceLast);
    }
  }

  const canWatch = todayViews.length < DAILY_LIMIT && cooldownSeconds === 0;

  const data = GetAdStatusResponse.parse({
    canWatch,
    cooldownSeconds,
    adsWatchedToday: todayViews.length,
    dailyLimit: DAILY_LIMIT,
    minCoinsPerAd: COINS_PER_AD,
    maxCoinsPerAd: COINS_PER_AD,
  });
  res.json(data);
});

export default router;
