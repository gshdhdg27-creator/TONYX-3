import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Equipped slots are stored server-side.
 * Client never sends them on battle/start — server reads from here.
 * Shape: (string | null)[5]
 */
export const miniUserLoadoutTable = pgTable("mini_user_loadout", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  equippedSlots: jsonb("equipped_slots").$type<(string | null)[]>().notNull().default([null, null, null, null, null]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MiniUserLoadout = typeof miniUserLoadoutTable.$inferSelect;
