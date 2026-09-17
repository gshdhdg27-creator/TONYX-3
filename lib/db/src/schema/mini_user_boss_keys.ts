import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const miniUserBossKeysTable = pgTable(
  "mini_user_boss_keys",
  {
    id: serial("id").primaryKey(),
    telegramId: text("telegram_id").notNull(),
    bossLevel: integer("boss_level").notNull(),
    keysCount: integer("keys_count").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uidx: uniqueIndex("mini_user_boss_keys_uidx").on(t.telegramId, t.bossLevel),
  }),
);
