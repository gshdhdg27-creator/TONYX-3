import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";
import { randomBytes } from "crypto";

const router: IRouter = Router();
const MIN_STAKE = 0.1;
const MIN_ROWS = 8;
const MAX_ROWS = 16;

function buildTable(rows: number, risk: "low" | "med" | "high"): number[] {
  const TABLES: Record<string, Record<number, number[]>> = {
    low: {
      8:  [2.0, 1.5, 1.2, 1.0, 0.9, 1.0, 1.2, 1.5, 2.0],
      9:  [2.2, 1.6, 1.3, 1.1, 0.9, 0.9, 1.1, 1.3, 1.6, 2.2],
      10: [2.5, 1.8, 1.4, 1.1, 1.0, 0.8, 1.0, 1.1, 1.4, 1.8, 2.5],
      11: [2.8, 2.0, 1.5, 1.2, 1.0, 0.9, 0.9, 1.0, 1.2, 1.5, 2.0, 2.8],
      12: [3.2, 2.1, 1.6, 1.3, 1.1, 1.0, 0.8, 1.0, 1.1, 1.3, 1.6, 2.1, 3.2],
      13: [3.5, 2.3, 1.7, 1.4, 1.1, 1.0, 0.9, 0.9, 1.0, 1.1, 1.4, 1.7, 2.3, 3.5],
      14: [4.0, 2.5, 1.8, 1.4, 1.2, 1.0, 0.9, 0.8, 0.9, 1.0, 1.2, 1.4, 1.8, 2.5, 4.0],
      15: [4.5, 2.8, 2.0, 1.5, 1.2, 1.0, 0.9, 0.8, 0.8, 0.9, 1.0, 1.2, 1.5, 2.0, 2.8, 4.5],
      16: [5.0, 3.0, 2.1, 1.6, 1.3, 1.1, 1.0, 0.9, 0.8, 0.9, 1.0, 1.1, 1.3, 1.6, 2.1, 3.0, 5.0],
    },
    med: {
      8:  [5.6, 2.1, 1.1, 0.9, 0.6, 0.9, 1.1, 2.1, 5.6],
      9:  [7.0, 2.5, 1.4, 1.0, 0.6, 0.6, 1.0, 1.4, 2.5, 7.0],
      10: [8.5, 3.0, 1.6, 1.1, 0.7, 0.5, 0.7, 1.1, 1.6, 3.0, 8.5],
      11: [10, 3.5, 1.8, 1.2, 0.8, 0.5, 0.5, 0.8, 1.2, 1.8, 3.5, 10],
      12: [13, 4.0, 2.0, 1.3, 0.8, 0.5, 0.4, 0.5, 0.8, 1.3, 2.0, 4.0, 13],
      13: [15, 5.0, 2.3, 1.4, 0.9, 0.5, 0.4, 0.4, 0.5, 0.9, 1.4, 2.3, 5.0, 15],
      14: [18, 6.0, 2.6, 1.5, 1.0, 0.6, 0.4, 0.3, 0.4, 0.6, 1.0, 1.5, 2.6, 6.0, 18],
      15: [22, 7.0, 3.0, 1.6, 1.0, 0.6, 0.4, 0.3, 0.3, 0.4, 0.6, 1.0, 1.6, 3.0, 7.0, 22],
      16: [26, 8.0, 3.5, 1.8, 1.1, 0.7, 0.5, 0.3, 0.2, 0.3, 0.5, 0.7, 1.1, 1.8, 3.5, 8.0, 26],
    },
    high: {
      8:  [13, 4.0, 1.5, 0.6, 0.3, 0.6, 1.5, 4.0, 13],
      9:  [18, 5.0, 1.8, 0.7, 0.3, 0.3, 0.7, 1.8, 5.0, 18],
      10: [22, 6.0, 2.0, 0.8, 0.4, 0.2, 0.4, 0.8, 2.0, 6.0, 22],
      11: [28, 7.0, 2.3, 0.9, 0.4, 0.2, 0.2, 0.4, 0.9, 2.3, 7.0, 28],
      12: [33, 8.0, 2.5, 1.0, 0.5, 0.2, 0.1, 0.2, 0.5, 1.0, 2.5, 8.0, 33],
      13: [40, 10, 3.0, 1.1, 0.5, 0.2, 0.1, 0.1, 0.2, 0.5, 1.1, 3.0, 10, 40],
      14: [50, 12, 3.5, 1.2, 0.6, 0.3, 0.15, 0.1, 0.15, 0.3, 0.6, 1.2, 3.5, 12, 50],
      15: [60, 15, 4.0, 1.4, 0.6, 0.3, 0.15, 0.1, 0.1, 0.15, 0.3, 0.6, 1.4, 4.0, 15, 60],
      16: [75, 18, 5.0, 1.6, 0.7, 0.3, 0.15, 0.1, 0.05, 0.1, 0.15, 0.3, 0.7, 1.6, 5.0, 18, 75],
    },
  };
  const byRisk = TABLES[risk] ?? TABLES.med;
  const table = byRisk[rows];
  if (table && table.length === rows + 1) return table;
  const keys = Object.keys(byRisk).map(Number).sort((a, b) => a - b);
  const nearest = keys.reduce((a, b) => (Math.abs(b - rows) < Math.abs(a - rows) ? b : a), 12);
  return byRisk[nearest] ?? TABLES.med![12]!;
}

