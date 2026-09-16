import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const miniUserMagesTable = pgTable(
  "mini_user_mages",
  {
    id: serial("id").primaryKey(),
    telegramId: text("telegram_id").notNull(),
    mageId: text("mage_id").notNull(),
    level: integer("level").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("mini_user_mages_telegram_mage_uidx").on(t.telegramId, t.mageId)],
);

export type MiniUserMage = typeof miniUserMagesTable.$inferSelect;
