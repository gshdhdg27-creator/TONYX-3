CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_id" text NOT NULL,
	"username" text,
	"first_name" text,
	"last_name" text,
	"coins" integer DEFAULT 0 NOT NULL,
	"ton" numeric(18, 8) DEFAULT '0' NOT NULL,
	"tonyx_coins" integer DEFAULT 0 NOT NULL,
	"total_ads_watched" integer DEFAULT 0 NOT NULL,
	"total_ton_deposited" numeric(18, 8) DEFAULT '0' NOT NULL,
	"total_games_played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"daily_orders_start" integer DEFAULT 0 NOT NULL,
	"daily_orders_pro" integer DEFAULT 0 NOT NULL,
	"daily_orders_elite" integer DEFAULT 0 NOT NULL,
	"daily_orders_reset_at" timestamp,
	"referred_by" text,
	"referral_earnings" integer DEFAULT 0 NOT NULL,
	"photo_url" text,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp,
	"last_daily_bonus_at" timestamp,
	"last_lucky_spin_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
CREATE TABLE "ad_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_id" text NOT NULL,
	"block_id" text DEFAULT '20809' NOT NULL,
	"coins_earned" integer DEFAULT 10 NOT NULL,
	"viewed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_id" text NOT NULL,
	"amount" integer NOT NULL,
	"method" text NOT NULL,
	"address" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_id" text NOT NULL,
	"task_id" text NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"unlocked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mini_market_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"seller_id" text NOT NULL,
	"seller_username" text,
	"amount" integer NOT NULL,
	"price_per_coin" numeric(18, 8) NOT NULL,
	"total_ton" numeric(18, 8) DEFAULT '0' NOT NULL,
	"category" text DEFAULT 'start' NOT NULL,
	"bonus_pct" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"buyer_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mini_spin_rooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"total_pool" numeric(18, 8) DEFAULT '0' NOT NULL,
	"winner_id" text,
	"winner_username" text,
	"players" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"start_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"server_seed" text,
	"server_seed_hash" text DEFAULT '' NOT NULL,
	"client_seed" text DEFAULT 'default' NOT NULL,
	"nonce" integer DEFAULT 1 NOT NULL,
	"fairness_hash" text
);
--> statement-breakpoint
CREATE TABLE "mini_arena_rooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_fee" numeric(18, 8) NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"total_pool" numeric(18, 8) DEFAULT '0' NOT NULL,
	"winner_id" text,
	"winner_username" text,
	"players" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"start_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"server_seed" text,
	"server_seed_hash" text DEFAULT '' NOT NULL,
	"client_seed" text DEFAULT 'default' NOT NULL,
	"nonce" integer DEFAULT 1 NOT NULL,
	"fairness_hash" text
);
--> statement-breakpoint
CREATE TABLE "mini_mine_games" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_id" text NOT NULL,
	"stake" integer NOT NULL,
	"mines_count" integer NOT NULL,
	"board" jsonb NOT NULL,
	"revealed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"multiplier" numeric(10, 4) DEFAULT '1' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"payout" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "mini_task_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"telegram_id" text NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mini_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text,
	"title" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'visit' NOT NULL,
	"link" text,
	"reward" integer DEFAULT 50 NOT NULL,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mini_withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_id" text NOT NULL,
	"amount" integer NOT NULL,
	"address" text NOT NULL,
	"ton_price" numeric(18, 8),
	"ton_amount" numeric(18, 8),
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
