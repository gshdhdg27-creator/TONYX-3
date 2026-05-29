import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";

export const miniWithdrawalsTable = pgTable("mini_withdrawals", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  amount: integer("amount").notNull(),
  address: text("address").notNull(),
  tonPrice: numeric("ton_price", { precision: 18, scale: 8 }),
  tonAmount: numeric("ton_amount", { precision: 18, scale: 8 }),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MiniWithdrawal = typeof miniWithdrawalsTable.$inferSelect;
