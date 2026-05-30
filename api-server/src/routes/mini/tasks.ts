import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniTasksTable, miniTaskCompletionsTable } from "@workspace/db/schema";
import {
  GetMiniTasksParams,
  GetMiniTasksResponse,
  CreateMiniTaskBody,
  CreateMiniTaskResponse,
  CompleteMiniTaskParams,
  CompleteMiniTaskBody,
  CompleteMiniTaskResponse,
} from "@workspace/api-zod";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/:telegramId", async (req, res) => {
  const { telegramId } = GetMiniTasksParams.parse(req.params);

  const [tasks, completions] = await Promise.all([
    db.select().from(miniTasksTable).where(eq(miniTasksTable.isActive, "true")).orderBy(miniTasksTable.createdAt),
    db.select().from(miniTaskCompletionsTable).where(eq(miniTaskCompletionsTable.telegramId, telegramId)),
  ]);

  const completedSet = new Set(completions.map((c) => c.taskId));

  const formatted = tasks.map((t) => {
    const comp = completions.find((c) => c.taskId === t.id);
    return {
      id: t.id,
      ownerId: t.ownerId ?? null,
      title: t.title,
      description: t.description ?? null,
      type: t.type,
      link: t.link ?? null,
      reward: t.reward,
      completed: completedSet.has(t.id),
      completedAt: comp?.completedAt.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    };
  });

  const data = GetMiniTasksResponse.parse({ tasks: formatted });
  res.json(data);
});

router.post("/", async (req, res) => {
  const body = CreateMiniTaskBody.parse(req.body);

  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, body.telegramId)).then((r) => r[0] ?? null);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [task] = await db
    .insert(miniTasksTable)
    .values({
      ownerId: body.telegramId,
      title: body.title,
      description: body.description ?? null,
      type: body.type,
      link: body.link ?? null,
      reward: body.reward,
    })
    .returning();

  const data = CreateMiniTaskResponse.parse({
    id: task.id,
    ownerId: task.ownerId ?? null,
    title: task.title,
    description: task.description ?? null,
    type: task.type,
    link: task.link ?? null,
    reward: task.reward,
    completed: false,
    completedAt: null,
    createdAt: task.createdAt.toISOString(),
  });
  res.json(data);
});

router.post("/:id/complete", async (req, res) => {
  const { id } = CompleteMiniTaskParams.parse({ id: parseInt(req.params.id) });
  const body = CompleteMiniTaskBody.parse(req.body);

  const [task, user] = await Promise.all([
    db.select().from(miniTasksTable).where(eq(miniTasksTable.id, id)).then((r) => r[0] ?? null),
    db.select().from(usersTable).where(eq(usersTable.telegramId, body.telegramId)).then((r) => r[0] ?? null),
  ]);

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const existing = await db
    .select()
    .from(miniTaskCompletionsTable)
    .where(and(eq(miniTaskCompletionsTable.taskId, id), eq(miniTaskCompletionsTable.telegramId, body.telegramId)))
    .then((r) => r[0] ?? null);

  if (existing) {
    res.status(400).json({ error: "Task already completed" });
    return;
  }

  await db.insert(miniTaskCompletionsTable).values({ taskId: id, telegramId: body.telegramId });

  const newBalance = user.coins + task.reward;
  await db.update(usersTable).set({ coins: newBalance, updatedAt: new Date() }).where(eq(usersTable.telegramId, body.telegramId));

  // Referral 10%: award bonus to the user who invited this user
  if (user.referredBy && user.referredBy !== body.telegramId) {
    const referrer = await db.select().from(usersTable)
      .where(eq(usersTable.telegramId, user.referredBy)).then(r => r[0] ?? null);
    if (referrer && !referrer.isBlocked) {
      const bonus = Math.max(1, Math.round(task.reward * 0.1));
      await db.update(usersTable)
        .set({ coins: referrer.coins + bonus, referralEarnings: referrer.referralEarnings + bonus, updatedAt: new Date() })
        .where(eq(usersTable.telegramId, user.referredBy));
    }
  }

  const data = CompleteMiniTaskResponse.parse({ coinsEarned: task.reward, newBalance, taskTitle: task.title });
  res.json(data);
});

export default router;
