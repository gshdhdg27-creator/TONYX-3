---
name: Moderation & win-rate system
description: User moderation (ban/soft-delete/restore/reset) and win-rate modifier architecture.
---

## DB fields on users table
- `user_status` text default "active" — values: active | banned | soft_deleted
- `banned_reason` text nullable
- `win_rate_modifier` numeric(5,2) nullable — null = fair game; 0 = always loses; 100 = always wins

## Admin endpoints (all under /api/mini/admin/*)
- `GET /user-status?telegramId=` — PUBLIC, no auth. Used by App.tsx ban screen on load.
- `POST /users/:id/ban` { reason? } — sets status=banned, isBlocked=true
- `POST /users/:id/unban` — sets status=active, isBlocked=false
- `POST /users/:id/soft-delete` — status=soft_deleted, isBlocked=true
- `POST /users/:id/restore` — status=active, isBlocked=false
- `POST /users/:id/reset` — wipes game data + balances, keeps profile & referrals (superadmin only)
- `POST /users/:id/win-rate` { modifier: number|null } — sets win_rate_modifier

## Frontend ban screen (App.tsx)
- AppShell fetches /user-status on mount (after telegramId known)
- Shows spinner while loading (status="loading")
- Shows BannedScreen (🚫) or SoftDeletedScreen (🗑) if blocked
- Falls back to "ok" on fetch error (non-blocking)

## Win-rate modifier logic
- Igromanya (/reveal): rand(0-100) < modifier → force safe cell; else → force bomb
- Arena (resolveArena): highest modifier whose rand triggers → override winner; if fair winner has modifier and rand >= modifier → re-pick from others
- Mines (forceWin boolean) is separate — not affected by modifier

## Tasks CPA system
- mini_tasks: added reward_ton (numeric), max_completions (int), current_completions (int, default 0)
- Admin: TasksAdminSection (create, toggle, delete tasks) — superadmin only
- Backend tasks.ts: filters tasks at max completions, credits rewardTon on complete, increments currentCompletions
- Leaderboard: top_igro category shows top TON earners from mini_igro_games (status=won|cashout)

**Why:** winRateModifier is per-TON-game (Arena, Igromanya). forceWin is per-TONYX-game (Mines). They are separate systems.
