---
name: Market corrections
description: Four Market UI/backend changes applied in June 2026
---

## Changes applied

**1. Leaderboard card removed**
- The gold 🏆 card between the stats row and tier filters was removed from `market.tsx`.

**2. My Orders = open only**
- Backend `GET /orders/mine` now adds `.where(and(eq(sellerId, id), eq(status, "open")))`.
- Frontend: `activeMyOrders = myOrders.filter(o => o.status === "open")` used for both display and badge counter.

**3. CreateOrderModal input is TONYX, not TON**
- State variable changed from `tonInput` to `tonyxInput`.
- `tonyxNum = Math.floor(parseFloat(tonyxInput) || 0)` — TONYX to lock.
- `tonNum = tonyxNum / RATE` — TON price for buyer, derived (not input).
- Quick amounts: `[3000, 10000, 50000, 100000]` TONYX (= 3/10/50/100 TON tier boundaries).
- Tier detection still uses `detectTier(tonNum)` (TON equivalent).
- Backend still receives `tonAmount: tonNum` (no backend contract change).
- Balance row shows "ВАШ БАЛАНС TONYX" and "ЦЕНА ДЛЯ ПОКУПАТЕЛЯ" in TON.
- Validation: `tonyxNum >= 3000 && tonyxNum <= tonyxBalance`.

**4. Queue depth system**
- System setting key: `"queue_depth"` in `system_settings` table, default = 1.
- `POST /orders/:id/buy` fetches depth, loads all open orders ASC by `createdAt`, takes top-N IDs into a Set, rejects if order not in that set with error message including the depth.
- Admin endpoints: `GET /admin/settings/queue-depth` and `POST /admin/settings/queue-depth { depth }`.
- Frontend `QueueDepthSection` component in admin.tsx (superadmin only), shows current depth, allows setting 1–100.

**Why:** Queue ensures only the oldest orders get purchased first, preventing arbitrary order selection and making the market orderly.

**How to apply:** Any buy validation must respect queue_depth. Changing RATE (currently 1000) means updating both frontend derived formula and quick amounts.
