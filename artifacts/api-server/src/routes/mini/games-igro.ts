import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniIgroGamesTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";

const router: IRouter = Router();

const GRID       = 5;
const TOTAL_CELLS = GRID * GRID;          // 25
const VALID_BOMBS = [1, 3, 5, 7] as const;
const HOUSE_EDGE  = 0.97;
const MIN_BET     = 0.01;

type BombCount = (typeof VALID_BOMBS)[number];
type Board     = boolean[][];             // true = bomb
type Revealed  = boolean[][];             // true = opened

/* ─── Multiplier after N cells opened with B bombs ─── */
function calcMultiplier(cellsOpen: number, bombCount: number): number {
  const safe = TOTAL_CELLS - bombCount;
  let p = 1;
  for (let i = 0; i < cellsOpen; i++) {
    const num = safe - i;
    const den = TOTAL_CELLS - i;
    if (num <= 0 || den <= 0) return 9999;
    p *= num / den;
  }
  if (p <= 0) return 9999;
  return Math.round((HOUSE_EDGE / p) * 10000) / 10000;
}

/* ─── Random board placement ─── */
function generateBoard(bombCount: number): Board {
  const flat = Array<boolean>(TOTAL_CELLS).fill(false);
  const positions = Array.from({ length: TOTAL_CELLS }, (_, i) => i);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  positions.slice(0, bombCount).forEach(idx => { flat[idx] = true; });
  const board: Board = [];
  for (let r = 0; r < GRID; r++) {
    board.push(flat.slice(r * GRID, (r + 1) * GRID));
  }
  return board;
}

function emptyRevealed(): Revealed {
  return Array.from({ length: GRID }, () => Array<boolean>(GRID).fill(false));
}

function formatGame(game: typeof miniIgroGamesTable.$inferSelect, revealBoard = false) {
  const board    = game.board   as Board;
  const revealed = game.revealed as Revealed;
  const cellsOpen = game.cellsOpen;
  const bombCount = game.bombCount;
  const mult      = Number(game.multiplier);

  const safeCells = TOTAL_CELLS - bombCount;
  const nextMult  = calcMultiplier(cellsOpen + 1, bombCount);

  return {
    id:           game.id,
    betTon:       Number(game.betTon),
    bombCount,
    cellsOpen,
    multiplier:   mult,
    nextMultiplier: nextMult,
    safeCells,
    status:       game.status,
    payout:       game.payout !== null ? Number(game.payout) : null,
    revealed,
    // Only expose the full board on game over (lost/won/cashout)
    board: revealBoard || game.status !== "active" ? board : null,
    createdAt: game.createdAt.toISOString(),
  };
}

/* ─── GET /active — current active game for user ─── */
router.get("/active", async (req, res) => {
  const telegramId = req.query.telegramId as string | undefined;
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  const game = await db.select().from(miniIgroGamesTable)
    .where(and(
      eq(miniIgroGamesTable.telegramId, telegramId),
      eq(miniIgroGamesTable.status, "active"),
    ))
    .orderBy(desc(miniIgroGamesTable.id))
    .limit(1)
    .then(r => r[0] ?? null);

  res.json({ game: game ? formatGame(game) : null });
});

/* ─── GET /history ─── */
router.get("/history", async (req, res) => {
  const telegramId = req.query.telegramId as string | undefined;
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  const games = await db.select().from(miniIgroGamesTable)
    .where(eq(miniIgroGamesTable.telegramId, telegramId))
    .orderBy(desc(miniIgroGamesTable.id))
    .limit(20);

  res.json({ games: games.map(g => formatGame(g)) });
});

/* ─── POST /start ─── */
router.post("/start", async (req, res) => {
  if (!(await isGameEnabled("igro"))) {
    res.status(403).json({ error: GAME_DISABLED_MESSAGE });
    return;
  }
  const { telegramId, betTon, bombCount } = req.body as {
    telegramId?: string; betTon?: number; bombCount?: number;
  };

  if (!telegramId || !betTon || !bombCount) {
    res.status(400).json({ error: "telegramId, betTon, bombCount обязательны" }); return;
  }
  if (!VALID_BOMBS.includes(bombCount as BombCount)) {
    res.status(400).json({ error: `bombCount должен быть одним из: ${VALID_BOMBS.join(", ")}` }); return;
  }
  if (betTon < MIN_BET) {
    res.status(400).json({ error: `Минимальная ставка: ${MIN_BET} TON` }); return;
  }

  const betR = Math.round(betTon * 10000) / 10000;

  const user = await db.select().from(usersTable)
    .where(eq(usersTable.telegramId, telegramId)).then(r => r[0] ?? null);
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }
  if (Number(user.ton) < betR) { res.status(400).json({ error: "Недостаточно TON" }); return; }

  // Cancel any existing active game (forfeit)
  const existing = await db.select().from(miniIgroGamesTable)
    .where(and(
      eq(miniIgroGamesTable.telegramId, telegramId),
      eq(miniIgroGamesTable.status, "active"),
    )).then(r => r[0] ?? null);

  if (existing) {
    await db.update(miniIgroGamesTable)
      .set({ status: "lost", payout: "0", finishedAt: new Date() })
      .where(eq(miniIgroGamesTable.id, existing.id));
  }

  const board    = generateBoard(bombCount);
  const revealed = emptyRevealed();

  const game = await db.transaction(async (tx) => {
    await tx.update(usersTable)
      .set({ ton: String(Math.round((Number(user.ton) - betR) * 10000) / 10000), updatedAt: new Date() })
      .where(eq(usersTable.telegramId, telegramId));

    const [inserted] = await tx.insert(miniIgroGamesTable).values({
      telegramId,
      betTon:     String(betR),
      bombCount,
      board,
      revealed,
      cellsOpen:  0,
      multiplier: "1",
      status:     "active",
    }).returning();

    return inserted;
  });

  res.json({ game: formatGame(game) });
});

