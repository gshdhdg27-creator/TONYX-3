import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export type NftFragments = Record<string, number>; // e.g. { shadow_dogg: 3, ... }

export const miniNftInventoryTable = pgTable("mini_nft_inventory", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  fragments: jsonb("fragments").$type<NftFragments>().notNull().default({}),
  assembled: jsonb("assembled").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MiniNftInventory = typeof miniNftInventoryTable.$inferSelect;
