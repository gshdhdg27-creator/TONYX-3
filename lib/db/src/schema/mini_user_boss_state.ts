import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const miniUserBossStateTable = pgTable(
  "mini_user_boss_state",
  {
    id: serial("id").primaryKey(),
    telegramId: text("telegram_id").notNull(),
    bossLevel: integer("boss_level").notNull(), // 1..5
    /** Unix ms when the boss becomes available again. null = alive */
    respawnAt: timestamp("respawn_at"),
    /** Ads watched toward revive for this boss */
    reviveAdsWatched: integer("revive_ads_watched").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("mini_user_boss_state_uidx").on(t.telegramId, t.bossLevel)],
);

export type MiniUserBossState = typeof miniUserBossStateTable.$inferSelect;
