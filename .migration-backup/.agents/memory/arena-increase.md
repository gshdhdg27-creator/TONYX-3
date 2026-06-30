---
name: Arena increase during starting
description: Arena /increase endpoint and winnerSector fix — what changed and why.
---

## /increase endpoint
Originally only allowed `status === "waiting"`. Updated to `["waiting","starting"].includes(arena.status)` so players can add to stake during the countdown timer.

**Why:** User requested — when timer is ticking (status="starting"), players should still be able to increase their bet.

## winnerSector — server-side computation
`formatArena()` now computes `winnerSector: { startDeg, endDeg } | null` when room is finished. This mirrors the same sector angle calculation the frontend uses (cumulative stake fractions × 360).

**Why:** Frontend was relying on `sectorsRef.current` (mutable render-time ref) to find winner sector at animation time. If the ref was stale or the finished state arrived before sectors were rendered, the ball had no target. Sending sector angles from the server makes it deterministic.

## Ball animation fixes (ArenaGame.tsx)
- **Late target**: Added `if (ballStoppedRef.current && ballTargetRef.current)` check BEFORE the early-return in the RAF step function. If ball stopped but target just arrived, un-stop and re-attract with `vx = dx * 0.14`.
- **handleUpdate**: Sets `ballTargetRef` directly from `fresh.winnerSector` when "finished" is detected, and if ball is already stopped, also un-stops immediately.
- **+button**: Now shown during both "waiting" AND "starting" status.
