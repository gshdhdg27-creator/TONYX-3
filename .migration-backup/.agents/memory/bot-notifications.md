---
name: Bot notifications
description: Lightweight Telegram notification service for user events
---

## Service
- `api-server/src/services/botNotify.ts` — exports `notifyUser(telegramId, html)`
- Uses raw `fetch` to Telegram Bot API `/sendMessage` — no polling, no conflict with main bot
- Silently swallows errors (user blocked bot, invalid id, etc.)

## Events that trigger notifications
| Event | Where | Message |
|---|---|---|
| Deposit auto-credited | `depositScanner.ts` creditUser() | 💎 Пополнение получено, сумма, комментарий |
| Withdrawal completed (auto-send) | `wallet.ts` POST /withdraw | 💸 Вывод выполнен, сумма, адрес |
| Withdrawal pending (no mnemonic) | `wallet.ts` POST /withdraw | ⏳ Заявка принята, обработка 24ч |
| User banned | `admin.ts` POST /users/:id/ban | 🔴 Аккаунт заблокирован, причина |
| User unbanned | `admin.ts` POST /users/:id/unban | ✅ Аккаунт разблокирован |

## Import pattern
```typescript
import { notifyUser } from "../../services/botNotify.js";
// or from same-level:
import { notifyUser } from "./botNotify.js";
```

**Why:** Separate from main bot (bot.ts) to avoid dual polling conflict. Uses raw fetch instead of telegraf to keep it dependency-free and safe to call from any module.
