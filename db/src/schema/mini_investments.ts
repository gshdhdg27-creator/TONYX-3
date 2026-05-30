import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const miniInvestmentsTable = pgTable("mini_investments", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  principal: integer("principal").notNull().default(0),
  totalClaimed: integer("total_claimed").notNull().default(0),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  lastClaimedAt: timestamp("last_claimed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MiniInvestment = typeof miniInvestmentsTable.$inferSelect;
