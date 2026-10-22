# TONYX-3

Telegram Mini App on **TON**: PvP Arena, Mines, Coin Flip, Spin, marketplace, wallet, tasks, and TONYX utility token.

> Status: production-capable MVP with dual API surface (legacy + `/api/mini`). Priority-0 workstream is consolidating architecture, security, docs, and fairness transparency toward a **10/10** product bar.

---

## Product

| Area | Features |
|------|----------|
| **Games** | Arena (Portals-style PvP pot), Mines, Coin Flip (×1.92), Spin/Jackpot, Cases, Boss/Battle |
| **Economy** | Internal **TON** balance + **TONYX** coins; deposits/withdrawals; market & pool |
| **Social** | Referrals, leaderboard, tasks, boosts |
| **Trust** | Provably Fair seeds for Arena (and expanding); admin tools |

Primary client: Telegram WebApp (Mini App).

---

## Architecture (high level)

```
┌────────────────────┐     x-telegram-init-data      ┌──────────────────────────┐
│  mini-app (Vite)   │ ────────────────────────────► │  api-server (Express 5)  │
│  React + TanStack  │ ◄──────────────────────────── │  /api/*  + /api/mini/*   │
└────────────────────┘           JSON                 └────────────┬─────────────┘
                                                                   │
                                                                   ▼
                                                          PostgreSQL (Neon)
                                                          Drizzle ORM
```

**Monorepo (pnpm workspaces)**

| Package | Path | Role |
|---------|------|------|
| `@workspace/mini-app` | `artifacts/mini-app` | Telegram frontend |
| `@workspace/api-server` | `artifacts/api-server` | HTTP API + bot helpers |
| `@workspace/db` | (workspace) | Schema + Drizzle |
| `@workspace/api-spec` | (workspace) | OpenAPI → Orval client/Zod |
| `@workspace/api-client-react` | (workspace) | Generated React hooks |

### Dual route tree (important)

See [docs/adr/001-dual-route.md](docs/adr/001-dual-route.md).

- **Legacy** `/api/{users,tasks,ads,...}` — older “coins/points” generation; some endpoints still used by generated hooks.
- **Mini** `/api/mini/*` — current product surface (`ton` + `tonyxCoins`). All mini routes run `telegramAuthMiddleware`.

Do **not** delete legacy routes without grepping frontend hooks first.

---

## Local development

**Requirements:** Node 20+, pnpm, Postgres (`DATABASE_URL` or `NEON_DATABASE_URL`).

```bash
pnpm install

# DB schema (dev)
pnpm --filter @workspace/db run push

# API (default :8080)
pnpm --filter @workspace/api-server run dev

# Frontend (see package scripts; often :18801)
pnpm --filter @workspace/mini-app run dev

# Quality
pnpm run typecheck
pnpm run build
```

**Useful env (api-server)**

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` / `NEON_DATABASE_URL` | Postgres |
| `TELEGRAM_BOT_TOKEN` | Validate WebApp `initData` (required in production) |
| `NODE_ENV` | `production` enforces auth |
| `CRON_SECRET` | Protect `/api/cron/*` |

Copy from `.migration-backup/.env.example` or package-level `.env.example` when present.

---

## Deploy

- **Vercel** (current production path for API + static): root `vercel.json`, monorepo build.
- Ensure env vars on the project that serves `/api` and the mini-app assets.
- After frontend/API changes: deploy production and hard-refresh the Telegram WebView (close mini-app fully).

CI/CD (GitHub Actions typecheck → test → deploy) is on the roadmap (Priority 2).

---

## Provably Fair

Arena resolution uses commit–reveal style seeds:

1. `serverSeed` generated; only `sha256(serverSeed)` shown while round is open.
2. After finish, `serverSeed` is revealed with `clientSeed` + `nonce`.
3. `fairnessHash = sha256(serverSeed + clientSeed + nonce)` → float → weighted pick by stake.

Implementation: `artifacts/api-server/src/lib/fairness.ts`  
Details: [docs/FAIRNESS.md](docs/FAIRNESS.md)

**Public fairness explorer UI** and on-chain commit are Priority 1 goals.

---

## Tokenomics (summary)

- **TON**: real in-app balance for stakes, deposits, withdrawals (house edge on games, e.g. Arena ~20% of non-winner pot).
- **TONYX**: utility/points layer (tasks, some rewards, market labeling historically mixed with legacy `coins` — being cleaned up).

Full write-up: [docs/TOKENOMICS.md](docs/TOKENOMICS.md)

---

## Security baseline

- Mini API: HMAC validation of Telegram WebApp `initData` (`verifyTelegram.ts`).
- Production rejects missing/invalid/expired auth; body `telegramId` must match verified user.
- Rate limiting, stricter legacy route auth, and withdrawal idempotency are active improvement targets (Priority 0–1).

---

## Repository map

```
artifacts/api-server/src/
  app.ts, routes/{index,mini/*,...}, middleware/, lib/fairness.ts
artifacts/mini-app/src/
  pages/, components/, lib/
docs/                    # Architecture, ADR, fairness, tokenomics
scripts/
```

---

## License

MIT (workspace root). Product branding and Telegram assets remain subject to platform ToS.