function dropBall(slots: number): { path: number[]; slot: number } {
  const path: number[] = [];
  let pos = 0;
  const rows = slots - 1;
  for (let i = 0; i < rows; i++) {
    const right = (randomBytes(1)[0]! & 1) === 1;
    path.push(right ? 1 : 0);
    if (right) pos += 1;
  }
  return { path, slot: pos };
}

router.get("/info", (_req, res) => {
  res.json({
    minStake: MIN_STAKE,
    minRows: MIN_ROWS,
    maxRows: MAX_ROWS,
    risks: ["low", "med", "high"],
  });
});

router.post("/play", async (req, res) => {
  try {
    if (!(await isGameEnabled("plinko"))) {
      res.status(403).json({ error: GAME_DISABLED_MESSAGE });
      return;
    }

    const telegramId = String(req.body?.telegramId ?? "");
    const stakeRaw = Number(req.body?.stake);
    const riskRaw = String(req.body?.risk ?? "med");
    const risk = (riskRaw === "low" || riskRaw === "high" ? riskRaw : "med") as "low" | "med" | "high";
    let rows = Math.round(Number(req.body?.rows) || 12);
    if (!Number.isFinite(rows) || rows < MIN_ROWS || rows > MAX_ROWS) rows = 12;

    if (!telegramId) {
      res.status(400).json({ error: "telegramId required" });
      return;
    }
    if (!Number.isFinite(stakeRaw) || stakeRaw < MIN_STAKE) {
      res.status(400).json({ error: `Minimum stake is ${MIN_STAKE} TON` });
      return;
    }

    const table = buildTable(rows, risk);
    const stake = Math.round(stakeRaw * 1000) / 1000;

    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .then((r) => r[0] ?? null);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const bal = Number(user.ton ?? 0);
    if (bal < stake) {
      res.status(400).json({ error: `Insufficient TON. You have ${bal}` });
      return;
    }

    let newBalance = Math.round((bal - stake) * 1000) / 1000;
    await db
      .update(usersTable)
      .set({ ton: String(newBalance), updatedAt: new Date() })
      .where(eq(usersTable.telegramId, telegramId));

    let { path, slot } = dropBall(table.length);
    if (user.forceWin) {
      const best = table.reduce((bi, v, i, a) => (v > a[bi]! ? i : bi), 0);
      slot = best;
      path = Array.from({ length: rows }, (_, i) => (i < best ? 1 : 0));
    }

    const mult = table[slot] ?? 0;
    const payout = Math.round(stake * mult * 1000) / 1000;

    if (payout > 0) {
      newBalance = Math.round((newBalance + payout) * 1000) / 1000;
      await db
        .update(usersTable)
        .set({
          ton: String(newBalance),
          wins: (user.wins ?? 0) + (payout >= stake ? 1 : 0),
          losses: (user.losses ?? 0) + (payout < stake ? 1 : 0),
          totalGamesPlayed: (user.totalGamesPlayed ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.telegramId, telegramId));
    } else {
      await db
        .update(usersTable)
        .set({
          losses: (user.losses ?? 0) + 1,
          totalGamesPlayed: (user.totalGamesPlayed ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.telegramId, telegramId));
    }

    res.json({
      ok: true,
      stake,
      risk,
      rows,
      path,
      slot,
      multiplier: mult,
      multipliers: table,
      payout,
      profit: Math.round((payout - stake) * 1000) / 1000,
      newBalance,
    });
  } catch (e: any) {
    console.error("[plinko/play]", e);
    res.status(500).json({ error: e?.message ?? "Plinko failed" });
  }
});

export default router;
