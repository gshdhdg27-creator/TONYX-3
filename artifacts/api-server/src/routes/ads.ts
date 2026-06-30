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
import crypto from "crypto";

const router: IRouter = Router();

const TON_PER_AD = 0.0001;
const REFERRAL_BONUS_PERCENT = 10;
const COOLDOWN_SECONDS = 4;
const DEDUP_SECONDS = 2;
const DAILY_LIMIT = 5000;

function startOfDayTashkent(): Date {
  const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
  const nowUtc = Date.now();
  const tashkentMs = nowUtc + TASHKENT_OFFSET_MS;
  const tashkentMidnight = new Date(tashkentMs);
  tashkentMidnight.setUTCHours(0, 0, 0, 0);
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

  if (lastView) {
    const secondsSinceLast = (Date.now() - lastView.viewedAt.getTime()) / 1000;
    if (secondsSinceLast < DEDUP_SECONDS) {
      console.log(`[Ads] Duplicate reward ignored for ${body.telegramId} (${secondsSinceLast.toFixed(1)}s since last)`);
      const data = RecordAdWatchResponse.parse({
        coinsEarned: 0,
        tonEarned: 0,
        newBalance: Number(user.ton),
        adsWatchedToday: todayViews.length,
        cooldownSeconds: Math.ceil(DEDUP_SECONDS - secondsSinceLast),
        achievementsUnlocked: [],
      });
      res.json(data);
      return;
    }
  }

  const tonEarned = TON_PER_AD;

  await db.insert(adViewsTable).values({
    telegramId: body.telegramId,
    blockId: body.blockId ?? "29470",
    coinsEarned: 0,
  });

  const newTon = Number(user.ton) + tonEarned;
  const newTotalAds = user.totalAdsWatched + 1;
  await db
    .update(usersTable)
    .set({
      ton: String(newTon),
      totalAdsWatched: newTotalAds,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.telegramId, body.telegramId));

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
      unlockedAchievements.push(ach.id);
    }
  }

  if (user.referredBy && user.referredBy !== body.telegramId) {
    const referrer = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, user.referredBy))
      .then((rows) => rows[0] ?? null);
    if (referrer && !referrer.isBlocked) {
      const bonusTon = parseFloat((tonEarned * REFERRAL_BONUS_PERCENT / 100).toFixed(8));
      await db
        .update(usersTable)
        .set({
          ton: String(Number(referrer.ton) + bonusTon),
          referralEarnings: referrer.referralEarnings + 1,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.telegramId, user.referredBy));
    }
  }

  const data = RecordAdWatchResponse.parse({
    coinsEarned: 0,
    tonEarned,
    newBalance: newTon,
    adsWatchedToday: todayViews.length + 1,
    cooldownSeconds: COOLDOWN_SECONDS,
    achievementsUnlocked: unlockedAchievements,
  });
  res.json(data);
});

router.get("/adsgram-reward", async (req, res) => {
  // Verify request is from AdsGram via shared secret.
  // Set ADSGRAM_CALLBACK_SECRET in env to match your AdsGram dashboard callback secret.
  const adsgramSecret = process.env["ADSGRAM_CALLBACK_SECRET"];
  if (adsgramSecret) {
    const authHeader = req.headers["authorization"] ?? "";
    const providedSecret = String(authHeader).replace(/^Bearer\s+/i, "").trim();
    if (!providedSecret || !crypto.timingSafeEqual(
      Buffer.from(providedSecret.padEnd(64, "\0")),
      Buffer.from(adsgramSecret.padEnd(64, "\0")),
    )) {
      console.warn(`[AdsGram] Rejected callback — invalid or missing secret`);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  } else if (process.env["NODE_ENV"] === "production") {
    console.warn(`[AdsGram] ADSGRAM_CALLBACK_SECRET is not set in production — reward callback is unprotected!`);
  }

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
        res.status(200).json({ ok: false, reason: "duplicate" });
        return;
      }
    }

    const tonEarned = TON_PER_AD;

    await db.insert(adViewsTable).values({
      telegramId: userid,
      blockId: "adsgram",
      coinsEarned: 0,
    });

    const newTon = Number(user.ton) + tonEarned;
    const newTotalAds = user.totalAdsWatched + 1;
    await db
      .update(usersTable)
      .set({
        ton: String(newTon),
        totalAdsWatched: newTotalAds,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.telegramId, userid));

    const existingAchievements = await db
      .select()
      .from(userAchievementsTable)
      .where(eq(userAchievementsTable.telegramId, userid));
    const existingIds = new Set(existingAchievements.map((a) => a.achievementId));
    for (const ach of AD_ACHIEVEMENTS) {
      if (!existingIds.has(ach.id) && newTotalAds >= ach.requirement) {
        await db.insert(userAchievementsTable).values({
          telegramId: userid,
          achievementId: ach.id,
        });
      }
    }

    if (user.referredBy && user.referredBy !== userid) {
      const referrer = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.telegramId, user.referredBy))
        .then((rows) => rows[0] ?? null);
      if (referrer && !referrer.isBlocked) {
        const bonusTon = parseFloat((tonEarned * REFERRAL_BONUS_PERCENT / 100).toFixed(8));
        await db
          .update(usersTable)
          .set({
            ton: String(Number(referrer.ton) + bonusTon),
            referralEarnings: referrer.referralEarnings + 1,
            updatedAt: new Date(),
          })
          .where(eq(usersTable.telegramId, user.referredBy));
      }
    }

    console.log(`[AdsGram] Awarded ${tonEarned} TON to ${userid} (new balance: ${newTon})`);
    res.status(200).json({ ok: true, tonEarned, newBalance: newTon });
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
    minCoinsPerAd: 0,
    maxCoinsPerAd: 0,
  });
  res.json(data);
});

export default router;
