import { pgTable, serial, text, numeric, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const miniCaseOpensTable = pgTable(
  "mini_case_opens",
  {
    id: serial("id").primaryKey(),
    telegramId: text("telegram_id").notNull(),
    caseId: text("case_id").notNull(),
    costType: text("cost_type"), // 'key' | 'ton' | 'tonyx'
    costAmount: numeric("cost_amount", { precision: 18, scale: 8 }),
    rewards: jsonb("rewards").notNull(),
    openedAt: timestamp("opened_at").notNull().defaultNow(),
  },
  (t) => ({
    telegramIdx: index("mini_case_opens_telegram_idx").on(t.telegramId),
  }),
);
