import { pgTable, text, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userTasksTable = pgTable("user_tasks", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  taskId: text("task_id").notNull(),
  completedAt: timestamp("completed_at").notNull().defaultNow(),
});

export const insertUserTaskSchema = createInsertSchema(userTasksTable).omit({ id: true, completedAt: true });
export type InsertUserTask = z.infer<typeof insertUserTaskSchema>;
export type UserTask = typeof userTasksTable.$inferSelect;
