import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";

export const miniMarketOrdersTable = pgTable("mini_market_orders", {
  id: serial("id").primaryKey(),
  sellerId: text("seller_id").notNull(),
  sellerUsername: text("seller_username"),
  amount: integer("amount").notNull(),
  pricePerCoin: numeric("price_per_coin", { precision: 18, scale: 8 }).notNull(),
  totalTon: numeric("total_ton", { precision: 18, scale: 8 }).notNull().default("0"),

  /* Category: start | pro | elite */
  category: text("category").notNull().default("start"),

  /* Bonus pct: 1, 2 or 3 */
  bonusPct: integer("bonus_pct").notNull().default(1),

  status: text("status").notNull().default("open"),
  buyerId: text("buyer_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MiniMarketOrder = typeof miniMarketOrdersTable.$inferSelect;
