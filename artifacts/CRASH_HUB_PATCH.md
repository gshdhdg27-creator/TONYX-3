# Crash — подключение в хаб

> **Важно:** файл `artifacts/mini-app/src/pages/games/index.tsx` был случайно затёрт placeholder. Сначала восстанови:

```bash
git checkout 04df9c10196bb5fb474c0b2dcf546b3d46eedfa1 -- artifacts/mini-app/src/pages/games/index.tsx
```

Или скачай:
https://raw.githubusercontent.com/gshdhdg27-creator/TONYX-3/04df9c10196bb5fb474c0b2dcf546b3d46eedfa1/artifacts/mini-app/src/pages/games/index.tsx

---

## Mines — уже готово
- Карточка `id: "mines"` в GAME_CARDS
- `handleSelect` → `setActive("mines")`
- Рендер `<MinesGame ... />`
- API: `/api/mini/games/mines/*`

## Crash — добавить в index.tsx

### 1. Импорт
```ts
import CrashGame from "@/components/CrashGame";
```

### 2. Карточка в GAME_CARDS (после mines)
```ts
  {
    id: "crash",
    titleRu: "Crash",
    titleEn: "Crash",
    descRu: "Успей вывести до краша",
    descEn: "Cash out before the crash",
    ready: true,
    baseOnline: 41,
    primary: "#F97316",
    gradient: "linear-gradient(180deg,#EA580C,#7C2D12)",
    glow: "rgba(249,115,22,0.7)",
    cardGlow: "rgba(249,115,22,0.14)",
    border: "#EA580C",
    accentA: "#fb923c",
    accentB: "#ea580c",
  },
```

### 3. ActiveGame
```ts
type ActiveGame = null | "arena" | "spin" | "mines" | "cases" | "crash";
```

### 4. gamesEnabled default
```ts
{ spin: true, mines: true, arena: true, crash: true, igro: true }
```

### 5. Рендер
```tsx
) : active === "crash" ? (
  <div style={{ padding: "0 16px" }}>
    <CrashGame telegramId={telegramId} balance={tonBalance} onBalanceChange={refresh} />
  </div>
) : active === "spin" ? (
```

Компонент и API уже в репо:
- `artifacts/mini-app/src/components/CrashGame.tsx`
- `artifacts/api-server/src/routes/mini/games-crash.ts`
