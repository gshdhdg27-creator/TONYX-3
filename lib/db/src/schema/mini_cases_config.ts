import { pgTable, text, integer, boolean, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";

export type CaseRewardType = "ton" | "tonyx" | "nft_fragment" | "nft_full";

export interface CaseRewardItem {
  id: string;
  type: CaseRewardType;
  /** chance weight / percent share */
  weight: number;
  minAmount?: number;
  maxAmount?: number;
  /** nft collection id, e.g. hypno_lollipop */
  nftId?: string;
  /** piece index 0..8 for fragment; omit for random piece */
  pieceIndex?: number;
  labelRu?: string;
  labelEn?: string;
  imageUrl?: string | null;
}

export const miniCasesConfigTable = pgTable("mini_cases_config", {
  id: text("id").primaryKey(),
  nameRu: text("name_ru").notNull(),
  nameEn: text("name_en").notNull(),
  costType: text("cost_type").notNull(), // key | ton | tonyx
  costValue: numeric("cost_value", { precision: 18, scale: 8 }).notNull().default("0"),
  imageUrl: text("image_url"),
  enabled: boolean("enabled").notNull().default(true),
  rewards: jsonb("rewards").$type<CaseRewardItem[]>().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MiniCaseConfig = typeof miniCasesConfigTable.$inferSelect;
