import { pgTable, serial, text, integer, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";

export type BattleStatus = "active" | "claimed" | "expired";

export type BattleReward = {
  type: "ton" | "tonyx" | "nft_fragment" | "nft_full";
  amount?: number;
  nftId?: string;
  fragmentNftId?: string;
};

export const miniBattlesTable = pgTable("mini_battles", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  bossLevel: integer("boss_level").notNull(),
  /** Snapshot of equipped mage IDs at battle start (server-read from loadout) */
  equippedMageIds: jsonb("equipped_mage_ids").$type<string[]>().notNull().default([]),
  /** Server-calculated DPS at start (including active boosts) */
  totalDpsSnapshot: numeric("total_dps_snapshot", { precision: 18, scale: 6 }).notNull(),
  status: text("status").$type<BattleStatus>().notNull().default("active"),
  /** Generated on claim, stored for audit */
  rewards: jsonb("rewards").$type<BattleReward[] | null>(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  claimedAt: timestamp("claimed_at"),
  /** Optional: when we marked it expired */
  expiredAt: timestamp("expired_at"),
});

export type MiniBattle = typeof miniBattlesTable.$inferSelect;
