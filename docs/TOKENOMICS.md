# TONYX Tokenomics (working)

## Units

| Asset | Storage | Role |
|-------|---------|------|
| **TON** | `users.ton` (decimal string) | Primary balance: game stakes, deposits, withdrawals |
| **TONYX** | `users.tonyxCoins` | Utility: tasks, promotions, some market flows |
| **coins** (legacy) | `users.coins` | Deprecated points balance — migrate off |

## Game economy

- Stakes are deducted **up front** from TON (Arena join/increase, Coin Flip play, etc.).
- Payouts credit TON after resolution.
- House edge retains a fraction of volume (see [FAIRNESS.md](FAIRNESS.md)).

## Design principles

1. **No silent multi-currency confusion** — UI labels must match the balance field written.
2. **Long-term TONYX utility** — burn / stake / fee discounts are roadmap items, not yet fully productized.
3. **Solvency** — withdrawals must be idempotent and status-gated (Priority 0–1 hardening).

## Risks to monitor

- Legacy routes still writing `coins` while admin UI says “TONYX”.
- Inflated reward rates vs deposit volume.
- Multi-account farming of tasks/referrals (anti-abuse Priority 1–2).
