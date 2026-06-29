import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniMarketOrdersTable, systemSettingsTable } from "@workspace/db/schema";
import { eq, and, desc, asc } from "drizzle-orm";

const router: IRouter = Router();

/* ─── Idempotency cache (30s TTL, prevents double-spend on retries) ─── */
const idemCache = new Map<string, { status: number; body: Record<string, unknown>; exp: number }>();
const IDEM_TTL  = 30_000;
const idemClean = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of idemCache) if (v.exp < now) idemCache.delete(k);
}, 60_000);
if (idemClean.unref) idemClean.unref();

/* ─── Category config: START/BASE/PRO/ELITE ─── */
const CATEGORIES = {
  start: { min: 3,   max: 10,       bonusPct: 1.4, minPartialBuy: 1,  label: "START" },
  base:  { min: 10,  max: 50,       bonusPct: 1.7, minPartialBuy: 10, label: "BASE"  },
  pro:   { min: 50,  max: 100,      bonusPct: 2,   minPartialBuy: 25, label: "PRO"   },
  elite: { min: 100, max: Infinity, bonusPct: 2.5, minPartialBuy: 50, label: "ELITE" },
} as const;
type Category = keyof typeof CATEGORIES;
const DAILY_LIMIT = 3;
const FIXED_RATE  = 1000; // 1 TON = 1000 TONYX

function getCategory(totalTon: number): Category | null {
  if (totalTon >= 3   && totalTon <= 10)  return "start";
  if (totalTon > 10   && totalTon <= 50)  return "base";
  if (totalTon > 50   && totalTon <= 100) return "pro";
  if (totalTon > 100)                     return "elite";
  return null;
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
  const price      = Number(order.pricePerCoin);
  const totalTon   = Number(order.totalTon) || parseFloat((order.amount * price).toFixed(8));
  const cat        = order.category as Category;
  const bonusPct   = Number(order.bonusPct); // numeric column → string in Drizzle, convert
  const bonusCoins = Math.floor(order.amount * (1 + bonusPct / 100));
  const returnTon  = parseFloat((bonusCoins * price).toFixed(8));
  return {
    id: order.id,
    sellerId: order.sellerId,
    sellerUsername: order.sellerUsername ?? null,
    amount: order.amount,
    pricePerCoin: price,
    totalTon,
    category: cat,
    bonusPct,
    bonusCoins,
    returnTon,
    minPartialBuy: CATEGORIES[cat]?.minPartialBuy ?? 1,
    status: order.status,
    buyerId: order.buyerId ?? null,
    createdAt: order.createdAt.toISOString(),
  };
}

/* ─── GET /orders?category=start|base|pro|elite ─── */
router.get("/orders", async (req, res) => {
  const cat = req.query.category as string | undefined;

  // 1. Queue depth from settings
  const depthRow = await db.select().from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "queue_depth")).then(r => r[0] ?? null);
  const allowedQueueDepth = depthRow ? Math.max(1, parseInt(depthRow.value) || 1) : 1;

  // 2. All open orders sorted by id ASC → per-category position in queue (oldest = #1)
  const allOpen = await db
    .select({ id: miniMarketOrdersTable.id, category: miniMarketOrdersTable.category })
    .from(miniMarketOrdersTable)
    .where(eq(miniMarketOrdersTable.status, "open"))
    .orderBy(asc(miniMarketOrdersTable.id));

  // Build per-category position counters
  const catCounters = new Map<string, number>();
  const positionMap = new Map<number, number>();
  for (const o of allOpen) {
    const cnt = (catCounters.get(o.category) ?? 0) + 1;
    catCounters.set(o.category, cnt);
    positionMap.set(o.id, cnt);
  }

  // 3. Filtered list for display (oldest first — first created appears at top)
  let query = db.select().from(miniMarketOrdersTable)
    .where(eq(miniMarketOrdersTable.status, "open"))
    .$dynamic();

  if (cat && ["start","base","pro","elite"].includes(cat)) {
    query = query.where(and(
      eq(miniMarketOrdersTable.status, "open"),
      eq(miniMarketOrdersTable.category, cat),
    ));
  }

  const orders = await query.orderBy(asc(miniMarketOrdersTable.createdAt));
  res.json({
    orders: orders.map(o => ({
      ...formatOrder(o),
      queuePosition: positionMap.get(o.id) ?? 0,
      isAvailable: (positionMap.get(o.id) ?? 9999) <= allowedQueueDepth,
    })),
    allowedQueueDepth,
  });
});

