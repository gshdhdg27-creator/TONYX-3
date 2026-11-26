CREATE TABLE IF NOT EXISTS "mini_pickaxe_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "telegram_id" text NOT NULL,
  "play_id" text NOT NULL,
  "bet" numeric(18, 8) NOT NULL,
  "tier" text,
  "payout" numeric(18, 8) NOT NULL,
  "net" numeric(18, 8) NOT NULL,
  "server_seed" text NOT NULL,
  "server_seed_hash" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "mini_pickaxe_history_play_id_unique" UNIQUE("play_id")
);
CREATE INDEX IF NOT EXISTS "mini_pickaxe_history_telegram_created_idx"
  ON "mini_pickaxe_history" ("telegram_id", "created_at");
