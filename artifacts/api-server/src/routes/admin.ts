import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable, withdrawalsTable, adViewsTable } from "@workspace/db/schema";
import { eq, desc, ilike, or, sql, count } from "drizzle-orm";

const router: IRouter = Router();

const ADMIN_IDS = new Set(["7257793582"]);

function adminOnly(req: Request, res: Response, next: NextFunction) {
  const adminId = req.headers["x-admin-id"] as string | undefined;
  if (!adminId || !ADMIN_IDS.has(adminId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

router.use(adminOnly);

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get("/stats", async (_req, res) => {
  const [{ totalUsers }] = await db.select({ totalUsers: count() }).from(usersTable);
  const [{ totalCoins }] = await db.select({ totalCoins: sql<number>`coalesce(sum(coins),0)` }).from(usersTable);
  const [{ totalAds }] = await db.select({ totalAds: sql<number>`coalesce(sum(total_ads_watched),0)` }).from(usersTable);
  const [{ pendingWithdrawals }] = await db.select({ pendingWithdrawals: count() }).from(withdrawalsTable).where(eq(withdrawalsTable.status, "pending"));
  res.json({ totalUsers, totalCoins, totalAds, pendingWithdrawals });
});

// ── Users list ────────────────────────────────────────────────────────────────
router.get("/users", async (req, res) => {
  const search = (req.query.search as string | undefined)?.trim();
  const limit = Math.min(parseInt(req.query.limit as string || "50", 10), 100);
  const offset = parseInt(req.query.offset as string || "0", 10);

  const rows = search
    ? await db.select().from(usersTable)
        .where(or(
          ilike(usersTable.telegramId, `%${search}%`),
          ilike(usersTable.username, `%${search}%`),
          ilike(usersTable.firstName, `%${search}%`),
        ))
        .orderBy(desc(usersTable.coins))
        .limit(limit).offset(offset)
    : await db.select().from(usersTable)
        .orderBy(desc(usersTable.coins))
        .limit(limit).offset(offset);

  res.json({ users: rows });
});

// ── Single user ───────────────────────────────────────────────────────────────
router.get("/users/:telegramId", async (req, res) => {
  const user = await db.select().from(usersTable)
    .where(eq(usersTable.telegramId, req.params.telegramId))
    .then(r => r[0] ?? null);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [{ adCount }] = await db.select({ adCount: count() }).from(adViewsTable)
    .where(eq(adViewsTable.telegramId, req.params.telegramId));
  const [{ refCount }] = await db.select({ refCount: count() }).from(usersTable)
    .where(eq(usersTable.referredBy, req.params.telegramId));
  const withdrawals = await db.select().from(withdrawalsTable)
    .where(eq(withdrawalsTable.telegramId, req.params.telegramId))
    .orderBy(desc(withdrawalsTable.createdAt));

  res.json({ user, adViewsTotal: adCount, referralCount: refCount, withdrawals });
});

// ── Update user (balance, block, reset stats) ─────────────────────────────────
router.patch("/users/:telegramId", async (req, res) => {
  const { coins, isBlocked, totalAdsWatched, resetBalance } = req.body;
  const user = await db.select().from(usersTable)
    .where(eq(usersTable.telegramId, req.params.telegramId))
    .then(r => r[0] ?? null);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const patch: Partial<typeof user> = { updatedAt: new Date() };
  if (resetBalance) {
    patch.coins = 0;
    patch.totalAdsWatched = 0;
    patch.referralEarnings = 0;
  } else {
    if (coins !== undefined) patch.coins = Math.max(0, Number(coins));
    if (isBlocked !== undefined) patch.isBlocked = Boolean(isBlocked);
    if (totalAdsWatched !== undefined) patch.totalAdsWatched = Math.max(0, Number(totalAdsWatched));
  }

  const [updated] = await db.update(usersTable).set(patch)
    .where(eq(usersTable.telegramId, req.params.telegramId)).returning();
  res.json({ user: updated });
});

// ── Add/subtract coins ────────────────────────────────────────────────────────
router.post("/users/:telegramId/coins", async (req, res) => {
  const { delta, reason } = req.body; // delta can be negative
  const user = await db.select().from(usersTable)
    .where(eq(usersTable.telegramId, req.params.telegramId))
    .then(r => r[0] ?? null);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const newCoins = Math.max(0, user.coins + Number(delta));
  const [updated] = await db.update(usersTable)
    .set({ coins: newCoins, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, req.params.telegramId)).returning();
  console.log(`[Admin] coins ${delta > 0 ? "+" : ""}${delta} for ${req.params.telegramId} (reason: ${reason || "-"}) → ${newCoins}`);
  res.json({ user: updated, delta, newCoins });
});

// ── All withdrawals ───────────────────────────────────────────────────────────
router.get("/withdrawals", async (req, res) => {
  const status = req.query.status as string | undefined;
  const rows = status
    ? await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.status, status)).orderBy(desc(withdrawalsTable.createdAt)).limit(100)
    : await db.select().from(withdrawalsTable).orderBy(desc(withdrawalsTable.createdAt)).limit(100);
  res.json({ withdrawals: rows });
});

// ── Update withdrawal status ──────────────────────────────────────────────────
router.patch("/withdrawals/:id", async (req, res) => {
  const { status } = req.body;
  if (!["pending", "completed", "rejected"].includes(status)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  const [updated] = await db.update(withdrawalsTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(withdrawalsTable.id, Number(req.params.id))).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  // If rejected — refund coins to user
  if (status === "rejected") {
    const user = await db.select().from(usersTable)
      .where(eq(usersTable.telegramId, updated.telegramId)).then(r => r[0] ?? null);
    if (user) {
      await db.update(usersTable)
        .set({ coins: user.coins + updated.amount, updatedAt: new Date() })
        .where(eq(usersTable.telegramId, updated.telegramId));
    }
  }
  res.json({ withdrawal: updated });
});

export default router;
