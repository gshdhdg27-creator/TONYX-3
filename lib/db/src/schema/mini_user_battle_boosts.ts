import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";

/**
 * Temporary battle boosts (ad + paid TON).
 * Mining boostRate stays in users + mini_boosts.
 */
export const miniUserBattleBoostsTable = pgTable("mini_user_battle_boosts", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),

  /** Ad boost */
  adWatchedCount: integer("ad_watched_count").notNull().default(0),
  dpsMultiplier: numeric("dps_multiplier", { precision: 6, scale: 3 }).notNull().default("1.000"),
  boostExpiresAt: timestamp("boost_expires_at"),

  /** Paid TON DPS boost */
  tonBoostMultiplier: numeric("ton_boost_multiplier", { precision: 6, scale: 3 }).notNull().default("1.000"),
  tonBoostExpiresAt: timestamp("ton_boost_expires_at"),

  /** Speed multiplier (e.g. 2x from paid speed boost) */
  speedMultiplier: numeric("speed_multiplier", { precision: 6, scale: 3 }).notNull().default("1.000"),

  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MiniUserBattleBoost = typeof miniUserBattleBoostsTable.$inferSelect;
