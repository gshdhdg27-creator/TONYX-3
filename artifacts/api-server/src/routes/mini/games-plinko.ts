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

/** Symmetric multiplier tables by risk and row count (slots = rows + 1) */
function buildTable(rows: number, risk: "low" | "med" | "high"): number[] {
  const n = rows + 1; // buckets
  const half = Math.floor(n / 2);
  const out: number[] = new Array(n);

  // edge peaks by risk
  const edge =
    risk === "high" ? 110 : risk === "med" ? 18 : 5.6;
  const mid =
    risk === "high" ? 0.2 : risk === "med" ? 0.5 : 0.9;

  for (let i = 0; i < n; i++) {
    const d = Math.abs(i - (n - 1) / 2) / Math.max(half, 1); // 0 center → 1 edge
    let m: number;
    if (risk === "high") {
      // U-shape: edges high, center low
      m = mid + (edge - mid) * Math.pow(d, 2.4);
    } else if (risk === "med") {
      m = mid + (edge - mid) * Math.pow(d, 1.8);
    } else {
      // low: flatter, mild edges
      m = mid + (edge - mid) * Math.pow(d, 1.2);
    }
    // snap to nice values
    if (m >= 10) m = Math.round(m);
    else if (m >= 2) m = Math.round(m * 10) / 10;
    else m = Math.round(m * 100) / 100;
    out[i] = m;
  }

  // known good overrides matching popular boards
  if (rows === 12 && risk === "high") {
    return [76, 17, 6, 2.2, 0.8, 0.2, 0.1, 0.2, 0.8, 2.2, 6, 17, 76];
  }
  if (rows === 12 && risk === "med") {
    return [13, 6, 3, 1.5, 0.7, 0.5, 0.4, 0.5, 0.7, 1.5, 3, 6, 13];
  }
  if (rows === 12 && risk === "low") {
    return [4, 2.2, 1.4, 1.1, 1, 0.9, 0.8, 0.9, 1, 1.1, 1.4, 2.2, 4];
  }
  if (rows === 16 && risk === "high") {
    return [170, 45, 12, 5, 2.2, 0.8, 0.4, 0.2, 0.1, 0.2, 0.4, 0.8, 2.2, 5, 12, 45, 170];
  }
  if (rows === 8 && risk === "high") {
    return [29, 8, 2.5, 0.8, 0.4, 0.8, 2.5, 8, 29];
  }
  if (rows === 8 && risk === "med") {
    return [5.6, 2.1, 1.1, 0.8, 0.6, 0.8, 1.1, 2.1, 5.6];
  }
  if (rows === 8 && risk === "low") {
    return [2.5, 1.5, 1.2, 1, 0.9, 1, 1.2, 1.5, 2.5];
  }
  if (rows === 16 && risk === "med") {
    return [16, 9, 4, 2, 1.2, 0.7, 0.5, 0.4, 0.3, 0.4, 0.5, 0.7, 1.2, 2, 4, 9, 16];
  }
  if (rows === 16 && risk === "low") {
    return [5, 2.5, 1.6, 1.2, 1, 0.9, 0.8, 0.7, 0.7, 0.7, 0.8, 0.9, 1, 1.2, 1.6, 2.5, 5];
  }

  return out;
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
