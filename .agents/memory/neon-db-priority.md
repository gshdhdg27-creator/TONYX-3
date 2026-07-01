---
name: NEON_DATABASE_URL priority
description: lib/db/src/index.ts reads NEON_DATABASE_URL ?? DATABASE_URL. Without NEON_DATABASE_URL secret, new Repls use empty local PostgreSQL.
---

DATABASE_URL is Replit-runtime-managed (internal PostgreSQL, empty on new Repls). NEON_DATABASE_URL is a manually-set Replit secret.

**Why:** When project is cloned/forked to a new Replit account, DATABASE_URL points to a fresh empty DB. Without NEON_DATABASE_URL, all user data appears missing.

**How to apply:** On any new Replit setup, add secret NEON_DATABASE_URL = <neon pooled connection string with sslmode=require>. The DB code already prefers it via NEON_DATABASE_URL ?? DATABASE_URL.
