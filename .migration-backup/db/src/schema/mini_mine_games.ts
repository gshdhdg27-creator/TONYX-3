import { pgTable, serial, text, integer, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";

export const miniMineGamesTable = pgTable("mini_mine_games", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  stake: integer("stake").notNull(),
  minesCount: integer("mines_count").notNull(),
  board: jsonb("board").notNull(),
  revealed: jsonb("revealed").notNull().default([]),
  multiplier: numeric("multiplier", { precision: 10, scale: 4 }).notNull().default("1"),
  status: text("status").notNull().default("active"),
  payout: integer("payout"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
});

export type MiniMineGame = typeof miniMineGamesTable.$inferSelect;
