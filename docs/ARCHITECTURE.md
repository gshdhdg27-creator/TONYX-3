# TONYX-3 Architecture

## Goals

- Single clear API surface for the Mini App (`/api/mini` → future `/api/v1`).
- Strong Telegram auth on every money-moving or identity-bound endpoint.
- Transparent game resolution (Provably Fair).
- Safe dual-route transition without breaking live clients.

## Runtime components

| Component | Tech | Notes |
|-----------|------|-------|
| Mini App | React, Vite, TanStack Query, Tailwind | Served as static assets; SPA fallback in Express/Vercel |
| API | Express 5, pino | Mounted at `/api` |
| DB | PostgreSQL + Drizzle | Neon in production |
| Contracts | OpenAPI → Orval | `@workspace/api-spec` → client + Zod |
| Bot | Telegram Bot API helpers | Notifications, optional |

## Request path (mini)

1. Client sends `x-telegram-init-data` (and often `telegramId` in body for legacy compatibility).
2. `telegramAuthMiddleware` verifies HMAC + `auth_date` freshness; sets `res.locals.verifiedTelegramId`.
3. Guard ensures supplied `telegramId` matches verified id (except admin paths with their own checks).
4. Domain router (games, finance, market, …) executes business logic and writes via Drizzle.

## Domain modules (target layout)

```
auth / users
games: arena | spin | mines | coin | igro | cases | battle
finance: deposit | withdraw | balances
market / inventory
admin / moderation
fairness
```

Current code still lives under `routes/` and `routes/mini/`; consolidation is incremental.

## Data balances

| Field | Meaning |
|-------|---------|
| `users.ton` | Primary stake/withdraw currency |
| `users.tonyxCoins` | Utility token |
| `users.coins` | **Legacy** points — do not extend; migrate callers |

## Fairness

Shared pure functions in `lib/fairness.ts` (seed, hash, weighted pick). Game routers must not reimplement RNG for money games.

## Scaling notes (roadmap)

- Redis + BullMQ for deposits, arena resolution, rate limits.
- SSE/WebSocket for Arena/Spin live state (today: short polling).
- Cursor pagination on history endpoints.
