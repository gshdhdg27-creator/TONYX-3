import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, userTasksTable } from "@workspace/db/schema";
import {
  GetTasksParams,
  GetTasksResponse,
  CompleteTaskBody,
  CompleteTaskResponse,
} from "@workspace/api-zod";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

const TASKS = [
  {
    id: "subscribe_channel",
    title: "Subscribe to Channel",
    description: "Subscribe to our Telegram channel to stay updated",
    reward: 50,
    type: "subscribe" as const,
    requirement: 1,
    link: "https://t.me/adsgram",
  },
  {
    id: "visit_website",
    title: "Visit Our Website",
    description: "Visit the AdsGram website",
    reward: 20,
    type: "visit" as const,
    requirement: 1,
    link: "https://adsgram.ai",
  },
  {
    id: "watch_20_ads",
    title: "Watch 20 Ads",
    description: "Watch 20 advertisements to earn a bonus",
    reward: 30,
    type: "watch_ads" as const,
    requirement: 20,
  },
  {
    id: "watch_50_ads",
    title: "Watch 50 Ads",
    description: "Watch 50 advertisements — you're on fire!",
    reward: 75,
    type: "watch_ads" as const,
    requirement: 50,
  },
  {
    id: "invite_1_friend",
    title: "Invite 1 Friend",
    description: "Invite your first friend to AdsGram",
    reward: 100,
    type: "invite_friends" as const,
    requirement: 1,
  },
  {
    id: "invite_3_friends",
    title: "Invite 3 Friends",
    description: "Invite 3 friends and get a big bonus",
    reward: 300,
    type: "invite_friends" as const,
    requirement: 3,
  },
  {
    id: "invite_10_friends",
    title: "Invite 10 Friends",
    description: "Become a top recruiter!",
    reward: 1000,
    type: "invite_friends" as const,
    requirement: 10,
  },
];

router.get("/:telegramId", async (req, res) => {
  const params = GetTasksParams.parse(req.params);

  const completedTasks = await db
    .select()
    .from(userTasksTable)
    .where(eq(userTasksTable.telegramId, params.telegramId));
  const completedIds = new Set(completedTasks.map((t) => t.taskId));

  const data = GetTasksResponse.parse({
    tasks: TASKS.map((task) => {
      const completion = completedTasks.find((c) => c.taskId === task.id);
      return {
        ...task,
        link: task.link ?? undefined,
        completed: completedIds.has(task.id),
        ...(completion ? { completedAt: completion.completedAt } : {}),
      };
    }),
  });
  res.json(data);
});

router.post("/complete", async (req, res) => {
  const body = CompleteTaskBody.parse(req.body);

  const task = TASKS.find((t) => t.id === body.taskId);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const alreadyCompleted = await db
    .select()
    .from(userTasksTable)
    .where(
      and(
        eq(userTasksTable.telegramId, body.telegramId),
        eq(userTasksTable.taskId, body.taskId)
      )
    )
    .then((rows) => rows.length > 0);

  if (alreadyCompleted) {
    res.status(400).json({ error: "Task already completed" });
    return;
  }

  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, body.telegramId))
    .then((rows) => rows[0] ?? null);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Validate requirements
  if (task.type === "watch_ads" && user.totalAdsWatched < task.requirement) {
    res.status(400).json({ error: `Need to watch ${task.requirement} ads. You've watched ${user.totalAdsWatched}.` });
    return;
  }

  if (task.type === "invite_friends") {
    const referrals = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.referredBy, body.telegramId));
    if (referrals.length < task.requirement) {
      res.status(400).json({ error: `Need to invite ${task.requirement} friends. You've invited ${referrals.length}.` });
      return;
    }
  }

  await db.insert(userTasksTable).values({
    telegramId: body.telegramId,
    taskId: body.taskId,
  });

  const newBalance = user.coins + task.reward;
  await db
    .update(usersTable)
    .set({ coins: newBalance, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, body.telegramId));

  const data = CompleteTaskResponse.parse({
    coinsEarned: task.reward,
    newBalance,
    taskTitle: task.title,
  });
  res.json(data);
});

export default router;
