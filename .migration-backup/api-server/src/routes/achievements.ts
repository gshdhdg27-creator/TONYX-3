import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, userAchievementsTable } from "@workspace/db/schema";
import {
  GetAchievementsParams,
  GetAchievementsResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const ACHIEVEMENTS = [
  {
    id: "watch_10",
    title: "Beginner",
    description: "Watch 10 ads",
    reward: 20,
    icon: "🌱",
    requirement: 10,
    type: "watch_ads" as const,
  },
  {
    id: "watch_100",
    title: "Active Viewer",
    description: "Watch 100 ads",
    reward: 100,
    icon: "🔥",
    requirement: 100,
    type: "watch_ads" as const,
  },
  {
    id: "watch_1000",
    title: "Ad Master",
    description: "Watch 1000 ads",
    reward: 1000,
    icon: "👑",
    requirement: 1000,
    type: "watch_ads" as const,
  },
  {
    id: "invite_10",
    title: "Recruiter",
    description: "Invite 10 friends",
    reward: 500,
    icon: "🤝",
    requirement: 10,
    type: "invite_friends" as const,
  },
  {
    id: "earn_100_coins",
    title: "Coin Collector",
    description: "Earn 100 coins total",
    reward: 50,
    icon: "🪙",
    requirement: 100,
    type: "earn_coins" as const,
  },
  {
    id: "earn_1000_coins",
    title: "Coin Hoarder",
    description: "Earn 1000 coins total",
    reward: 200,
    icon: "💎",
    requirement: 1000,
    type: "earn_coins" as const,
  },
];

router.get("/:telegramId", async (req, res) => {
  const params = GetAchievementsParams.parse(req.params);

  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, params.telegramId))
    .then((rows) => rows[0] ?? null);

  const unlockedAchievements = await db
    .select()
    .from(userAchievementsTable)
    .where(eq(userAchievementsTable.telegramId, params.telegramId));
  const unlockedMap = new Map(unlockedAchievements.map((a) => [a.achievementId, a]));

  const referralCount = user
    ? await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.referredBy, params.telegramId))
        .then((rows) => rows.length)
    : 0;

  const data = GetAchievementsResponse.parse({
    achievements: ACHIEVEMENTS.map((ach) => {
      const unlock = unlockedMap.get(ach.id);
      let progress = 0;
      if (user) {
        if (ach.type === "watch_ads") progress = Math.min(user.totalAdsWatched, ach.requirement);
        else if (ach.type === "invite_friends") progress = Math.min(referralCount, ach.requirement);
        else if (ach.type === "earn_coins") progress = Math.min(user.coins + (user.referralEarnings ?? 0), ach.requirement);
      }
      return {
        ...ach,
        unlocked: !!unlock,
        progress,
        ...(unlock ? { unlockedAt: unlock.unlockedAt } : {}),
      };
    }),
  });
  res.json(data);
});

export default router;
