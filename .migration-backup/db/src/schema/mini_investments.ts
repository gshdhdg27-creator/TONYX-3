import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const miniInvestmentsTable = pgTable("mini_investments", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  principal: numeric("principal", { precision: 18, scale: 8 }).notNull().default("0"),
  totalClaimed: numeric("total_claimed", { precision: 18, scale: 8 }).notNull().default("0"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  lastClaimedAt: timestamp("last_claimed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MiniInvestment = typeof miniInvestmentsTable.$inferSelect;