/* ─── GET /orders/mine — only active (open) orders ─── */
router.get("/orders/mine", async (req, res) => {
  const telegramId = req.query.telegramId as string | undefined;
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  const orders = await db.select().from(miniMarketOrdersTable)
    .where(and(
      eq(miniMarketOrdersTable.sellerId, telegramId),
      eq(miniMarketOrdersTable.status, "open"),
    ))
    .orderBy(desc(miniMarketOrdersTable.createdAt)).limit(50);

  res.json({ orders: orders.map(formatOrder) });
});

/* ─── GET /stats ─── */
router.get("/stats", async (_req, res) => {
  const openOrders = await db.select().from(miniMarketOrdersTable)
    .where(eq(miniMarketOrdersTable.status, "open"));

  const soldOrders = await db.select().from(miniMarketOrdersTable)
    .where(eq(miniMarketOrdersTable.status, "sold"));

  const inOrdersTon = openOrders.reduce((s, o) => s + Number(o.totalTon), 0);

  const now = Date.now();
  const volume24h = soldOrders
    .filter(o => now - o.createdAt.getTime() < 86_400_000)
    .reduce((s, o) => s + Number(o.totalTon), 0);

  res.json({
    inOrdersTon: parseFloat(inOrdersTon.toFixed(2)),
    volume24h:   parseFloat(volume24h.toFixed(2)),
    avgProfit:   1.5,
    openCount:   openOrders.length,
  });
});

/* ─── POST /orders — create sell order ─── */
router.post("/orders", async (req, res) => {
  const { telegramId, tonAmount } = req.body as {
    telegramId?: string; tonAmount?: number;
  };

  if (!telegramId || !tonAmount) {
    res.status(400).json({ error: "telegramId, tonAmount required" }); return;
  }

  const totalTon = parseFloat(tonAmount.toFixed(8));
  const category = getCategory(totalTon);

  if (!category) {
    res.status(400).json({ error: "Минимальный ордер — 3 TON (категория START). Максимум не ограничен." }); return;
  }

  const pricePerCoin = 1 / FIXED_RATE;
  const amount       = Math.floor(totalTon * FIXED_RATE);

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
    res.status(429).json({ error: `Лимит ордеров в категории ${CATEGORIES[category].label} исчерпан на сегодня` }); return;
  }

  if (user.tonyxCoins < amount) {
    res.status(400).json({ error: `Недостаточно TONYX. Нужно ${amount}, у вас ${user.tonyxCoins}` }); return;
  }

  const bonusPct = CATEGORIES[category].bonusPct;

  // ── Atomic: deduct TONYX escrow + insert order ──
  const order = await db.transaction(async (tx) => {
    await tx.update(usersTable).set({
      tonyxCoins: user!.tonyxCoins - amount,
      [countField]: currentCount + 1,
      updatedAt: new Date(),
    }).where(eq(usersTable.telegramId, telegramId));

    const [inserted] = await tx.insert(miniMarketOrdersTable).values({
      sellerId:       telegramId,
      sellerUsername: user!.username ?? null,
      amount,
      pricePerCoin:   String(pricePerCoin),
      totalTon:       String(totalTon),
      category,
      bonusPct:       String(bonusPct),
      status:         "open",
    }).returning();

    return inserted;
  });

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

  // ── Atomic: mark cancelled + restore escrowed TONYX ──
  const escrowedAmount = order.amount;
  const updated = await db.transaction(async (tx) => {
    const [upd] = await tx.update(miniMarketOrdersTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(miniMarketOrdersTable.id, id))
      .returning();

    const seller = await tx.select().from(usersTable)
      .where(eq(usersTable.telegramId, telegramId)).then(r => r[0]);
    if (seller) {
      await tx.update(usersTable)
        .set({ tonyxCoins: seller.tonyxCoins + escrowedAmount, updatedAt: new Date() })
        .where(eq(usersTable.telegramId, telegramId));
    }

    return upd;
  });

  res.json(formatOrder(updated));
});

