import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniMarketOrdersTable, systemSettingsTable } from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

/* ─── Category config: START/BASE/PRO/ELITE ─── */
const CATEGORIES = {
  start: { min: 3,   max: 10,       bonusPct: 0.5, label: "START" },
  base:  { min: 10,  max: 50,       bonusPct: 1,   label: "BASE"  },
  pro:   { min: 50,  max: 100,      bonusPct: 2,   label: "PRO"   },
  elite: { min: 100, max: Infinity, bonusPct: 3,   label: "ELITE" },
} as const;
type Category = keyof typeof CATEGORIES;
const DAILY_LIMIT = 3;
const FIXED_RATE = 50; // 1 TON = 50 TONYX

function getCategory(totalTon: number): Category | null {
  if (totalTon >= 3   && totalTon <= 10)  return "start";
  if (totalTon > 10   && totalTon <= 50)  return "base";
  if (totalTon > 50   && totalTon <= 100) return "pro";
  if (totalTon > 100)                     return "elite";
  return null;
}

async function isMarketActive(): Promise<boolean> {
  const rows = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "is_market_active"));
  return rows[0]?.value === "true";
}

async function maybeResetDailyCounters(user: typeof usersTable.$inferSelect) {
  const now = new Date();
  const resetAt = user.dailyOrdersResetAt;
  if (!resetAt || now.getTime() - resetAt.getTime() > 24 * 60 * 60 * 1000) {
    await db.update(usersTable).set({
      dailyOrdersStart: 0, dailyOrdersBase: 0, dailyOrdersPro: 0, dailyOrdersElite: 0,
      dailyOrdersResetAt: now, updatedAt: now,
    }).where(eq(usersTable.telegramId, user.telegramId));
    return { ...user, dailyOrdersStart: 0, dailyOrdersBase: 0, dailyOrdersPro: 0, dailyOrdersElite: 0 };
  }
  return user;
}

function formatOrder(order: typeof miniMarketOrdersTable.$inferSelect) {
  const price    = Number(order.pricePerCoin);
  const totalTon = Number(order.totalTon) || parseFloat((order.amount * price).toFixed(8));
  const bonusPct = order.bonusPct;
  const bonusCoins = Math.floor(order.amount * (1 + bonusPct / 100));
  const returnTon  = parseFloat((bonusCoins * price).toFixed(8));
  return {
    id: order.id,
    sellerId: order.sellerId,
    sellerUsername: order.sellerUsername ?? null,
    amount: order.amount,
    pricePerCoin: price,
    totalTon,
    category: order.category as Category,
    bonusPct,
    bonusCoins,
    returnTon,
    status: order.status,
    buyerId: order.buyerId ?? null,
    createdAt: order.createdAt.toISOString(),
  };
}

/* ─── GET /orders?category=start|base|pro|elite ─── */
router.get("/orders", async (req, res) => {
  const cat = req.query.category as string | undefined;

  let query = db.select().from(miniMarketOrdersTable)
    .where(eq(miniMarketOrdersTable.status, "open"))
    .$dynamic();

  if (cat && ["start","base","pro","elite"].includes(cat)) {
    query = query.where(and(
      eq(miniMarketOrdersTable.status, "open"),
      eq(miniMarketOrdersTable.category, cat),
    ));
  }

  const orders = await query.orderBy(desc(miniMarketOrdersTable.createdAt));
  res.json({ orders: orders.map(formatOrder) });
});

/* ─── GET /orders/mine ─── */
router.get("/orders/mine", async (req, res) => {
  const telegramId = req.query.telegramId as string | undefined;
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  const orders = await db.select().from(miniMarketOrdersTable)
    .where(eq(miniMarketOrdersTable.sellerId, telegramId))
    .orderBy(desc(miniMarketOrdersTable.createdAt)).limit(50);

  res.json({ orders: orders.map(formatOrder) });
});

/* ─── GET /stats — aggregate stats for market page ─── */
router.get("/stats", async (_req, res) => {
  const openOrders = await db.select().from(miniMarketOrdersTable)
    .where(eq(miniMarketOrdersTable.status, "open"));

  const soldOrders = await db.select().from(miniMarketOrdersTable)
    .where(eq(miniMarketOrdersTable.status, "sold"));

  const inOrdersTon = openOrders.reduce((s, o) => s + Number(o.totalTon), 0);

  // 24h volume: sum of soldOrders in last 24h
  const now = Date.now();
  const volume24h = soldOrders
    .filter(o => now - o.createdAt.getTime() < 86_400_000)
    .reduce((s, o) => s + Number(o.totalTon), 0);

  // Average profit based on tier distribution
  const avgProfit = 1.5; // simplified average

  res.json({
    inOrdersTon: parseFloat(inOrdersTon.toFixed(2)),
    volume24h: parseFloat(volume24h.toFixed(2)),
    avgProfit,
    openCount: openOrders.length,
  });
});

