# TONYX — Full Recreation Prompt

Build a complete Telegram Mini App (WebApp) gaming platform called **TONYX**. This is a Russian-language app embedded inside Telegram. The entire UI text is in Russian.

---

## Tech Stack

- **Monorepo**: pnpm workspaces (Node.js 22)
- **Backend**: Node.js + Express + TypeScript (tsx for dev)
- **Frontend**: React 19 + Vite 6 + TypeScript (inline styles only, no CSS modules or Tailwind)
- **Database**: PostgreSQL + Drizzle ORM (drizzle-orm + drizzle-kit)
- **Auth**: Telegram WebApp `initData` — user is identified by `telegramId` (string)
- **API**: REST, all endpoints under `/api/mini/`
- **Frontend proxy**: Vite proxies `/api` → `http://localhost:3001`

### Monorepo packages (pnpm-workspace.yaml)
```
packages:
  - api-server
  - mini-app
  - db
  - api-client-react
  - api-zod
  - api-spec
  - scripts
```

### Key dependencies (pnpm catalog)
```yaml
catalog:
  "@tanstack/react-query": "^5.62.7"
  "drizzle-orm": "^0.39.3"
  "react": "^19.1.0"
  "vite": "^6.3.3"
  "zod": "^3.24.4"
  "tsx": "^4.19.3"
```

### Workflows
- **API Server**: `cd api-server && PORT=3001 pnpm dev` (runs on port 3001)
- **Start application**: `cd mini-app && pnpm dev` (runs on port 5000, base path `/mini-app/`)

---

## Database Schema

### `users` table
```ts
{
  id: serial PK,
  telegramId: text UNIQUE NOT NULL,
  username: text,
  firstName: text,
  lastName: text,
  coins: integer DEFAULT 0,           // pts earned from ads
  ton: numeric(18,8) DEFAULT 0,       // TON balance for PvP games
  tonyxCoins: integer DEFAULT 0,      // TONYX trading token
  totalAdsWatched: integer DEFAULT 0,
  totalTonDeposited: numeric(18,8) DEFAULT 0,
  totalGamesPlayed: integer DEFAULT 0,
  wins: integer DEFAULT 0,
  losses: integer DEFAULT 0,
  dailyOrdersStart: integer DEFAULT 0,
  dailyOrdersPro: integer DEFAULT 0,
  dailyOrdersElite: integer DEFAULT 0,
  dailyOrdersResetAt: timestamp,
  referredBy: text,
  referralEarnings: integer DEFAULT 0,
  photoUrl: text,
  isBlocked: boolean DEFAULT false,
  isAdmin: boolean DEFAULT false,
  lastLoginAt: timestamp,
  lastDailyBonusAt: timestamp,
  lastLuckySpinAt: timestamp,
  createdAt: timestamp DEFAULT now(),
  updatedAt: timestamp DEFAULT now(),
}
```

### `mini_arena_rooms` table (PvP Arena game)
```ts
{
  id: serial PK,
  entryFee: numeric(18,8) NOT NULL,
  status: text DEFAULT "waiting",     // waiting | starting | finished
  totalPool: numeric(18,8) DEFAULT 0,
  winnerId: text,
  winnerUsername: text,
  players: jsonb DEFAULT [],          // [{telegramId, username, stake}]
  startAt: timestamp,
  finishedAt: timestamp,
  createdAt: timestamp DEFAULT now(),
  serverSeed: text,                   // Provably Fair
  serverSeedHash: text NOT NULL DEFAULT "",
  clientSeed: text NOT NULL DEFAULT "default",
  nonce: integer NOT NULL DEFAULT 1,
  fairnessHash: text,
}
```

### `mini_spin_rooms` table (PvP Wheel/Барабан game)
```ts
{
  id: serial PK,
  status: text DEFAULT "waiting",     // waiting | starting | finished
  totalPool: numeric(18,8) DEFAULT 0,
  winnerId: text,
  winnerUsername: text,
  players: jsonb DEFAULT [],          // [{telegramId, username, stake, chance}]
  startAt: timestamp,
  finishedAt: timestamp,
  createdAt: timestamp DEFAULT now(),
  serverSeed: text,
  serverSeedHash: text NOT NULL DEFAULT "",
  clientSeed: text NOT NULL DEFAULT "default",
  nonce: integer NOT NULL DEFAULT 1,
  fairnessHash: text,
}
```

