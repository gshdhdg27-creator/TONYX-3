import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const miniTasksTable = pgTable("mini_tasks", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id"),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull().default("visit"),
  link: text("link"),
  reward: integer("reward").notNull().default(50),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const miniTaskCompletionsTable = pgTable("mini_task_completions", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  telegramId: text("telegram_id").notNull(),
  completedAt: timestamp("completed_at").notNull().defaultNow(),
});

export type MiniTask = typeof miniTasksTable.$inferSelect;
export type MiniTaskCompletion = typeof miniTaskCompletionsTable.$inferSelect;
