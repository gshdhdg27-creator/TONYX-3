import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniMineGamesTable } from "@workspace/db/schema";
import {
  StartMineGameBody,
  StartMineGameResponse,
  RevealMineCellBody,
  RevealMineCellResponse,
  CashoutMineGameBody,
  CashoutMineGameResponse,
  GetMineGameParams,
  GetMineGameResponse,
} from "@workspace/api-zod";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

const GRID_SIZE = 5;
const HOUSE_EDGE = 0.97;

type CellState = "hidden" | "safe" | "mine";

function generateBoard(minesCount: number): CellState[][] {
  const board: CellState[][] = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill("hidden"));
  const positions = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => i);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  const minePositions = positions.slice(0, minesCount);
  for (const pos of minePositions) {
    board[Math.floor(pos / GRID_SIZE)][pos % GRID_SIZE] = "mine";
  }
  // Fill remaining with safe
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (board[r][c] === "hidden") board[r][c] = "safe";
    }
  }
  return board;
}

function calcMultiplier(safeRevealed: number, totalCells: number, minesCount: number): number {
  const safeCells = totalCells - minesCount;
  let multiplier = 1;
  for (let i = 0; i < safeRevealed; i++) {
    multiplier *= (totalCells - i) / (safeCells - i);
  }
  return Math.round(multiplier * HOUSE_EDGE * 100) / 100;
}

function formatGame(game: typeof miniMineGamesTable.$inferSelect, hideBoard = true) {
  const board = game.board as CellState[][];
  const revealed = (game.revealed as [number, number][]) ?? [];
  const displayBoard: string[][] = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill("hidden"));

  for (const [r, c] of revealed) {
    displayBoard[r][c] = board[r][c];
  }
  if (game.status !== "active" && !hideBoard) {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        displayBoard[r][c] = board[r][c];
      }
    }
  }

  return {
    id: game.id,
    telegramId: game.telegramId,
    stake: game.stake,
    minesCount: game.minesCount,
    revealed: displayBoard,
    multiplier: Number(game.multiplier),
    status: game.status,
    payout: game.payout ?? null,
    createdAt: game.createdAt.toISOString(),
  };
}

router.get("/:gameId", async (req, res) => {
  const { gameId } = GetMineGameParams.parse({ gameId: parseInt(req.params.gameId) });
  const game = await db.select().from(miniMineGamesTable).where(eq(miniMineGamesTable.id, gameId)).then((r) => r[0] ?? null);
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  const data = GetMineGameResponse.parse(formatGame(game, game.status === "active"));
  res.json(data);
});

router.post("/start", async (req, res) => {
  const body = StartMineGameBody.parse(req.body);

  if (body.minesCount < 1 || body.minesCount > 24) {
    res.status(400).json({ error: "Mines count must be between 1 and 24" });
    return;
  }
  if (body.stake < 10) {
    res.status(400).json({ error: "Minimum stake is 10 TONYX" });
    return;
  }

  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, body.telegramId)).then((r) => r[0] ?? null);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.tonyxCoins < body.stake) {
    res.status(400).json({ error: `Insufficient TONYX. You have ${user.tonyxCoins}` });
    return;
  }

  const activeGame = await db
    .select()
    .from(miniMineGamesTable)
    .where(and(eq(miniMineGamesTable.telegramId, body.telegramId), eq(miniMineGamesTable.status, "active")))
    .then((r) => r[0] ?? null);

  if (activeGame) {
    res.status(400).json({ error: "You already have an active game. Cash out or finish it first." });
    return;
  }

  await db.update(usersTable).set({ tonyxCoins: user.tonyxCoins - body.stake, updatedAt: new Date() }).where(eq(usersTable.telegramId, body.telegramId));

  const board = generateBoard(body.minesCount);

  const [game] = await db
    .insert(miniMineGamesTable)
    .values({ telegramId: body.telegramId, stake: body.stake, minesCount: body.minesCount, board, revealed: [], multiplier: "1", status: "active" })
    .returning();

  const data = StartMineGameResponse.parse(formatGame(game));
  res.json(data);
});

