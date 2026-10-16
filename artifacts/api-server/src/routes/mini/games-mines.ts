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
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";

const router: IRouter = Router();

const GRID_SIZE = 5;
const HOUSE_EDGE = 0.97;
/** Same currency as Spin — real TON. Stored as milliTON (×1000). */
const MIN_STAKE = 0.1;

type CellState = "hidden" | "safe" | "mine";

function toMilli(ton: number): number {
  return Math.round(ton * 1000);
}
function fromMilli(milli: number): number {
  return Math.round(milli) / 1000;
}

function generateBoard(minesCount: number): CellState[][] {
  const board: CellState[][] = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill("hidden"));
  const positions = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => i);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  for (const pos of positions.slice(0, minesCount)) {
    board[Math.floor(pos / GRID_SIZE)][pos % GRID_SIZE] = "mine";
  }
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

function countSafeOnBoard(board: CellState[][], revealed: [number, number][]): number {
  return revealed.filter(([r, c]) => board[r]?.[c] === "safe").length;
}

function formatGame(game: typeof miniMineGamesTable.$inferSelect, hideBoard = true) {
  const board = game.board as CellState[][];
  const revealed = (game.revealed as [number, number][]) ?? [];
  const displayBoard: string[][] = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill("hidden"));

  for (const [r, c] of revealed) {
    if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
      displayBoard[r][c] = board[r][c];
    }
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
    stake: fromMilli(game.stake),
    minesCount: game.minesCount,
    revealed: displayBoard,
    multiplier: Number(game.multiplier),
    status: game.status,
    payout: game.payout != null ? fromMilli(game.payout) : null,
    safeCount: countSafeOnBoard(board, revealed),
    createdAt: game.createdAt.toISOString(),
  };
}

/** GET /active?telegramId= — resume stuck / open game. MUST be before /:gameId */
router.get("/active", async (req, res) => {
  const telegramId = String(req.query.telegramId ?? "");
  if (!telegramId) {
    res.status(400).json({ error: "telegramId required" });
    return;
  }
  const game = await db
    .select()
    .from(miniMineGamesTable)
    .where(and(eq(miniMineGamesTable.telegramId, telegramId), eq(miniMineGamesTable.status, "active")))
    .then((r) => r[0] ?? null);

  if (!game) {
    res.json({ game: null });
    return;
  }
  res.json({ game: formatGame(game) });
});

/** POST /abandon — force-close stuck active game without payout (refund stake) */
router.post("/abandon", async (req, res) => {
  const telegramId = String(req.body?.telegramId ?? "");
  if (!telegramId) {
    res.status(400).json({ error: "telegramId required" });
    return;
  }
  const game = await db
    .select()
    .from(miniMineGamesTable)
    .where(and(eq(miniMineGamesTable.telegramId, telegramId), eq(miniMineGamesTable.status, "active")))
    .then((r) => r[0] ?? null);

  if (!game) {
    res.json({ ok: true, refunded: 0 });
    return;
  }

  const stakeTon = fromMilli(game.stake);
  await db
    .update(miniMineGamesTable)
    .set({ status: "lost", payout: 0, finishedAt: new Date() })
    .where(eq(miniMineGamesTable.id, game.id));

  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null);
  let newBalance = 0;
  if (user) {
    newBalance = Math.round((Number(user.ton ?? 0) + stakeTon) * 1000) / 1000;
    await db
      .update(usersTable)
      .set({ ton: String(newBalance), updatedAt: new Date() })
      .where(eq(usersTable.telegramId, telegramId));
  }

  res.json({ ok: true, refunded: stakeTon, newBalance });
});

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

  if (!(await isGameEnabled("mines"))) {
    res.status(403).json({ error: GAME_DISABLED_MESSAGE });
    return;
  }

  if (body.minesCount < 1 || body.minesCount > 24) {
    res.status(400).json({ error: "Mines count must be between 1 and 24" });
    return;
  }

  const stakeTon = Math.round(Number(body.stake) * 1000) / 1000;
  if (!Number.isFinite(stakeTon) || stakeTon < MIN_STAKE) {
    res.status(400).json({ error: `Minimum stake is ${MIN_STAKE} TON` });
    return;
  }

  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, body.telegramId)).then((r) => r[0] ?? null);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const activeGame = await db
    .select()
    .from(miniMineGamesTable)
    .where(and(eq(miniMineGamesTable.telegramId, body.telegramId), eq(miniMineGamesTable.status, "active")))
    .then((r) => r[0] ?? null);

  if (activeGame) {
    res.json({ ...formatGame(activeGame), resumed: true });
    return;
  }

  const tonBal = Number(user.ton ?? 0);
  if (tonBal < stakeTon) {
    res.status(400).json({ error: `Insufficient TON. You have ${tonBal}` });
    return;
  }

  const newTon = Math.round((tonBal - stakeTon) * 1000) / 1000;
  await db
    .update(usersTable)
    .set({ ton: String(newTon), updatedAt: new Date() })
    .where(eq(usersTable.telegramId, body.telegramId));

  const board = generateBoard(body.minesCount);
  const stakeMilli = toMilli(stakeTon);

  const [game] = await db
    .insert(miniMineGamesTable)
    .values({
      telegramId: body.telegramId,
      stake: stakeMilli,
      minesCount: body.minesCount,
      board,
      revealed: [],
      multiplier: "1",
      status: "active",
    })
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

  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, body.telegramId)).then((r) => r[0] ?? null);
  const godMode = user?.forceWin ?? false;

  let board = game.board as CellState[][];
  let cellType = board[body.row][body.col];

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
      board = board.map((row) => [...row]) as CellState[][];
      board[body.row][body.col] = "safe";
      board[swapPos[0]][swapPos[1]] = "mine";
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
  const stakeTon = fromMilli(game.stake);
  const payoutTon = Math.round(stakeTon * multiplier * 1000) / 1000;
  const payoutMilli = toMilli(payoutTon);

  await db
    .update(miniMineGamesTable)
    .set({ status: "won", payout: payoutMilli, finishedAt: new Date() })
    .where(eq(miniMineGamesTable.id, game.id));

  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, body.telegramId)).then((r) => r[0] ?? null);
  let newBalance = 0;
  if (user) {
    newBalance = Math.round((Number(user.ton ?? 0) + payoutTon) * 1000) / 1000;
    await db
      .update(usersTable)
      .set({ ton: String(newBalance), updatedAt: new Date() })
      .where(eq(usersTable.telegramId, body.telegramId));
  }

  const data = CashoutMineGameResponse.parse({ payout: payoutTon, multiplier, newBalance });
  res.json(data);
});

export default router;
