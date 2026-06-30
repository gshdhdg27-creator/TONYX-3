---
name: Withdrawal system architecture
description: TON-based withdrawal flow — user submits, balance frozen, admin approves/rejects via panel with TWIN detection
---

## Withdrawal flow

**User side**: POST /api/mini/wallet/withdraw (telegramId, tonAmount, address)
- Min 0.1 TON, max 10,000 TON
- Freezes user.ton immediately on submit
- Creates mini_withdrawals record (status: "pending", amount: 0, tonAmount: decimal string)
- History via GET /api/mini/wallet/withdrawals/:telegramId

**Admin side**: All under /api/mini/admin/withdrawals (protected by admin middleware)
- GET /withdrawals?status=pending|approved|rejected — list with user info + isTwin flag
- POST /withdrawals/:id/approve — marks approved; if ADMIN_WALLET_MNEMONIC env set, auto-sends TON via @ton/ton WalletContractV4; accepts optional manual txHash body
- POST /withdrawals/:id/reject — returns frozen TON to user balance, marks rejected

**TWIN detection**: compares user.lastIp against all other users; isTwin=true shown as warning badge in admin panel

**Auto-send dependencies**: @ton/ton + @ton/crypto installed in api-server. Needs ADMIN_WALLET_MNEMONIC (space-separated mnemonic), optionally TON_ENDPOINT and TON_API_KEY env vars.

**DB**: mini_withdrawals table has txHash column (text, nullable) added via drizzle push.

**Why**: New withdrawal records use tonAmount field (not amount/coins). Old records still have amount>0 and tonAmount may be null — both display gracefully in history.
