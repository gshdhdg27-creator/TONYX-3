---
name: Deposit scanner system
description: Background blockchain scanner for auto-crediting TON deposits via memo matching
---

## Memo format
- **New (primary):** `TONYX-{telegramId}` — e.g. `TONYX-7257793582`
- **Legacy (backward compat):** `TOPUP_{telegramId}`
- Both formats supported in scanner + verify endpoint

## Architecture
- `api-server/src/services/depositScanner.ts` — exports `startDepositScanner()`
- Started in `api-server/src/index.ts` alongside `startBot()`
- Runs via `setInterval` every 30 seconds
- First scan fires immediately on startup

## Scanner logic
1. `fetchRecentTxs()` — GET `https://tonapi.io/v2/blockchain/accounts/{addr}/transactions?limit=100&sort_order=desc`
2. Parse `in_msg.decoded_body.comment` for memo pattern
3. Skip txs < 0.05 TON (dust)
4. Dedup: check `mini_topup_requests.txHash` = `{hash}-{lt}`
5. Credit `users.ton` and insert completed `mini_topup_requests` row

## Frontend (profile.tsx)
- **Fixed bug:** was `process.env.PROJECT_WALLET_ADDRESS` → now hardcoded constant
- Deposit panel shows: address (copy) + memo (copy) + step-by-step instructions
- No TON Connect in deposit — pure manual transfer
- "Я отправил — проверить зачисление" button polls `/api/mini/wallet/topup/verify` every 5s for up to 2 min
- Info note: "Фоновый сканер также проверяет каждые 30 сек автоматически"

## Backend verify endpoint
- `POST /api/mini/wallet/topup/verify` accepts `{ telegramId, expectedAmount? }`
- Searches for both `TONYX-{id}` and `TOPUP_{id}` comments
- No `expectedAmount` needed — min 0.05 TON accepted

**Why:** TON Connect flow removed because it required wallet connection + complex payload building; simple memo approach is more universal (works with any wallet app).
