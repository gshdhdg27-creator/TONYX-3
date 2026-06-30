import { pgTable, serial, text, integer, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";

export const miniIgroGamesTable = pgTable("mini_igro_games", {
  id:           serial("id").primaryKey(),
  telegramId:   text("telegram_id").notNull(),
  betTon:       numeric("bet_ton", { precision: 12, scale: 4 }).notNull(),
  bombCount:    integer("bomb_count").notNull(),
  board:        jsonb("board").notNull().$type<boolean[][]>(),
  revealed:     jsonb("revealed").notNull().$type<boolean[][]>().default([]),
  cellsOpen:    integer("cells_open").notNull().default(0),
  multiplier:   numeric("multiplier", { precision: 10, scale: 4 }).notNull().default("1"),
  status:       text("status").notNull().default("active"),
  payout:       numeric("payout", { precision: 12, scale: 4 }),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  finishedAt:   timestamp("finished_at"),
});

export type MiniIgroGame = typeof miniIgroGamesTable.$inferSelect;