### `mini_mine_games` table (Mines solo game)
```ts
{
  id: serial PK,
  telegramId: text NOT NULL,
  stake: integer NOT NULL,            // in pts (coins)
  minesCount: integer NOT NULL,
  board: jsonb NOT NULL,              // 5x5 grid of "hidden"|"safe"|"mine"
  revealed: jsonb DEFAULT [],         // [[row,col], ...]
  multiplier: numeric(10,4) DEFAULT 1,
  status: text DEFAULT "active",      // active | won | lost
  payout: integer,
  createdAt: timestamp DEFAULT now(),
  finishedAt: timestamp,
}
```

### `mini_market_orders` table (P2P TONYX market)
```ts
{
  id: serial PK,
  sellerId: text NOT NULL,
  sellerUsername: text,
  amount: integer NOT NULL,           // TONYX coins to sell
  pricePerCoin: numeric(18,8) NOT NULL,
  totalTon: numeric(18,8) DEFAULT 0,
  category: text DEFAULT "start",     // start | pro | elite
  bonusPct: integer DEFAULT 1,        // 1, 2, or 3
  status: text DEFAULT "open",        // open | filled | cancelled
  buyerId: text,
  createdAt: timestamp DEFAULT now(),
  updatedAt: timestamp DEFAULT now(),
}
```

### `mini_tasks` table
```ts
{
  id: serial PK,
  title: text NOT NULL,
  description: text,
  reward: integer NOT NULL,           // pts reward
  taskType: text DEFAULT "telegram",  // telegram | url | daily
  targetUrl: text,
  isActive: boolean DEFAULT true,
  createdAt: timestamp DEFAULT now(),
}
```

### `user_tasks` table
```ts
{
  id: serial PK,
  telegramId: text NOT NULL,
  taskId: integer NOT NULL,
  completedAt: timestamp DEFAULT now(),
}
```

### `ad_views` table
```ts
{
  id: serial PK,
  telegramId: text NOT NULL,
  reward: integer NOT NULL,
  source: text DEFAULT "adsgram",
  createdAt: timestamp DEFAULT now(),
}
```

### `mini_withdrawals` table
```ts
{
  id: serial PK,
  telegramId: text NOT NULL,
  amount: numeric(18,8) NOT NULL,
  address: text NOT NULL,
  status: text DEFAULT "pending",     // pending | completed | rejected
  txHash: text,
  createdAt: timestamp DEFAULT now(),
  updatedAt: timestamp DEFAULT now(),
}
```

---

## API Routes (all under `/api/mini/`)

### Auth / User
- `GET /user/:telegramId` — get or auto-create user profile
- `POST /user/login` — update lastLoginAt, return user
- `GET /leaderboard` — top users by coins, ton, tonyxCoins

### Finance
- `POST /deposit` — add TON to user balance (body: {telegramId, amount})
- `POST /withdraw` — create withdrawal request (body: {telegramId, amount, address})
- `GET /withdrawals/:telegramId` — list user withdrawals
- `POST /daily-bonus` — claim daily bonus (24h cooldown, +50 coins)
- `POST /lucky-spin` — claim lucky spin bonus (24h cooldown, random 10-500 coins)

### Earn (Ads)
- `POST /earn/ad-view` — reward user for watching ad (body: {telegramId, reward})

### Tasks
- `GET /tasks/:telegramId` — list all tasks with completion status
- `POST /tasks/:taskId/complete` — mark task complete, award pts

### PvP Arena (`/games/arena/`)
- `GET /state` — get current active arena room (auto-creates if none)
- `POST /join` — join arena (body: {telegramId, stake}) — deducts TON, sets 20s timer if 2+ players
- `POST /increase` — increase existing stake in current room
- `GET /history` — last 20 finished rooms with fair data
- `GET /lucky-players` — top 5 biggest winners
- `POST /client-seed` — set clientSeed for current room (body: {clientSeed})
- `GET /fair/:id` — get fairness data for a specific room

### PvP Wheel/Spin (`/games/spin/`)
- `GET /state` — get current active spin round (auto-creates if none)
- `POST /join` — join round (body: {telegramId, stake})
- `POST /increase` — increase stake
- `GET /history` — last 20 finished rounds with fair data
- `GET /lucky-players` — top 5 biggest winners
- `POST /client-seed` — set clientSeed
- `GET /fair/:id` — get fairness data

### Mines (`/games/mines/`)
- `POST /start` — start new mine game (body: {telegramId, stake, minesCount})
- `POST /reveal` — reveal a cell (body: {gameId, telegramId, row, col})
- `POST /cashout` — cash out current multiplier (body: {gameId, telegramId})
- `GET /:gameId` — get game state

