import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable, systemSettingsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

const POOL_TOTAL    = 1_000_000;
const COINS_PER_TON = 1_000;

async function getSystemSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, key));
  return rows[0]?.value ?? null;
}

/* GET /market/pool */
router.get("/market/pool", async (_req: Request, res: Response) => {
  const [soldRow, activeSetting] = await Promise.all([
    db.execute<{ sold: number }>(
      sql`SELECT COALESCE(SUM(amount),0)::int AS sold FROM mini_market_orders WHERE status = 'sold'`,
    ),
    getSystemSetting("is_market_active"),
  ]);
  const sold         = soldRow.rows[0]?.sold ?? 0;
  const isActive     = activeSetting === "true";
  const canActivate  = sold >= POOL_TOTAL;

  res.json({
    total: POOL_TOTAL,
    sold,
    remaining: Math.max(0, POOL_TOTAL - sold),
    coinsPerTon: COINS_PER_TON,
    soldOut: sold >= POOL_TOTAL,
    isMarketActive: isActive,
    canActivate,
  });
});

/* POST /market/reserve — buy from system pool (before P2P is active) */
router.post("/market/reserve", async (req: Request, res: Response) => {
  const { telegramId, tonAmount } = req.body as { telegramId?: string; tonAmount?: number };
  if (!telegramId || !tonAmount || tonAmount <= 0) {
    return res.status(400).json({ error: "telegramId and tonAmount required" });
  }

  const isActive = await getSystemSetting("is_market_active");
  if (isActive === "true") {
    return res.status(400).json({ error: "Системный маркет отключён — используйте P2P рынок" });
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
  if (!user) return res.status(404).json({ error: "User not found" });

  const soldRow = await db.execute<{ sold: number }>(
    sql`SELECT COALESCE(SUM(amount),0)::int AS sold FROM mini_market_orders WHERE status = 'sold'`,
  );
  const sold = soldRow.rows[0]?.sold ?? 0;
  const remaining = POOL_TOTAL - sold;
  const coins = Math.floor(tonAmount * COINS_PER_TON);

  if (coins > remaining) {
    return res.status(400).json({ error: `В пуле только ${remaining.toLocaleString()} монет` });
  }

  /* Credit TONYX to buyer + track deposit */
  await db.update(usersTable).set({
    tonyxCoins: user.tonyxCoins + coins,
    totalTonDeposited: String(Number(user.totalTonDeposited) + tonAmount),
    updatedAt: new Date(),
  }).where(eq(usersTable.telegramId, telegramId));

  res.json({
    status: "confirmed",
    coins,
    tonAmount,
    message: `+${coins.toLocaleString()} TONYX зачислено на ваш баланс`,
  });
});

export default router;
