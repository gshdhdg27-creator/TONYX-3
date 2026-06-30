import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable, systemSettingsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

const POOL_TOTAL    = 1_000_000;
const TONYX_PER_TON = 1_000;
const UNLOCK_THRESHOLD = 1_000_000; // TONYX sold to unlock P2P sell

async function getSystemSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, key));
  return rows[0]?.value ?? null;
}

async function setSystemSetting(key: string, value: string): Promise<void> {
  await db
    .insert(systemSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value, updatedAt: new Date() } });
}

/* GET /market/pool */
router.get("/market/pool", async (_req: Request, res: Response) => {
  const soldRow = await getSystemSetting("total_tonyx_sold");
  const sold = parseInt(soldRow ?? "0") || 0;
  const isMarketActive = sold >= UNLOCK_THRESHOLD;

  res.json({
    total: POOL_TOTAL,
    sold,
    remaining: Math.max(0, POOL_TOTAL - sold),
    tonyxPerTon: TONYX_PER_TON,
    soldOut: sold >= POOL_TOTAL,
    isMarketActive,
    canActivate: isMarketActive,
  });
});

/* POST /market/reserve — buy from system pool (pays TON, gets TONYX) */
router.post("/market/reserve", async (req: Request, res: Response) => {
  const { telegramId, tonAmount } = req.body as { telegramId?: string; tonAmount?: number };
  if (!telegramId || !tonAmount || tonAmount <= 0) {
    return res.status(400).json({ error: "telegramId and tonAmount required" });
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
  if (!user) return res.status(404).json({ error: "User not found" });

  const userTon = Number(user.ton);
  if (userTon < tonAmount) {
    return res.status(400).json({ error: `Недостаточно TON. У вас ${userTon.toFixed(4)} TON` });
  }

  const soldStr = await getSystemSetting("total_tonyx_sold");
  const sold = parseInt(soldStr ?? "0") || 0;
  const remaining = POOL_TOTAL - sold;
  const coins = Math.floor(tonAmount * TONYX_PER_TON);

  if (coins <= 0) {
    return res.status(400).json({ error: "Слишком маленькая сумма" });
  }

  if (coins > remaining) {
    return res.status(400).json({ error: `В пуле только ${remaining.toLocaleString()} TONYX` });
  }

  const newSold = sold + coins;
  const newTon = userTon - tonAmount;

  await Promise.all([
    db.update(usersTable).set({
      tonyxCoins: user.tonyxCoins + coins,
      ton: String(newTon),
      totalTonDeposited: String(Number(user.totalTonDeposited) + tonAmount),
      updatedAt: new Date(),
    }).where(eq(usersTable.telegramId, telegramId)),
    setSystemSetting("total_tonyx_sold", String(newSold)),
  ]);

  const isMarketNowActive = newSold >= UNLOCK_THRESHOLD;
  if (isMarketNowActive) {
    await setSystemSetting("is_market_active", "true");
  }

  console.log(`[Pool] ${telegramId}: ${tonAmount} TON → ${coins} TONYX (total sold: ${newSold})`);

  res.json({
    status: "confirmed",
    coins,
    tonAmount,
    newTon,
    totalSold: newSold,
    marketUnlocked: isMarketNowActive,
    message: `+${coins.toLocaleString()} TONYX зачислено на ваш баланс`,
  });
});

export default router;