### Market (`/market/`)
- `GET /orders` — list open orders
- `POST /create` — create sell order (body: {telegramId, amount, pricePerCoin, category, bonusPct})
- `POST /buy` — buy order (body: {telegramId, orderId})
- `POST /cancel` — cancel own order (body: {telegramId, orderId})
- `GET /pool` — get market pool stats
- `GET /my-orders/:telegramId` — get user's orders

### Admin (`/admin/`)
- `GET /stats` — global stats (users count, total coins, ton, games played)
- `GET /users` — paginated user list
- `POST /add-coins` — manually add coins
- `POST /block-user` / `POST /unblock-user`
- `GET /withdrawals` — all withdrawal requests
- `POST /withdrawals/:id/complete` / `/reject`

---

## Business Logic

### PvP Arena (Арена)
- Players join by staking any amount of TON (minimum 0.1 TON)
- Multiple players can join the same room
- When 2+ players are in, a 20-second countdown starts
- New players can join during countdown (resets timer? No — timer continues)
- A player can increase their stake while in the waiting/starting room
- Commission: 20% of losers' pool goes to the house
- **Winner payout** = own stake + losers' total * 0.80
- After resolution: auto-create next room with fresh serverSeed
- Winner selection: Provably Fair (see below)
- Min players to resolve: 2

### PvP Wheel / Барабан (Spin)
- Identical mechanics to Arena but with animated spinning wheel
- Each player gets a sector sized proportional to their stake
- Same 20-second timer, same 20% commission, same Provably Fair

### Mines
- 5×5 grid (25 cells)
- Bet in `coins` (pts), options: 50, 100, 250, 500, 1000
- Mine count options: 2, 3, 5, 10, 15, 24
- Multiplier formula: `product of (totalCells-i)/(safeCells-i) for i in 0..safeOpened-1` × 0.97 (house edge)
- Reveal cell → if mine: lose stake, game over; if safe: multiplier increases
- Cashout anytime while active: win `stake × currentMultiplier` in pts
- Grid stored server-side, only revealed cells sent to client
- Status: `active` | `won` | `lost`

### Market (TONYX P2P)
- Sellers list TONYX coins for TON
- Three categories: `start` (bonusPct=1), `pro` (bonusPct=2), `elite` (bonusPct=3)
- Daily order limits per category per user (stored in users table)
- Buyer pays TON → receives TONYX coins + bonus%
- Seller receives TON, loses TONYX coins from balance

---

## Provably Fair System

### Server logic (`api-server/src/lib/fairness.ts`)
```ts
import { createHash, randomBytes } from "crypto";

export function generateServerSeed(): string {
  return randomBytes(32).toString("hex");
}

export function hashServerSeed(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

export function computeFairnessHash(serverSeed: string, clientSeed: string, nonce: number): string {
  return createHash("sha256").update(`${serverSeed}${clientSeed}${nonce}`).digest("hex");
}

export function hashToFloat(hash: string): number {
  return parseInt(hash.slice(0, 8), 16) / 0xffffffff;
}

export function pickWinnerByHash<T extends { stake: number }>(
  hash: string, players: T[], totalPool: number
): T {
  const rand = hashToFloat(hash) * totalPool;
  let acc = 0;
  for (const p of players) {
    acc += p.stake;
    if (rand <= acc) return p;
  }
  return players[players.length - 1];
}
```

### Flow
1. When a room is created: generate `serverSeed`, store `serverSeedHash = SHA256(serverSeed)` — show hash to players
2. `serverSeed` is hidden until game finishes
3. Users can set their own `clientSeed` (max 64 chars) before game starts via `POST /client-seed`
4. `nonce` = 1 (one game per room)
5. At resolution: `fairnessHash = SHA256(serverSeed + clientSeed + nonce)`
6. `rand = parseInt(hash[0..8], 16) / 0xFFFFFFFF * totalPool`
7. Walk through players' stakes accumulating sum — first player where `rand <= acc` wins
8. After finish: reveal `serverSeed` so anyone can verify

### `fair` object returned in API responses
```ts
{
  serverSeedHash: string,     // always shown
  serverSeed: string | null,  // null before finish, revealed after
  clientSeed: string,
  nonce: number,
  hash: string | null,        // null before finish, fairnessHash after
}
```

---

## Frontend Architecture

