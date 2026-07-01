import { pgTable, serial, text, numeric, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users"; // поправьте путь под реальный экспорт

export const withdrawalsTable = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),

  // БЫЛО: integer("amount") — ЛОМАЕТ дробные суммы TON
  // СТАЛО: numeric с той же точностью, что и баланс пользователя
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),        // сумма к списанию с баланса
  fee: numeric("fee", { precision: 18, scale: 8 }).notNull(),              // комиссия 5%
  amountToSend: numeric("amount_to_send", { precision: 18, scale: 8 }).notNull(), // amount - fee, реально уходит на кошелёк

  address: varchar("address", { length: 128 }).notNull(),
  method: varchar("method", { length: 32 }).notNull().default("ton"),

  // pending -> processing -> completed | failed
  status: varchar("status", { length: 16 }).notNull().default("pending"),

  txHash: varchar("tx_hash", { length: 128 }),
  errorMessage: text("error_message"),

  // защита от повторной отправки формы / двойного клика
  idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull().unique(),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
