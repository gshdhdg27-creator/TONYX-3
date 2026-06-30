import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const miniBoostsTable = pgTable("mini_boosts", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  boostPct: numeric("boost_pct", { precision: 6, scale: 2 }).notNull(),
  costTon: numeric("cost_ton", { precision: 18, scale: 8 }).notNull(),
  purchasedAt: timestamp("purchased_at").notNull().defaultNow(),
});

export type MiniBoost = typeof miniBoostsTable.$inferSelect;
