---
name: Igromanya game
description: New TON-based Minesweeper 5×5 game added June 2026 — schema pattern, route endpoints, game flow.
---

## Key facts
- Currency: **TON** (not TONYX — differentiates from existing Mines TONYX game)
- Valid bomb counts: **1, 3, 5, 7**
- Multiplier formula: `0.97 / P(N, B)` where `P(N, B) = ∏_{i=0}^{N-1} ((25-B-i) / (25-i))`
- DB table: `mini_igro_games` — schema at `db/src/schema/mini_igro_games.ts`
- Routes: `api-server/src/routes/mini/games-igro.ts` → registered at `/api/mini/games/igro`
- Component: `mini-app/src/components/IgromanyaGame.tsx`
- Game card: added to `GAME_CARDS` in `games.tsx` with id `"igro"`, purple theme `#8B5CF6`

## Critical TS pattern for jsonb with boolean[][] type
```typescript
// Schema — MUST add $type for both board and revealed:
board:    jsonb("board").notNull().$type<boolean[][]>(),
revealed: jsonb("revealed").notNull().$type<boolean[][]>().default([]),
// Then in route: pass directly, no cast needed
tx.insert(...).values({ board, revealed }) // ✓
```
Without `$type<boolean[][]>()`, Drizzle infers `Record<string, unknown>` which conflicts with `boolean[][]`.

**Why:** Drizzle's `jsonb()` default TS type for insert is `Record<string, unknown>`. Adding `.$type<T>()` changes both insert and select types to T.

## Routes
- `GET /active?telegramId=` — active game for user
- `GET /history?telegramId=` — last 20 games
- `POST /start` — `{ telegramId, betTon, bombCount }` → deducts TON, creates game
- `POST /reveal` — `{ telegramId, row, col }` → safe/bomb result
- `POST /cashout` — `{ telegramId }` → pay out at current multiplier
