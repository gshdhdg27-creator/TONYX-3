# Database migrations for game integrity

Apply these SQL files to the same PostgreSQL database configured by `DATABASE_URL` / `NEON_DATABASE_URL`, in numerical order, before deploying the matching API code:

1. `0001_pickaxe_history.sql` — creates durable Pickaxe history.
2. `0002_demo_game_credits.sql` — creates the non-withdrawable demo-credit balance.

Example with psql:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/migrations/0001_pickaxe_history.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/migrations/0002_demo_game_credits.sql
```

The API uses the existing TON wallet only for existing wallet/finance features. The updated solo game endpoints settle against `users.demo_credits`; these credits are not TON and cannot be withdrawn or transferred.

For Crash, set a dedicated high-entropy `CRASH_SERVER_SEED` secret (at least 32 characters) in the API environment. The Telegram bot token is retained only as a compatibility fallback; a dedicated secret is recommended. Never expose either secret to the client.