/* ─── POST /orders/:id/buy ─── */
router.post("/orders/:id/buy", async (req, res) => {
  const id = parseInt(req.params.id);
  const { telegramId, tonAmount: rawTonAmount, idempotencyKey } = req.body as {
    telegramId: string; tonAmount?: number; idempotencyKey?: string;
  };

  // ── Idempotency: return cached response if same key is replayed within TTL ──
  if (idempotencyKey) {
    const cached = idemCache.get(idempotencyKey);
    if (cached && cached.exp > Date.now()) {
      res.status(cached.status).json(cached.body);
      return;
    }
  }

  // ── Pre-flight reads (outside transaction for fast early returns) ──
  const order = await db.select().from(miniMarketOrdersTable)
    .where(and(eq(miniMarketOrdersTable.id, id), eq(miniMarketOrdersTable.status, "open")))
    .then(r => r[0] ?? null);

  if (!order) { res.status(404).json({ error: "Ордер не найден или уже продан" }); return; }
  if (order.sellerId === telegramId) { res.status(400).json({ error: "Нельзя купить свой ордер" }); return; }

  // ── Queue depth enforcement ──
  const depthRow = await db.select().from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "queue_depth")).then(r => r[0] ?? null);
  const allowedQueueDepth = depthRow ? Math.max(1, parseInt(depthRow.value) || 1) : 1;

  // Load open orders in the same category, oldest-first → per-category queue
  const openOrdersInCat = await db.select({ id: miniMarketOrdersTable.id })
    .from(miniMarketOrdersTable)
    .where(and(
      eq(miniMarketOrdersTable.status, "open"),
      eq(miniMarketOrdersTable.category, order.category),
    ))
    .orderBy(asc(miniMarketOrdersTable.createdAt));

  const allowedIds = new Set(openOrdersInCat.slice(0, allowedQueueDepth).map(o => o.id));
  if (!allowedIds.has(id)) {
    res.status(403).json({
      error: `Покупка заблокирована очередью. В тире ${(order.category as string).toUpperCase()} доступны только первые ${allowedQueueDepth} ордеров.`,
      queueDepth: allowedQueueDepth,
    });
    return;
  }

  const buyerCheck = await db.select().from(usersTable)
    .where(eq(usersTable.telegramId, telegramId)).then(r => r[0] ?? null);
  if (!buyerCheck) { res.status(404).json({ error: "Покупатель не найден" }); return; }

  const cat           = order.category as Category;
  const minPartialBuy = CATEGORIES[cat].minPartialBuy;
  const totalTon      = Number(order.totalTon);

  const purchaseTon = (rawTonAmount !== undefined && rawTonAmount < totalTon)
    ? parseFloat(rawTonAmount.toFixed(8))
    : totalTon;
  const isPartial = purchaseTon < totalTon;

  // ── Partial-buy rule enforcement ──
  if (isPartial) {
    if (purchaseTon < minPartialBuy) {
      res.status(400).json({ error: `Минимальная сумма выкупа для тира ${CATEGORIES[cat].label}: ${minPartialBuy} TON` }); return;
    }
    const remaining = parseFloat((totalTon - purchaseTon).toFixed(8));
    if (remaining > 0 && remaining < minPartialBuy) {
      const maxPartial = parseFloat((totalTon - minPartialBuy).toFixed(8));
      res.status(400).json({ error: `Остаток (${remaining.toFixed(4)} TON) меньше минимума тира. Макс. частичный: ${maxPartial} TON` }); return;
    }
  }

  const bonusPct           = Number(order.bonusPct);
  const partialEscrowTonyx = Math.floor(purchaseTon * FIXED_RATE);
  const bonusCoins         = Math.floor(partialEscrowTonyx * (1 + bonusPct / 100));

  // ── Atomic transaction: balance check + all balance/order updates ──
  let updated: typeof miniMarketOrdersTable.$inferSelect;
  try {
    updated = await db.transaction(async (tx) => {
      // Re-read buyer inside tx for latest balance (prevents race condition)
      const buyer = await tx.select().from(usersTable)
        .where(eq(usersTable.telegramId, telegramId)).then(r => r[0]!);
      const buyerTon = Number(buyer.ton);

      if (buyerTon < purchaseTon) {
        const err = new Error("INSUFFICIENT_TON") as Error & { buyerTon: number; purchaseTon: number };
        err.buyerTon  = buyerTon;
        err.purchaseTon = purchaseTon;
        throw err;
      }

      let upd: typeof miniMarketOrdersTable.$inferSelect;
      if (!isPartial) {
        [upd] = await tx.update(miniMarketOrdersTable)
          .set({ status: "sold", buyerId: telegramId, updatedAt: new Date() })
          .where(eq(miniMarketOrdersTable.id, id)).returning();
      } else {
        const newAmount   = order.amount - partialEscrowTonyx;
        const newTotalTon = parseFloat((totalTon - purchaseTon).toFixed(8));
        [upd] = await tx.update(miniMarketOrdersTable)
          .set({ amount: newAmount, totalTon: String(newTotalTon), updatedAt: new Date() })
          .where(eq(miniMarketOrdersTable.id, id)).returning();
      }

      // Deduct TON from buyer, credit TONYX bonus
      await tx.update(usersTable).set({
        ton:        String(buyerTon - purchaseTon),
        tonyxCoins: buyer.tonyxCoins + bonusCoins,
        updatedAt:  new Date(),
      }).where(eq(usersTable.telegramId, telegramId));

      // Credit TON to seller
      const seller = await tx.select().from(usersTable)
        .where(eq(usersTable.telegramId, order.sellerId)).then(r => r[0]);
      if (seller) {
        await tx.update(usersTable).set({
          ton:       String(Number(seller.ton) + purchaseTon),
          updatedAt: new Date(),
        }).where(eq(usersTable.telegramId, order.sellerId));
      }

      return upd;
    });
  } catch (err: any) {
    if (err.message === "INSUFFICIENT_TON") {
      res.status(400).json({
        error: `Недостаточно TON. Нужно ${(err.purchaseTon as number).toFixed(4)}, у вас ${(err.buyerTon as number).toFixed(4)}`,
      });
      return;
    }
    throw err;
  }

  console.log(`[Market] Order #${id} ${isPartial ? "PARTIAL" : "FULL"} (${cat}): buyer ${telegramId} paid ${purchaseTon} TON → ${bonusCoins} TONYX (+${bonusPct}%)`);
  const responseBody = { ...formatOrder(updated), bonusCoins, bonusPct, isPartial };
  if (idempotencyKey) idemCache.set(idempotencyKey, { status: 200, body: responseBody, exp: Date.now() + IDEM_TTL });
  res.json(responseBody);
});