/* ─── POST /orders — create sell order (fixed rate: 1 TON = 50 TONYX) ─── */
router.post("/orders", async (req, res) => {
  const { telegramId, tonAmount } = req.body as {
    telegramId?: string; tonAmount?: number;
  };

  if (!telegramId || !tonAmount) {
    res.status(400).json({ error: "telegramId, tonAmount required" }); return;
  }

  if (!(await isMarketActive())) {
    res.status(403).json({ error: "P2P рынок ещё не активирован администратором" }); return;
  }

  const totalTon = parseFloat(tonAmount.toFixed(8));
  const category = getCategory(totalTon);

  if (!category) {
    res.status(400).json({ error: "Минимальный ордер — 3 TON (категория START). Максимум не ограничен." }); return;
  }

  const pricePerCoin = 1 / FIXED_RATE; // 0.02 TON per TONYX
  const amount = Math.floor(totalTon * FIXED_RATE); // TONYX to put in escrow

  let user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then(r => r[0] ?? null);
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }

  user = await maybeResetDailyCounters(user);

  const countField = (
    category === "start" ? "dailyOrdersStart" :
    category === "base"  ? "dailyOrdersBase"  :
    category === "pro"   ? "dailyOrdersPro"   :
    "dailyOrdersElite"
  ) as keyof typeof user;

  const currentCount = user[countField] as number;
  if (currentCount >= DAILY_LIMIT) {
    const catLabel = CATEGORIES[category].label;
    res.status(429).json({ error: `Лимит ордеров в категории ${catLabel} исчерпан на сегодня` }); return;
  }

  if (user.tonyxCoins < amount) {
    res.status(400).json({ error: `Недостаточно TONYX. Нужно ${amount}, у вас ${user.tonyxCoins}` }); return;
  }

  const bonusPct = CATEGORIES[category].bonusPct;

  await db.update(usersTable).set({
    tonyxCoins: user.tonyxCoins - amount,
    [countField]: currentCount + 1,
    updatedAt: new Date(),
  }).where(eq(usersTable.telegramId, telegramId));

  const [order] = await db.insert(miniMarketOrdersTable).values({
    sellerId: telegramId,
    sellerUsername: user.username ?? null,
    amount,
    pricePerCoin: String(pricePerCoin),
    totalTon: String(totalTon),
    category,
    bonusPct,
    status: "open",
  }).returning();

  res.json(formatOrder(order));
});

/* ─── DELETE /orders/:id — cancel order ─── */
router.delete("/orders/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { telegramId } = req.body as { telegramId: string };

  const order = await db.select().from(miniMarketOrdersTable)
    .where(and(eq(miniMarketOrdersTable.id, id), eq(miniMarketOrdersTable.status, "open")))
    .then(r => r[0] ?? null);

  if (!order) { res.status(404).json({ error: "Ордер не найден или уже закрыт" }); return; }
  if (order.sellerId !== telegramId) { res.status(403).json({ error: "Это не ваш ордер" }); return; }

  const [updated] = await db.update(miniMarketOrdersTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(miniMarketOrdersTable.id, id))
    .returning();

  const seller = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then(r => r[0]);
  if (seller) {
    await db.update(usersTable).set({ tonyxCoins: seller.tonyxCoins + order.amount, updatedAt: new Date() })
      .where(eq(usersTable.telegramId, telegramId));
  }

  res.json(formatOrder(updated));
});

/* ─── POST /orders/:id/buy ─── */
router.post("/orders/:id/buy", async (req, res) => {
  const id = parseInt(req.params.id);
  const { telegramId } = req.body as { telegramId: string };

  if (!(await isMarketActive())) {
    res.status(403).json({ error: "P2P рынок ещё не активирован" }); return;
  }

  const order = await db.select().from(miniMarketOrdersTable)
    .where(and(eq(miniMarketOrdersTable.id, id), eq(miniMarketOrdersTable.status, "open")))
    .then(r => r[0] ?? null);

  if (!order) { res.status(404).json({ error: "Ордер не найден или уже продан" }); return; }
  if (order.sellerId === telegramId) { res.status(400).json({ error: "Нельзя купить свой ордер" }); return; }

  const buyer = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then(r => r[0] ?? null);
  if (!buyer) { res.status(404).json({ error: "Покупатель не найден" }); return; }

  const totalTon  = Number(order.totalTon);
  const buyerTon  = Number(buyer.ton);

  if (buyerTon < totalTon) {
    res.status(400).json({ error: `Недостаточно TON. Нужно ${totalTon.toFixed(4)}, у вас ${buyerTon.toFixed(4)}` }); return;
  }

  const bonusPct   = order.bonusPct;
  const bonusCoins = Math.floor(order.amount * (1 + bonusPct / 100));
  const EXP_REWARD = 25;

  const [updated] = await db.update(miniMarketOrdersTable)
    .set({ status: "sold", buyerId: telegramId, updatedAt: new Date() })
    .where(eq(miniMarketOrdersTable.id, id))
    .returning();

  await db.update(usersTable).set({
    ton: String(buyerTon - totalTon),
    tonyxCoins: buyer.tonyxCoins + bonusCoins,
    updatedAt: new Date(),
  }).where(eq(usersTable.telegramId, telegramId));

  const seller = await db.select().from(usersTable).where(eq(usersTable.telegramId, order.sellerId)).then(r => r[0]);
  if (seller) {
    await db.update(usersTable).set({
      ton: String(Number(seller.ton) + totalTon),
      updatedAt: new Date(),
    }).where(eq(usersTable.telegramId, order.sellerId));
  }

  console.log(`[Market] Order #${id} (${order.category}): buyer ${telegramId} paid ${totalTon} TON, got ${bonusCoins} TONYX (+${bonusPct}%)`);
  res.json({ ...formatOrder(updated), bonusCoins, bonusPct, expReward: EXP_REWARD });
});

export default router;
