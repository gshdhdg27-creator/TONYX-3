import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const miniUserInventoryTable = pgTable(
  "mini_user_inventory",
  {
    id: serial("id").primaryKey(),
    telegramId: text("telegram_id").notNull(),
    /** nft_full | key | etc */
    itemType: text("item_type").notNull(),
    itemId: text("item_id").notNull(),
    quantity: integer("quantity").notNull().default(1),
    acquiredAt: timestamp("acquired_at").notNull().defaultNow(),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
  },
  (t) => ({
    tgIdx: index("mini_user_inventory_tg_idx").on(t.telegramId),
  }),
);

export type MiniUserInventoryItem = typeof miniUserInventoryTable.$inferSelect;
