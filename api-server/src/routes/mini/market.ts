import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniMarketOrdersTable, systemSettingsTable } from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

/* ─── Category config ─── */
const CATEGORIES = {
  start: { min: 1, max: 10,       bonusPct: 1, label: "START" },
  pro:   { min: 10, max: 25,      bonusPct: 2, label: "PRO"   },
  elite: { min: 25, max: Infinity, bonusPct: 3, label: "ELITE" },
} as const;
type Category = keyof typeof CATEGORIES;
const DAILY_LIMIT = 3;

function getCategory(totalTon: number): Category | null {
  if (totalTon >= 1 && totalTon <= 10)  return "start";
  if (totalTon > 10 && totalTon <= 25)  return "pro";
  if (totalTon > 25)                     return "elite";
  return null;
}

/* ─── Check market active flag ─── */
async function isMarketActive(): Promise<boolean> {
  const rows = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "is_market_active"));
  return rows[0]?.value === "true";
}

/* ─── Reset daily counters if 24h passed ─── */
async function maybeResetDailyCounters(user: typeof usersTable.$inferSelect) {
  const now = new Date();
  const resetAt = user.dailyOrdersResetAt;
  if (!resetAt || now.getTime() - resetAt.getTime() > 24 * 60 * 60 * 1000) {
    await db.update(usersTable).set({
      dailyOrdersStart: 0, dailyOrdersPro: 0, dailyOrdersElite: 0,
      dailyOrdersResetAt: now, updatedAt: now,
    }).where(eq(usersTable.telegramId, user.telegramId));
    return { ...user, dailyOrdersStart: 0, dailyOrdersPro: 0, dailyOrdersElite: 0 };
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

/* ─── GET /orders?category=start|pro|elite ─── */
router.get("/orders", async (req, res) => {
  const cat = req.query.category as string | undefined;

  let query = db.select().from(miniMarketOrdersTable)
    .where(eq(miniMarketOrdersTable.status, "open"))
    .$dynamic();

  if (cat && ["start","pro","elite"].includes(cat)) {
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

/* ─── POST /orders — create sell order ─── */
router.post("/orders", async (req, res) => {
  const { telegramId, amount, pricePerCoin } = req.body as {
    telegramId?: string; amount?: number; pricePerCoin?: number;
  };

  if (!telegramId || !amount || !pricePerCoin) {
    res.status(400).json({ error: "telegramId, amount, pricePerCoin required" }); return;
  }

  if (!(await isMarketActive())) {
    res.status(403).json({ error: "P2P рынок ещё не активирован администратором" }); return;
  }

  const totalTon = parseFloat((amount * pricePerCoin).toFixed(8));
  const category = getCategory(totalTon);

  if (!category) {
    res.status(400).json({ error: "Минимальный ордер — 1 TON (категория START)" }); return;
  }

  let user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then(r => r[0] ?? null);
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }

  /* Reset daily counters if needed */
  user = await maybeResetDailyCounters(user);

  /* Check daily limit */
  const countField = category === "start" ? "dailyOrdersStart" : category === "pro" ? "dailyOrdersPro" : "dailyOrdersElite";
  const currentCount = user[countField];
  if (currentCount >= DAILY_LIMIT) {
    const catLabel = CATEGORIES[category].label;
    res.status(429).json({ error: `Вы исчерпали лимит создания ордеров в категории ${catLabel} на сегодня. Попробуйте завтра!` }); return;
  }

  /* Check TONYX balance */
  if (user.tonyxCoins < amount) {
    res.status(400).json({ error: `Недостаточно TONYX. У вас ${user.tonyxCoins}` }); return;
  }
  if (amount < 1) { res.status(400).json({ error: "Минимум 1 монета" }); return; }

  const bonusPct = CATEGORIES[category].bonusPct;

  /* Deduct TONYX from seller */
  const newCounter = currentCount + 1;
  await db.update(usersTable).set({
    tonyxCoins: user.tonyxCoins - amount,
    [countField === "dailyOrdersStart" ? "dailyOrdersStart" : countField === "dailyOrdersPro" ? "dailyOrdersPro" : "dailyOrdersElite"]: newCounter,
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

  /* Refund TONYX to seller */
  const seller = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then(r => r[0]);
  if (seller) {
    await db.update(usersTable).set({ tonyxCoins: seller.tonyxCoins + order.amount, updatedAt: new Date() })
      .where(eq(usersTable.telegramId, telegramId));
  }

  res.json(formatOrder(updated));
});

/* ─── POST /orders/:id/buy — buy with TON balance ─── */
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

  const totalTon = Number(order.totalTon);
  const buyerTon = Number(buyer.ton);

  if (buyerTon < totalTon) {
    res.status(400).json({ error: `Недостаточно TON. Нужно ${totalTon.toFixed(4)}, у вас ${buyerTon.toFixed(4)}` }); return;
  }

  const bonusPct  = order.bonusPct;
  const bonusCoins = Math.floor(order.amount * (1 + bonusPct / 100));

  /* Mark order sold */
  const [updated] = await db.update(miniMarketOrdersTable)
    .set({ status: "sold", buyerId: telegramId, updatedAt: new Date() })
    .where(eq(miniMarketOrdersTable.id, id))
    .returning();

  /* Deduct TON from buyer, credit TONYX */
  await db.update(usersTable).set({
    ton: String(buyerTon - totalTon),
    tonyxCoins: buyer.tonyxCoins + bonusCoins,
    updatedAt: new Date(),
  }).where(eq(usersTable.telegramId, telegramId));

  /* Credit TON to seller */
  const seller = await db.select().from(usersTable).where(eq(usersTable.telegramId, order.sellerId)).then(r => r[0]);
  if (seller) {
    await db.update(usersTable).set({
      ton: String(Number(seller.ton) + totalTon),
      updatedAt: new Date(),
    }).where(eq(usersTable.telegramId, order.sellerId));
  }

  console.log(`[Market] Order #${id} (${order.category}): buyer ${telegramId} paid ${totalTon} TON, got ${bonusCoins} TONYX (+${bonusPct}%)`);
  res.json({ ...formatOrder(updated), bonusCoins });
});

export default router;
