import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const systemSettingsTable = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SystemSetting = typeof systemSettingsTable.$inferSelect;