/* ─── POST /reveal ─── */
router.post("/reveal", async (req, res) => {
  const { telegramId, row, col } = req.body as {
    telegramId?: string; row?: number; col?: number;
  };

  if (!telegramId || row === undefined || col === undefined) {
    res.status(400).json({ error: "telegramId, row, col обязательны" }); return;
  }
  if (row < 0 || row >= GRID || col < 0 || col >= GRID) {
    res.status(400).json({ error: "Неверные координаты" }); return;
  }

  const game = await db.select().from(miniIgroGamesTable)
    .where(and(
      eq(miniIgroGamesTable.telegramId, telegramId),
      eq(miniIgroGamesTable.status, "active"),
    ))
    .orderBy(desc(miniIgroGamesTable.id))
    .limit(1)
    .then(r => r[0] ?? null);

  if (!game) { res.status(404).json({ error: "Нет активной игры" }); return; }

  const board    = game.board    as Board;
  const revealed = game.revealed as Revealed;

  if (revealed[row][col]) {
    res.status(400).json({ error: "Ячейка уже открыта" }); return;
  }

  // Apply winRateModifier override
  const user = await db.select({ winRateModifier: usersTable.winRateModifier })
    .from(usersTable).where(eq(usersTable.telegramId, telegramId)).then(r => r[0] ?? null);
  const modifier = user?.winRateModifier !== null && user?.winRateModifier !== undefined
    ? Number(user.winRateModifier) : null;
  if (modifier !== null) {
    const r = Math.random() * 100;
    if (r < modifier) {
      // Force safe regardless of board
      board[row][col] = false;
    } else {
      // Force bomb regardless of board
      board[row][col] = true;
    }
  }
  if (board[row][col]) {
    // Bomb hit — lose
    revealed[row][col] = true;
    const [updated] = await db.update(miniIgroGamesTable)
      .set({ revealed, status: "lost", payout: "0", finishedAt: new Date() })
      .where(eq(miniIgroGamesTable.id, game.id))
      .returning();

    // Increment losses counter
    const loser = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then(r => r[0]);
    if (loser) {
      await db.update(usersTable)
        .set({ losses: loser.losses + 1, totalGamesPlayed: loser.totalGamesPlayed + 1, updatedAt: new Date() })
        .where(eq(usersTable.telegramId, telegramId));
    }

    res.json({ game: formatGame(updated, true), hit: "bomb", row, col });
    return;
  }

  // Safe cell
  revealed[row][col] = true;
  const newCellsOpen = game.cellsOpen + 1;
  const safeCells    = TOTAL_CELLS - game.bombCount;
  const newMult      = calcMultiplier(newCellsOpen, game.bombCount);
  const allSafeOpen  = newCellsOpen >= safeCells;

  if (allSafeOpen) {
    // All safe cells revealed — auto-win
    const payout = Math.round(Number(game.betTon) * newMult * 10000) / 10000;
    const [updated] = await db.transaction(async (tx) => {
      const [upd] = await tx.update(miniIgroGamesTable)
        .set({
          revealed,
          cellsOpen:  newCellsOpen,
          multiplier: String(newMult),
          status:     "won",
          payout:     String(payout),
          finishedAt: new Date(),
        })
        .where(eq(miniIgroGamesTable.id, game.id))
        .returning();

      const u = await tx.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then(r => r[0]!);
      await tx.update(usersTable)
        .set({ ton: String(Math.round((Number(u.ton) + payout) * 10000) / 10000), updatedAt: new Date() })
        .where(eq(usersTable.telegramId, telegramId));

      return [upd];
    });

    res.json({ game: formatGame(updated, true), hit: "safe", row, col, autoWin: true });
    return;
  }

  const [updated] = await db.update(miniIgroGamesTable)
    .set({
      revealed,
      cellsOpen:  newCellsOpen,
      multiplier: String(newMult),
    })
    .where(eq(miniIgroGamesTable.id, game.id))
    .returning();

  res.json({ game: formatGame(updated), hit: "safe", row, col });
});

/* ─── POST /cashout ─── */
router.post("/cashout", async (req, res) => {
  const { telegramId } = req.body as { telegramId?: string };
  if (!telegramId) { res.status(400).json({ error: "telegramId обязателен" }); return; }

  const game = await db.select().from(miniIgroGamesTable)
    .where(and(
      eq(miniIgroGamesTable.telegramId, telegramId),
      eq(miniIgroGamesTable.status, "active"),
    ))
    .orderBy(desc(miniIgroGamesTable.id))
    .limit(1)
    .then(r => r[0] ?? null);

  if (!game) { res.status(404).json({ error: "Нет активной игры" }); return; }
  if (game.cellsOpen === 0) { res.status(400).json({ error: "Нужно открыть хотя бы одну ячейку" }); return; }

  const mult   = Number(game.multiplier);
  const payout = Math.round(Number(game.betTon) * mult * 10000) / 10000;

  const [updated] = await db.transaction(async (tx) => {
    const [upd] = await tx.update(miniIgroGamesTable)
      .set({ status: "won", payout: String(payout), finishedAt: new Date() })
      .where(eq(miniIgroGamesTable.id, game.id))
      .returning();

    const u = await tx.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then(r => r[0]!);
    await tx.update(usersTable)
      .set({ ton: String(Math.round((Number(u.ton) + payout) * 10000) / 10000), updatedAt: new Date() })
      .where(eq(usersTable.telegramId, telegramId));

    return [upd];
  });

  res.json({ game: formatGame(updated, true), payout });
});

export default router;