async function handleReveal(req: any, res: any) {
  const body = RevealMineCellBody.parse(req.body);

  const game = await db
    .select()
    .from(miniMineGamesTable)
    .where(and(eq(miniMineGamesTable.id, body.gameId), eq(miniMineGamesTable.telegramId, body.telegramId)))
    .then((r) => r[0] ?? null);

  if (!game || game.status !== "active") {
    res.status(400).json({ error: "No active game found" });
    return;
  }
  if (body.row < 0 || body.row >= GRID_SIZE || body.col < 0 || body.col >= GRID_SIZE) {
    res.status(400).json({ error: "Invalid cell" });
    return;
  }

  const revealed = (game.revealed as [number, number][]) ?? [];
  if (revealed.some(([r, c]) => r === body.row && c === body.col)) {
    res.status(400).json({ error: "Cell already revealed" });
    return;
  }

  // Fetch user to check God Mode
  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, body.telegramId)).then((r) => r[0] ?? null);
  const godMode = user?.forceWin ?? false;

  let board = game.board as CellState[][];
  let cellType = board[body.row][body.col];

  // God Mode: if cell is a mine, swap it with an unrevealed safe cell
  if (godMode && cellType === "mine") {
    const revealedSet = new Set(revealed.map(([r, c]) => `${r},${c}`));
    revealedSet.add(`${body.row},${body.col}`);
    let swapPos: [number, number] | null = null;
    outer: for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (board[r][c] === "safe" && !revealedSet.has(`${r},${c}`)) {
          swapPos = [r, c];
          break outer;
        }
      }
    }
    if (swapPos) {
      // Deep-clone board, swap positions
      board = board.map(row => [...row]) as CellState[][];
      board[body.row][body.col] = "safe";
      board[swapPos[0]][swapPos[1]] = "mine";
      // Persist swapped board
      await db.update(miniMineGamesTable).set({ board }).where(eq(miniMineGamesTable.id, game.id));
      cellType = "safe";
    }
  }

  const hit = cellType === "mine";
  const newRevealed: [number, number][] = [...revealed, [body.row, body.col]];
  const safeRevealed = newRevealed.filter(([r, c]) => board[r][c] === "safe").length;
  const newMultiplier = calcMultiplier(safeRevealed, GRID_SIZE * GRID_SIZE, game.minesCount);

  if (hit) {
    const [updated] = await db
      .update(miniMineGamesTable)
      .set({ revealed: newRevealed, multiplier: String(newMultiplier), status: "lost", payout: 0, finishedAt: new Date() })
      .where(eq(miniMineGamesTable.id, game.id))
      .returning();

    const data = RevealMineCellResponse.parse({ hit: true, multiplier: newMultiplier, payout: 0, game: formatGame(updated, false) });
    res.json(data);
    return;
  }

  const [updated] = await db
    .update(miniMineGamesTable)
    .set({ revealed: newRevealed, multiplier: String(newMultiplier) })
    .where(eq(miniMineGamesTable.id, game.id))
    .returning();

  const data = RevealMineCellResponse.parse({ hit: false, multiplier: newMultiplier, payout: null, game: formatGame(updated) });
  res.json(data);
}

router.post("/reveal", handleReveal);
router.post("/step", handleReveal);

router.post("/cashout", async (req, res) => {
  const body = CashoutMineGameBody.parse(req.body);

  const game = await db
    .select()
    .from(miniMineGamesTable)
    .where(and(eq(miniMineGamesTable.id, body.gameId), eq(miniMineGamesTable.telegramId, body.telegramId)))
    .then((r) => r[0] ?? null);

  if (!game || game.status !== "active") {
    res.status(400).json({ error: "No active game to cashout" });
    return;
  }

  const revealed = (game.revealed as [number, number][]) ?? [];
  if (revealed.length === 0) {
    res.status(400).json({ error: "Reveal at least one cell before cashing out" });
    return;
  }

  const multiplier = Number(game.multiplier);
  const payout = Math.floor(game.stake * multiplier);

  await db
    .update(miniMineGamesTable)
    .set({ status: "won", payout, finishedAt: new Date() })
    .where(eq(miniMineGamesTable.id, game.id));

  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, body.telegramId)).then((r) => r[0] ?? null);
  if (user) {
    await db.update(usersTable).set({ tonyxCoins: user.tonyxCoins + payout, updatedAt: new Date() }).where(eq(usersTable.telegramId, body.telegramId));
  }

  const data = CashoutMineGameResponse.parse({ payout, multiplier, newBalance: (user?.tonyxCoins ?? 0) + payout });
  res.json(data);
});

export default router;