### App structure
```
mini-app/src/
  main.tsx                 — React root, QueryClientProvider
  App.tsx                  — Router (bottom nav tabs)
  pages/
    home.tsx               — home screen with stats, daily bonus, lucky spin, referral
    games.tsx              — all 3 games in one file (Mines, Spin, Arena with tabs)
    market.tsx             — TONYX P2P market
    tasks.tsx              — earn pts by completing tasks
    leaderboard.tsx        — top players
    profile.tsx            — user profile, stats, history
    admin.tsx              — admin panel (isAdmin check)
  components/
    ArenaGame.tsx          — full-screen PvP Arena component
    FairnessModal.tsx      — Provably Fair verification modal
    bottom-nav.tsx         — bottom navigation bar
    count-up.tsx           — animated number counter
  lib/
    telegram.ts            — Telegram WebApp SDK helpers (haptic, initData, useTelegram)
```

### Bottom Navigation (5 tabs)
1. 🏠 Home — main screen
2. 🛒 Market — TONYX market
3. 🎮 Games — games hub
4. ✅ Tasks — earn pts
5. 👤 Profile — user profile

### Design System
- **Background**: `#0B0F14` (very dark navy)
- **Card background**: `rgba(15,23,42,0.95)` or `#161B22`
- **Border**: `rgba(30,58,143,0.3)` (dark blue)
- **Primary blue**: `#2563eb`, gradient: `linear-gradient(135deg,#1e3a8a,#2563eb)`
- **Accent cyan**: `#22d3ee`
- **Success green**: `#4ade80`
- **Warning amber**: `#F59E0B` / `#FBBF24`
- **Error red**: `#F43F5E` / `#f87171`
- **Text primary**: `#f1f5f9`
- **Text secondary**: `#94a3b8`
- **Text muted**: `#475569` / `#334155`
- **Font**: Inter (from Google Fonts)
- **Border radius**: 12-16px on cards, 8-10px on inputs
- **All styles**: inline React styles only (no CSS files)

### Sector Colors (for wheel/arena charts)
```ts
const SECTOR_COLORS = [
  "#2563eb","#dc2626","#16a34a","#d97706","#7c3aed",
  "#0891b2","#be185d","#0f766e","#b45309","#4338ca",
  "#15803d","#b91c1c","#1d4ed8","#a16207","#6d28d9",
];
```

### Telegram Integration
```ts
// lib/telegram.ts
export function haptic(style: "light"|"medium"|"heavy"|"rigid"|"soft") {
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
}
export function hapticNotify(type: "error"|"success"|"warning") {
  window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred(type);
}
export function useTelegram() {
  const tg = window.Telegram?.WebApp;
  const user = tg?.initDataUnsafe?.user;
  return {
    telegramId: String(user?.id ?? "0"),
    username: user?.username ?? null,
    firstName: user?.first_name ?? null,
    photoUrl: user?.photo_url ?? null,
    initData: tg?.initData ?? "",
  };
}
```

### Games Page Structure
The `/games` page has 3 tabs: **Mines** | **Барабан** (Spin Wheel) | **Арена** (Arena)

**Mines tab:**
- Bet selector with quick buttons [50, 100, 250, 500, 1000] + custom input
- Mine count selector [2, 3, 5, 10, 15, 24] — red gradient buttons
- 5×5 grid: 💎 for hidden, 💎 green for safe, 💣 red for mine
- Live multiplier display + cashout button
- Next-step multiplier preview strip (5 future values)

**Барабан tab (Spin Wheel):**
- SVG pie chart wheel (260×260px) with sectors per player
- Spinning animation via CSS transform rotation, 3.8s cubic-bezier
- Arrow pointer at top
- Top row: Last Winner + Biggest Winner + 🔐 Честность + 📋 История buttons
- Stats bar: bank total, players count, timer countdown
- Quick bet buttons [1, 5, 10, 50 TON] + custom input
- Player list with colored bars showing stake percentages

**Арена tab (Arena):**
- Full-screen dark component (fixed inset 0)
- SVG "donut-like" wheel with player sectors (square sectors inside circle)
- Ball bouncing animation during countdown
- Same structure: header with online count + 🔐 + 📋 buttons
- Balance display + bet input + join button
- Countdown timer with pulsing animation
- Winner reveal overlay with win/lose animation

