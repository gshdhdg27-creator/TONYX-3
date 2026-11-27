import { pgTable, serial, text, numeric, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

export const miniPickaxeHistoryTable = pgTable("mini_pickaxe_history", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  playId: text("play_id").notNull(),
  bet: numeric("bet", { precision: 18, scale: 8 }).notNull(),
  tier: text("tier"),
  payout: numeric("payout", { precision: 18, scale: 8 }).notNull(),
  net: numeric("net", { precision: 18, scale: 8 }).notNull(),
  serverSeed: text("server_seed").notNull(),
  serverSeedHash: text("server_seed_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  playIdUnique: uniqueIndex("mini_pickaxe_history_play_id_unique").on(table.playId),
  telegramCreatedIdx: index("mini_pickaxe_history_telegram_created_idx").on(table.telegramId, table.createdAt),
}));

export type MiniPickaxeHistory = typeof miniPickaxeHistoryTable.$inferSelect;
