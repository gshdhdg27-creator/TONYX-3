# TONYX Mini App

Telegram Mini App for the TONYX platform — home dashboard, marketplace, mini-games (Arena, Mines, Coin Flip, Spin), tasks, leaderboard, profile, TON wallet integration.

Canonical product docs: root **[README.md](README.md)** and **[docs/](docs/)**.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API (port 8080)
- `pnpm --filter @workspace/mini-app run dev` — frontend
- `pnpm run typecheck` — full typecheck
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate hooks/Zod from OpenAPI
- `pnpm --filter @workspace/db run push` — push DB schema (dev only)
- Required env: `DATABASE_URL` or `NEON_DATABASE_URL`; production also needs `TELEGRAM_BOT_TOKEN`

## Stack

- pnpm workspaces, TypeScript 5.9
- API: Express 5 + pino
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod, drizzle-zod
- API codegen: Orval from OpenAPI
- Auth: Telegram WebApp `initData` HMAC (`middleware/verifyTelegram.ts`)
- Rate limits: in-memory presets on mini join/play/finance/admin

## Where things live

| Concern | Path |
|---------|------|
| Mini API | `artifacts/api-server/src/routes/mini/` |
| Legacy API | `artifacts/api-server/src/routes/*.ts` (deprecated — see ADR 001) |
| Fairness | `artifacts/api-server/src/lib/fairness.ts` + `docs/FAIRNESS.md` |
| Frontend | `artifacts/mini-app/src/` |
| Architecture | `docs/ARCHITECTURE.md` |

## Architecture decisions

- **Dual route tree**: legacy + `/api/mini` until all hooks migrate (ADR 001).
- **Balances**: product uses `ton` + `tonyxCoins`; legacy `coins` must not gain new writers.
- **Auth**: production requires valid `x-telegram-init-data`; body `telegramId` must match verified user.

## Product

PvP Arena (stake-weighted pot), solo games, market, finance, admin moderation.

## Gotchas

- Never assume a legacy route is dead — grep Orval hook usage first.
- Vercel serverless: in-memory rate limits are per-instance; Redis is the production target.
- Close Telegram WebView fully after deploy to pick up new frontend bundles.
