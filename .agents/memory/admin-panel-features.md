---
name: Admin panel features
description: Key decisions and gotchas for the TONYX admin panel implementation
---

## Features implemented
- **Online counter**: GET /api/mini/admin/online-count — counts users with last_login_at >= now - 5min
- **UZT time**: toUZT() helper adds 5h to UTC (UTC+5), formats as DD.MM HH:MM UZT — do NOT use toLocaleString with timezone (unreliable in Node/browser)
- **IP twin detection**: per-user in GET /admin/users — queries `last_ip` column for duplicates, marks ГЛАВНЫЙ (first registered on that IP) vs ТВИНК
- **forceWin toggle**: POST /admin/users/:id/force-win with body `{ enable: bool }` — sets `force_win` column
- **Delete data**: POST /admin/users/:id/delete-data — superadmin only, double-confirm on frontend

## Critical DB column naming gotcha
All user-related tables use `telegram_id` (not `user_id`):
- `user_tasks.telegram_id`
- `user_achievements.telegram_id`
- `ad_views.telegram_id`
- `mini_withdrawals.telegram_id`
- `mini_topup_requests.telegram_id`

**Why:** Drizzle ORM schema uses camelCase `telegramId` → mapped to snake_case `telegram_id`. Raw SQL must use the snake_case column name.

## Wallet commission
- Minimum withdrawal: 1.0 TON (was 0.1)
- 5% commission deducted from gross amount; `tonAmount` stored in DB is the net (what user receives)
- Response includes `grossAmount`, `commission`, `commissionPct`, `netAmount` fields

## 500 error pattern
HTTP 500 on admin routes during workflow restart is transient — backend connects to Replit PostgreSQL (~2s startup). Not a code bug. All 16 tables exist in heliumdb schema.