/* ─── POST /orders/:id/buyback — seller buys back own order (gets 50%) ─── */
router.post("/orders/:id/buyback", async (req, res) => {
  const id = parseInt(req.params.id);
  const { telegramId } = req.body as { telegramId: string };

  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  const order = await db.select().from(miniMarketOrdersTable)
    .where(and(eq(miniMarketOrdersTable.id, id), eq(miniMarketOrdersTable.status, "open")))
    .then(r => r[0] ?? null);

  if (!order) { res.status(404).json({ error: "Ордер не найден или уже закрыт" }); return; }
  if (order.sellerId !== telegramId) { res.status(403).json({ error: "Это не ваш ордер" }); return; }

  // Seller gets back only 50% of escrowed TONYX (penalty for early buyback)
  const returnAmount = Math.floor(order.amount * 0.5);
  const lostAmount   = order.amount - returnAmount;

  const updated = await db.transaction(async (tx) => {
    const [upd] = await tx.update(miniMarketOrdersTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(miniMarketOrdersTable.id, id))
      .returning();

    const seller = await tx.select().from(usersTable)
      .where(eq(usersTable.telegramId, telegramId)).then(r => r[0]);
    if (seller) {
      await tx.update(usersTable)
        .set({ tonyxCoins: seller.tonyxCoins + returnAmount, updatedAt: new Date() })
        .where(eq(usersTable.telegramId, telegramId));
    }

    return upd;
  });

  console.log(`[Market] Buyback order #${id} by ${telegramId}: returned ${returnAmount} TONYX, lost ${lostAmount} TONYX`);
  res.json({ ...formatOrder(updated), returnAmount, lostAmount });
});

export default router;
