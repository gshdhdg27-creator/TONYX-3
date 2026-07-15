---
name: TONYX dual route tree (legacy vs mini)
description: TONYX api-server mounts two parallel route trees; only one is live in the frontend. Check before assuming a route is dead or that a field is used.
---

The TONYX api-server (`artifacts/api-server/src/routes/`) has two parallel sets of routes both mounted under `/api`:
- Legacy top-level routes (`routes/{ads,tasks,bonus,withdrawals,leaderboard,referrals,achievements,admin,users}.ts`) — an older generation, built around a `users.coins` integer "points" balance.
- Newer `routes/mini/*` routes — built around only two real balances, `ton` and `tonyxCoins` (TONYX).

Both trees are mounted and reachable; they are NOT simply "dead code vs live code" — some legacy routes (e.g. `users.ts` register/profile, `referrals.ts`) are still actively called by the current mini-app frontend via generated hooks (`useGetUserProfile`, `useGetReferrals`), while others may be unused. `mini/tasks.ts` (admin-created "visit/subscribe" tasks) also has a `reward` integer field that was being credited to the legacy `coins` balance even though the admin UI labeled it "reward TONYX" — a real bug, not intentional legacy behavior. When asked to "remove the extra points/token currency," don't assume a route file is unused just because it looks legacy — trace actual frontend hook usage first (`grep` generated hook names like `useGetX`/`useMiniX` against page files).

**Why:** Assuming route trees are dead by name pattern alone would have caused either leaving a live bug in place or breaking a live feature.

**How to apply:** Before touching any `coins`/legacy currency logic in this project, grep the mini-app `src/pages/*.tsx` for the specific generated hook name to confirm whether that route is actually called by the UI.
