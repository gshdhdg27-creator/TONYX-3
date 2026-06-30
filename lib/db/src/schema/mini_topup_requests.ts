import { pgTable, serial, text, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const miniTopupRequestsTable = pgTable("mini_topup_requests", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  tonAmount: numeric("ton_amount", { precision: 18, scale: 9 }).notNull(),
  memo: text("memo"),
  txBoc: text("tx_boc"),
  txHash: text("tx_hash"),
  walletAddress: text("wallet_address"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  // Partial unique index: enforces txHash uniqueness at DB level,
  // but only for non-NULL values (NULL = no blockchain tx yet, allowed to repeat).
  // This is the final defence layer against cross-Vercel-instance double-credits.
  uniqueIndex("uniq_topup_tx_hash").on(t.txHash).where(sql`${t.txHash} IS NOT NULL`),
]);

export type MiniTopupRequest = typeof miniTopupRequestsTable.$inferSelect;
