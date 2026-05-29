import { pgTable, text, integer, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const adViewsTable = pgTable("ad_views", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  blockId: text("block_id").notNull().default("20809"),
  coinsEarned: integer("coins_earned").notNull().default(10),
  viewedAt: timestamp("viewed_at").notNull().defaultNow(),
});

export const insertAdViewSchema = createInsertSchema(adViewsTable) as any;
export type InsertAdView = z.infer<typeof insertAdViewSchema>;
export type AdView = typeof adViewsTable.$inferSelect;
