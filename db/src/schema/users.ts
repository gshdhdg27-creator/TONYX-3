import { pgTable, text, integer, boolean, timestamp, serial, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),

  /* Wallet 1: legacy points (kept for backward compat, not displayed) */
  coins: integer("coins").notNull().default(0),

  /* Wallet 2: TON balance */
  ton: numeric("ton", { precision: 18, scale: 8 }).notNull().default("0"),

  /* Wallet 3: TONYX trading tokens */
  tonyxCoins: integer("tonyx_coins").notNull().default(0),

  /* Mining boost: additional daily rate (e.g. 0.001 = +0.1%) */
  boostRate: numeric("boost_rate", { precision: 10, scale: 6 }).notNull().default("0"),

  /* Tracking */
  totalAdsWatched: integer("total_ads_watched").notNull().default(0),
  totalTonDeposited: numeric("total_ton_deposited", { precision: 18, scale: 8 }).notNull().default("0"),
  totalGamesPlayed: integer("total_games_played").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),

  /* Daily order limits (3 per category per 24h) */
  dailyOrdersStart: integer("daily_orders_start").notNull().default(0),
  dailyOrdersBase: integer("daily_orders_base").notNull().default(0),
  dailyOrdersPro: integer("daily_orders_pro").notNull().default(0),
  dailyOrdersElite: integer("daily_orders_elite").notNull().default(0),
  dailyOrdersResetAt: timestamp("daily_orders_reset_at"),

  /* Referral */
  referredBy: text("referred_by"),
  referralEarnings: integer("referral_earnings").notNull().default(0),

  /* Misc */
  photoUrl: text("photo_url"),
  lastIp: text("last_ip"),
  language: text("language").notNull().default("ru"),
  isBlocked: boolean("is_blocked").notNull().default(false),
  isAdmin: boolean("is_admin").notNull().default(false),
  lastLoginAt: timestamp("last_login_at"),
  lastDailyBonusAt: timestamp("last_daily_bonus_at"),
  lastLuckySpinAt: timestamp("last_lucky_spin_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable) as any;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
