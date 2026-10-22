# ADR 001: Dual route tree (legacy vs mini)

## Status

Accepted (transitional). Migration toward a single `/api/mini` (later `/api/v1`) surface.

## Context

The api-server mounts two parallel trees under `/api`:

1. **Legacy** top-level routes (`users`, `tasks`, `ads`, `bonus`, `withdrawals`, `leaderboard`, `referrals`, `achievements`, `admin`, …) built around integer `users.coins`.
2. **Mini** routes under `/api/mini/*` built around `ton` + `tonyxCoins`, with Telegram initData middleware.

The Mini App still calls some legacy endpoints through generated Orval hooks (e.g. profile/register/referrals). Other legacy routes may be unused.

## Decision

- Keep both trees mounted until each legacy endpoint is proven unused or rewritten under `/api/mini`.
- Before deleting or changing currency fields on a route, **grep** mini-app pages/hooks for the generated client method name.
- Prefer new features only on `/api/mini`.
- Document remaining legacy consumers in this ADR’s appendix as they are discovered.

## Consequences

- Slightly higher maintenance cost and risk of “wrong balance field” bugs (e.g. task reward credited to `coins` while UI says TONYX).
- Safer rollouts: frontend does not break when mini routes evolve.
- Clear deprecation path: mark file headers `@deprecated`, then remove after zero traffic.

## Appendix — known live legacy consumers

| Hook / path | Likely route | Notes |
|-------------|--------------|-------|
| `useGetUserProfile` | `/api/users/...` | Profile + balances |
| Referrals hooks | `/api/referrals` | Confirm before removal |

Update this table during Priority 0 cleanup greps.
