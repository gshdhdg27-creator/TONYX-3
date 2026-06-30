import { pgTable, serial, text, integer, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";

export const miniSpinRoomsTable = pgTable("mini_spin_rooms", {
  id: serial("id").primaryKey(),
  status: text("status").notNull().default("waiting"),
  totalPool: numeric("total_pool", { precision: 18, scale: 8 }).notNull().default("0"),
  winnerId: text("winner_id"),
  winnerUsername: text("winner_username"),
  players: jsonb("players").notNull().default([]),
  startAt: timestamp("start_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  serverSeed: text("server_seed"),
  serverSeedHash: text("server_seed_hash").notNull().default(""),
  clientSeed: text("client_seed").notNull().default("default"),
  nonce: integer("nonce").notNull().default(1),
  fairnessHash: text("fairness_hash"),
});

export type MiniSpinRoom = typeof miniSpinRoomsTable.$inferSelect;
