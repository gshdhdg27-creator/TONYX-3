import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniTasksTable, miniTaskCompletionsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

/* GET /tasks/:telegramId — list available tasks */
router.get("/:telegramId", async (req, res) => {
  const telegramId = String(req.params.telegramId ?? "").trim();
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  const [tasks, completions] = await Promise.all([
    db.select().from(miniTasksTable).where(eq(miniTasksTable.isActive, "true")).orderBy(miniTasksTable.createdAt),
    db.select().from(miniTaskCompletionsTable).where(eq(miniTaskCompletionsTable.telegramId, telegramId)),
  ]);

  const completedSet = new Set(completions.map((c) => c.taskId));

  const formatted = tasks
    .filter((t) => {
      // Hide tasks that have reached max completions (globally) — unless user already completed
      if (t.maxCompletions != null && t.currentCompletions >= t.maxCompletions && !completedSet.has(t.id)) {
        return false;
      }
      return true;
    })
    .map((t) => {
      const comp = completions.find((c) => c.taskId === t.id);
      return {
        id: t.id,
        ownerId: t.ownerId ?? null,
        title: t.title,
        description: t.description ?? null,
        type: t.type,
        link: t.link ?? null,
        reward: t.reward,
        rewardTon: t.rewardTon !== null ? Number(t.rewardTon) : null,
        maxCompletions: t.maxCompletions ?? null,
        currentCompletions: t.currentCompletions,
        completed: completedSet.has(t.id),
        completedAt: comp?.completedAt.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
      };
    });

  res.json({ tasks: formatted });
});

/* POST /tasks/:id/complete */
router.post("/:id/complete", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid task id" }); return; }
  const telegramId = String(req.body?.telegramId ?? "").trim();
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  const [task, user] = await Promise.all([
    db.select().from(miniTasksTable).where(eq(miniTasksTable.id, id)).then((r) => r[0] ?? null),
    db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null),
  ]);

  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (task.isActive !== "true") { res.status(400).json({ error: "Task is not active" }); return; }

  // Check global completion limit
  if (task.maxCompletions != null && task.currentCompletions >= task.maxCompletions) {
    res.status(400).json({ error: "Task has reached its completion limit" }); return;
  }

  const existing = await db.select()
    .from(miniTaskCompletionsTable)
    .where(and(eq(miniTaskCompletionsTable.taskId, id), eq(miniTaskCompletionsTable.telegramId, telegramId)))
    .then((r) => r[0] ?? null);

  if (existing) { res.status(400).json({ error: "Task already completed" }); return; }

  // Record completion
  await db.insert(miniTaskCompletionsTable).values({ taskId: id, telegramId });

  // Increment global counter
  await db.update(miniTasksTable)
    .set({ currentCompletions: task.currentCompletions + 1 })
    .where(eq(miniTasksTable.id, id));

  // Credit reward
  const tonReward = task.rewardTon !== null ? Number(task.rewardTon) : 0;
  const coinReward = task.reward ?? 0;
  const newCoins = user.coins + coinReward;
  const newTon = tonReward > 0
    ? String(Math.round((Number(user.ton) + tonReward) * 1e6) / 1e6)
    : user.ton;

  await db.update(usersTable)
    .set({ coins: newCoins, ton: newTon, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, telegramId));

  // Referral 10% bonus (coins only)
  if (coinReward > 0 && user.referredBy && user.referredBy !== telegramId) {
    const referrer = await db.select().from(usersTable)
      .where(eq(usersTable.telegramId, user.referredBy)).then(r => r[0] ?? null);
    if (referrer && !referrer.isBlocked) {
      const bonus = Math.max(1, Math.round(coinReward * 0.1));
      await db.update(usersTable)
        .set({ coins: referrer.coins + bonus, referralEarnings: referrer.referralEarnings + bonus, updatedAt: new Date() })
        .where(eq(usersTable.telegramId, user.referredBy));
    }
  }

  res.json({
    coinsEarned: coinReward,
    tonEarned: tonReward,
    newBalance: newCoins,
    newTon: Number(newTon),
    taskTitle: task.title,
  });
});

export default router;
