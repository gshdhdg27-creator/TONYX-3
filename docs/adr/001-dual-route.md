# ADR 001: Dual route tree (legacy vs mini)

## Status

Accepted (transitional). Profile + referrals mounted under `/api/mini` (2026-10). Legacy paths remain for compatibility.

## Context

The api-server mounts two parallel trees under `/api`:

1. **Legacy** top-level routes (`users`, `tasks`, `ads`, `bonus`, `withdrawals`, `leaderboard`, `referrals`, `achievements`, `admin`, …) built around integer `users.coins`.
2. **Mini** routes under `/api/mini/*` built around `ton` + `tonyxCoins`, with Telegram initData middleware.

## Decision

- Keep both trees mounted until each legacy endpoint is proven unused or rewritten under `/api/mini`.
- Before deleting or changing currency fields on a route, **grep** mini-app pages/hooks for the generated client method name.
- Prefer new features only on `/api/mini`.
- **NEW writes to `users.coins` are forbidden** on product paths; referral rewards credit `tonyxCoins`.

## Live Orval hooks (mini-app) — audit 2026-10-24

| Hook | Usage files | Legacy or Mini | Migrate to /api/mini? | Comment |
|------|-------------|----------------|----------------------|---------|
| `useGetUserProfile` / `getGetUserProfileQueryKey` | App, Header, ArenaGame, home, market, profile, pvp, solo, tasks, games/index | **Mini** (`/api/mini/users/:id`) | Done | Auth-bound profile |
| `useRegisterUser` | App.tsx | **Mini** (`/api/mini/users/register`) | Done | Register/login |
| `useGetReferrals` | profile.tsx | **Mini** (`/api/mini/referrals/:id`) | Done | Referral list/link |
| `useGetMiniHistory` | profile.tsx | Mini | n/a | Already mini |
| `useGetMiniLeaderboard` | leaderboard.tsx | Mini | n/a | Already mini |
| `useGetMiniTasks` / `getGetMiniTasksQueryKey` | tasks.tsx | Mini | n/a | |
| `useCompleteMiniTask` | tasks.tsx | Mini | n/a | |
| `useGetMiniEarnStatus` / `getGetMiniEarnStatusQueryKey` | tasks.tsx | Mini | n/a | |
| `useRecordMiniAdWatch` | tasks.tsx | Mini | n/a | Mini ads/earn |
| `useGetTasks` / `useCompleteTask` / `useGetAdStatus` / `useRecordAdWatch` / `useGetLeaderboard` / `useRequestWithdrawal` | **Not used** in mini-app src (generated only) | Legacy | Later | Dead from FE |

### Not Orval (raw fetch)

Games (Arena, Mines, Coin Flip, etc.) call `/api/mini/games/*` via `fetch` — already on mini.

## Consequences

- Profile/register/referrals now require valid Telegram initData in production (via mini middleware).
- Legacy `/api/users` and `/api/referrals` still respond (deprecated); FE client points at mini.
- Residual legacy writers to `users.coins`: `routes/tasks.ts`, `routes/bonus.ts`, `routes/ads.ts`, `routes/withdrawals.ts` — not called by current FE hooks; must not grow.

## Next steps

1. Delete or freeze dead legacy task/ad/withdrawal writers.
2. Remove legacy mounts after zero traffic.
3. Full Orval regen when OpenAPI is source of truth again (client URLs already patched).
