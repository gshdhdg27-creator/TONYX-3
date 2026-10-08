import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

/** legacy: { shadow_dogg: 3 } */
export type NftFragments = Record<string, number>;

/** per collection: pieces[9] = 0|1, claimed = how many times assembled */
export type NftCollectionProgress = {
  pieces: number[]; // length 9, 0 or 1
  claimed: number;
};

export type NftCollections = Record<string, NftCollectionProgress>;

export const miniNftInventoryTable = pgTable("mini_nft_inventory", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  fragments: jsonb("fragments").$type<NftFragments>().notNull().default({}),
  assembled: jsonb("assembled").$type<string[]>().notNull().default([]),
  collections: jsonb("collections").$type<NftCollections>().notNull().default({}),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MiniNftInventory = typeof miniNftInventoryTable.$inferSelect;
