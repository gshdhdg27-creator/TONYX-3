---
name: TONYX tokenomics refactor
description: Key decisions from the major tokenomics overhaul — TON+TONYX only, mining/boost system, market lock.
---

# TONYX Tokenomics Refactor

## Core decisions

**Currencies kept:** TON (mining income, ad rewards, boosts) + TONYX (pool purchase). Points/coins removed from UI only — DB column kept for legacy.

**Mining (investments):**
- Base rate: 1%/day of TON principal
- Rate formula: `(BASE_RATE + boostRate) / MS_PER_DAY * elapsed`
- Frontend animates with requestAnimationFrame at live ms precision
- Endpoints: POST /investments/deposit, /withdraw, /claim

**Boosts (mini_boosts table):**
- 6 packages: +0.1%→0.5TON, +0.5%→2TON, +1%→3.5TON, +2%→6.5TON, +5%→15TON, +10%→25TON
- Stored as decimal in `users.boostRate` (e.g. 0.001 = +0.1%)
- POST /boosts/buy — permanent, accumulates

**Ad rewards:** 0.0001 TON per view (earn.ts). Referral gets 10% in TON.

**Market lock:** P2P sell locked until 1,000,000 TONYX sold from system pool.
- Pool: POST /market/reserve increments `total_tonyx_sold` in system_settings
- Auto-sets `is_market_active=true` in system_settings when sold >= 1M
- market.ts checks `is_market_active` for sell order gating

**Why bypassed Zod for response in users.ts:** api-zod schemas don't include boostRate; rather than regenerate api-zod, we use res.json() directly for profile responses. Request validation still uses Zod.

## Files changed (key)
- `db/src/schema/users.ts` — added boostRate numeric
- `db/src/schema/mini_boosts.ts` — new table
- `api-server/src/routes/mini/investments.ts` — TON-based
- `api-server/src/routes/mini/boosts.ts` — new
- `api-server/src/routes/mini/market-pool.ts` — auto-unlock
- `api-server/src/routes/mini/earn.ts` — TON per ad
- `api-server/src/routes/users.ts` — boostRate in response (bypasses Zod parse)
- `mini-app/src/pages/home.tsx` — mining screen with stars, boost modal
- `mini-app/src/pages/tasks.tsx` — shows TON reward per ad
- `mini-app/src/pages/profile.tsx` — TON+TONYX cards, no exchange section
