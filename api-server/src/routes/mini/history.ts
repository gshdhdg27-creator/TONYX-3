import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/history/:telegramId", async (req: Request, res: Response) => {
  const tid = req.params.telegramId;

  const ads = await db.execute<{ id: number; coins_earned: number; viewed_at: string }>(
    sql`SELECT id, coins_earned, viewed_at FROM ad_views WHERE telegram_id = ${tid} ORDER BY viewed_at DESC LIMIT 20`,
  );
  const wd = await db.execute<{ id: number; amount: number; ton_amount: string | null; status: string; created_at: string }>(
    sql`SELECT id, amount, ton_amount, status, created_at FROM mini_withdrawals WHERE telegram_id = ${tid} ORDER BY created_at DESC LIMIT 20`,
  );
  const mines = await db.execute<{ id: number; stake: number; payout: number | null; status: string; finished_at: string | null; created_at: string }>(
    sql`SELECT id, stake, payout, status, finished_at, created_at FROM mini_mine_games WHERE telegram_id = ${tid} AND status != 'active' ORDER BY COALESCE(finished_at, created_at) DESC LIMIT 20`,
  );

  type Item = {
    kind: "ad" | "withdraw" | "game";
    id: number;
    timestamp: string;
    title: string;
    amount: number;
    positive: boolean;
    status?: string;
  };

  const items: Item[] = [];

  for (const a of ads.rows) {
    items.push({
      kind: "ad",
      id: a.id,
      timestamp: new Date(a.viewed_at).toISOString(),
      title: "Watched ad",
      amount: a.coins_earned,
      positive: true,
    });
  }
  for (const w of wd.rows) {
    items.push({
      kind: "withdraw",
      id: w.id,
      timestamp: new Date(w.created_at).toISOString(),
      title: `Withdraw → ${w.ton_amount ? Number(w.ton_amount).toFixed(4) : "?"} TON`,
      amount: -w.amount,
      positive: false,
      status: w.status,
    });
  }
  for (const m of mines.rows) {
    const won = m.status === "won" && m.payout && m.payout > 0;
    items.push({
      kind: "game",
      id: m.id,
      timestamp: new Date(m.finished_at ?? m.created_at).toISOString(),
      title: won ? "Mines win" : "Mines loss",
      amount: won ? (m.payout ?? 0) - m.stake : -m.stake,
      positive: !!won,
    });
  }

  items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  res.json({ items: items.slice(0, 30) });
});

export default router;
