---
name: Neon DB schema sync
description: Neon production database missing columns that exist in Drizzle schema causes all queries for that table to fail with DB error (which surfaces as 404 to frontend).
---

The Neon database can fall behind the Drizzle schema when new columns are added to the schema but not pushed to the database.

**Why:** `drizzle-kit push` requires interactive TTY confirmation so it can't run in CI or agent shells. The Replit internal PostgreSQL gets the schema via `pnpm --filter @workspace/db run push` in dev, but Neon doesn't get it automatically.

**How to apply:** When admin panel or any route returns 404/500, check with:
```
psql "$NEON_DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='users';"
```
Compare against lib/db/src/schema/users.ts. Fix missing columns with:
```
psql "$NEON_DATABASE_URL" -c "ALTER TABLE users ADD COLUMN IF NOT EXISTS deposit_code TEXT UNIQUE;"
```
Known missing column: `deposit_code TEXT UNIQUE` — was missing from Neon, causing all admin/users queries to fail.
