import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const miniTopupRequestsTable = pgTable("mini_topup_requests", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  tonAmount: numeric("ton_amount", { precision: 18, scale: 9 }).notNull(),
  memo: text("memo"),
  txBoc: text("tx_boc"),
  walletAddress: text("wallet_address"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MiniTopupRequest = typeof miniTopupRequestsTable.$inferSelect;