### FairnessModal Component
Bottom-sheet modal (slides up from bottom) with:
- Header: "🔐 Проверка честности" + game type + round number
- Info banner (shown before game ends): "До окончания serverSeed скрыт"
- **SERVER SEED HASH** row (always visible, monospace, copy button)
- **SERVER SEED** row (only after game finish, green border)
- **CLIENT SEED** row — editable input + Save button when game is `waiting`
- **NONCE** row
- **ИТОГОВЫЙ HASH** row (only after finish, amber border) — shows `SHA256(serverSeed+clientSeed+nonce)`
- **"🔎 Проверить честность"** button — runs SHA256 in browser via Web Crypto API and compares
- Expandable "Как это работает?" section explaining the system
- Copy buttons (⎘) on all values

---

## Key API patterns

### User middleware
Every request uses `telegramId` from body/params (no JWT — Telegram initData validation optional).

### Room auto-creation
Both arena and spin routes auto-create a new room when `getActiveArena()` / `getActiveRound()` finds none. New room always gets a fresh `serverSeed`.

### Timer resolution
When 2+ players join, `startAt = now + 20s`. A `setTimeout` schedules `resolveArena(id)` / `resolveRound(id)`. The resolve function:
1. Reads the room, checks status is still "starting"
2. Computes fairness hash → picks winner
3. Updates room: status=finished, winnerId, fairnessHash, serverSeed revealed
4. Credits winner TON (stake + 80% of losers' pool)
5. Updates wins/losses for all players
6. Creates next room with new serverSeed

### History endpoint format
```ts
{
  rooms: [{
    id, winnerId, winnerUsername, winnerPayout,
    totalPool, playerCount, players,
    finishedAt,
    fair: { serverSeed, serverSeedHash, clientSeed, nonce, hash }
  }]
}
```

---

## User Registration Flow
1. Frontend sends `POST /api/mini/user/login` with `{telegramId, username, firstName, ...}`
2. If user doesn't exist → auto-create with 100 starting coins bonus
3. Return user profile with all balances

---

## Referral System
- User shares link with `?ref=TELEGRAM_ID`
- New user signs up → `referredBy = TELEGRAM_ID`
- Referrer gets +50 coins per referral (credited on referred user's first login)
- Show referral link and earnings count on Home/Profile page

---

## Admin Panel
- Accessible only when `user.isAdmin === true`
- Stats: total users, total coins in circulation, total TON, games played
- User table with search, manual coin adding, block/unblock
- Withdrawal management: approve/reject pending withdrawals

---

## Localization
All UI text is in **Russian**:
- "Игры" (Games), "Рынок" (Market), "Задания" (Tasks), "Профиль" (Profile)
- "Арена" (Arena), "Барабан" (Spin Wheel), "Майнс" / "Mines"
- "Ставка" (Stake/Bet), "Победитель" (Winner), "История" (History)
- "Баланс" (Balance), "Выигрыш" (Winnings), "Комиссия" (Commission)
- "Начать игру" (Start game), "Забрать" (Cash out), "Присоединиться" (Join)
- "Честность" (Fairness), "Проверка честности" (Fairness check)
- "Задания" (Tasks), "Выполнено" (Completed), "Получить" (Claim)
- "Лидерборд" (Leaderboard)

---

## Important Implementation Notes

1. **No Math.random() for game results** — always use Provably Fair hash-based selection
2. **TON amounts** stored as numeric(18,8) strings in DB, converted to Number for math
3. **Coins (pts)** stored as integer
4. **All inline styles** — no external CSS frameworks
5. **Vite base path**: `/mini-app/` (set in vite.config.ts: `base: '/mini-app/'`)
6. **API proxy**: in vite.config.ts: `server.proxy['/api'] = 'http://localhost:3001'`
7. **Polling**: frontend polls `/state` every 2 seconds with `setInterval`
8. **No WebSockets** — simple polling-based real-time updates
9. **Commission**: 20% of losers' pool (winners keep their own stake + 80% of losers')
10. **Minimum stake**: 0.1 TON for PvP games, 50 pts for Mines
11. **Auto-join protection**: check if player already in room before allowing join
12. **Drizzle push**: `drizzle-kit push` to sync schema (no migration files needed for dev)
13. **tsconfig**: root `tsconfig.base.json` extended by each package's `tsconfig.json`
14. **Package names**: use `@workspace/db`, `@workspace/api-client-react`, etc.

---

Build this project completely from scratch as a working Telegram Mini App with all the games, market, tasks, and fairness systems described above. Start with the monorepo structure, database schema, API server, then the React frontend. Make it production-ready with proper error handling, loading states, and toast notifications for all user actions.
