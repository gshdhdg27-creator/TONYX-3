import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniMarketOrdersTable, systemSettingsTable } from "@workspace/db/schema";
import { eq, sql, or, ilike, desc } from "drizzle-orm";

const router: IRouter = Router();

/* ─── Hardcoded superadmin IDs (env override) ─── */
const SUPERADMIN_IDS = (process.env.ADMIN_TELEGRAM_IDS ?? "7257793582").split(",").map(s => s.trim());

/* ─── Check if ID has admin access (env OR DB) ─── */
async function checkAdmin(telegramId: string | undefined): Promise<boolean> {
  if (!telegramId) return false;
  if (SUPERADMIN_IDS.includes(telegramId)) return true;
  const user = await db.select({ isAdmin: usersTable.isAdmin })
    .from(usersTable).where(eq(usersTable.telegramId, telegramId)).then(r => r[0] ?? null);
  return user?.isAdmin === true;
}

/* ─── PUBLIC: check if current user is admin ─── */
router.get("/check", async (req, res) => {
  const telegramId = req.query.telegramId as string | undefined;
  const isAdmin = await checkAdmin(telegramId);
  const isSuperAdmin = !!telegramId && SUPERADMIN_IDS.includes(telegramId);
  res.json({ isAdmin, isSuperAdmin });
});

/* ─── Middleware — verify admin for all routes below ─── */
router.use(async (req, res, next) => {
  const id = (req.query.adminId ?? req.body?.adminId) as string | undefined;
  const ok = await checkAdmin(id);
  if (!ok) { res.status(403).json({ error: "Нет доступа. Вы не являетесь администратором." }); return; }
  next();
});

/* ─── GET /admin/stats ─── */
router.get("/stats", async (_req, res) => {
  const [usersCount, soldRow, activeOrders, settingsRows, adminRows] = await Promise.all([
    db.execute<{ cnt: number }>(sql`SELECT COUNT(*)::int AS cnt FROM users`),
    db.execute<{ sold: number; total_ton: number }>(
      sql`SELECT COALESCE(SUM(amount),0)::int AS sold, COALESCE(SUM(total_ton::float),0) AS total_ton FROM mini_market_orders WHERE status = 'sold'`,
    ),
    db.execute<{ cnt: number }>(sql`SELECT COUNT(*)::int AS cnt FROM mini_market_orders WHERE status = 'open'`),
    db.select().from(systemSettingsTable),
    db.execute<{ telegram_id: string; username: string | null; is_admin: boolean }>(
      sql`SELECT telegram_id, username, is_admin FROM users WHERE is_admin = TRUE ORDER BY created_at`,
    ),
  ]);

  const settings: Record<string, string> = {};
  for (const s of settingsRows) settings[s.key] = s.value;

  const totalCoinsSold = soldRow.rows[0]?.sold ?? 0;
  res.json({
    totalUsers:     usersCount.rows[0]?.cnt ?? 0,
    totalCoinsSold,
    totalTonVolume: soldRow.rows[0]?.total_ton ?? 0,
    activeOrders:   activeOrders.rows[0]?.cnt ?? 0,
    isMarketActive: settings["is_market_active"] === "true",
    canActivate:    totalCoinsSold >= 1_000_000,
    poolProgress:   Math.min(100, (totalCoinsSold / 1_000_000) * 100).toFixed(2),
    settings,
    admins: adminRows.rows.map(a => ({ telegramId: a.telegram_id, username: a.username })),
  });
});

/* ─── GET /admin/users ─── */
router.get("/users", async (req, res) => {
  const search = (req.query.search as string ?? "").trim();
  const page   = Math.max(1, parseInt(req.query.page as string ?? "1"));
  const limit  = 20;
  const offset = (page - 1) * limit;

  const rows = search
    ? await db.select().from(usersTable)
        .where(or(eq(usersTable.telegramId, search), ilike(usersTable.username, `%${search.replace(/^@/, "")}%`)))
        .orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset)
    : await db.select().from(usersTable).orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset);

  const enriched = await Promise.all(rows.map(async (u) => {
    const [ordersRow, referralsRow] = await Promise.all([
      db.execute<{ cnt: number }>(sql`SELECT COUNT(*)::int AS cnt FROM mini_market_orders WHERE seller_id = ${u.telegramId}`),
      db.execute<{ cnt: number }>(sql`SELECT COUNT(*)::int AS cnt FROM users WHERE referred_by = ${u.telegramId}`),
    ]);
    const isOnline = u.lastLoginAt && (Date.now() - u.lastLoginAt.getTime() < 5 * 60 * 1000);
    return {
      id: u.id, telegramId: u.telegramId, username: u.username ?? null,
      firstName: u.firstName ?? null, lastName: u.lastName ?? null,
      coins: u.coins, ton: Number(u.ton), tonyxCoins: u.tonyxCoins,
      totalTonDeposited: Number(u.totalTonDeposited),
      totalAdsWatched: u.totalAdsWatched, totalGamesPlayed: u.totalGamesPlayed,
      wins: u.wins, losses: u.losses,
      totalOrders: ordersRow.rows[0]?.cnt ?? 0,
      referrals: referralsRow.rows[0]?.cnt ?? 0,
      isBlocked: u.isBlocked, isAdmin: u.isAdmin,
      isOnline: !!isOnline, lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      dailyOrdersStart: u.dailyOrdersStart,
      dailyOrdersPro: u.dailyOrdersPro,
      dailyOrdersElite: u.dailyOrdersElite,
    };
  }));

  res.json({ users: enriched, page, hasMore: rows.length === limit });
});

/* ─── POST /admin/market/activate ─── */
router.post("/market/activate", async (_req, res) => {
  const soldRow = await db.execute<{ sold: number }>(
    sql`SELECT COALESCE(SUM(amount),0)::int AS sold FROM mini_market_orders WHERE status = 'sold'`,
  );
  const sold = soldRow.rows[0]?.sold ?? 0;
  if (sold < 1_000_000) {
    res.status(400).json({ error: `Нельзя — куплено ${sold.toLocaleString()} из 1 000 000`, sold }); return;
  }
  await db.update(systemSettingsTable).set({ value: "true", updatedAt: new Date() })
    .where(eq(systemSettingsTable.key, "is_market_active"));
  res.json({ success: true, message: "P2P рынок активирован!" });
});

/* ─── POST /admin/market/deactivate ─── */
router.post("/market/deactivate", async (_req, res) => {
  await db.update(systemSettingsTable).set({ value: "false", updatedAt: new Date() })
    .where(eq(systemSettingsTable.key, "is_market_active"));
  res.json({ success: true, message: "P2P рынок деактивирован" });
});

/* ─── POST /admin/market/force-activate ─── */
router.post("/market/force-activate", async (_req, res) => {
  await db.update(systemSettingsTable).set({ value: "true", updatedAt: new Date() })
    .where(eq(systemSettingsTable.key, "is_market_active"));
  res.json({ success: true, message: "P2P рынок принудительно активирован" });
});

/* ─── POST /admin/team/grant — give admin access ─── */
router.post("/team/grant", async (req, res) => {
  const { targetId, adminId } = req.body as { targetId?: string; adminId?: string };
  if (!targetId) { res.status(400).json({ error: "targetId required" }); return; }

  /* Only superadmins can grant admin */
  if (!adminId || !SUPERADMIN_IDS.includes(adminId)) {
    res.status(403).json({ error: "Только суперадмин может назначать администраторов" }); return;
  }

  const target = await db.select().from(usersTable).where(eq(usersTable.telegramId, targetId)).then(r => r[0] ?? null);
  if (!target) { res.status(404).json({ error: "Пользователь не найден" }); return; }
  if (SUPERADMIN_IDS.includes(targetId)) { res.status(400).json({ error: "Суперадмин нельзя изменить" }); return; }

  await db.update(usersTable).set({ isAdmin: true, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, targetId));

  console.log(`[Admin] ${adminId} GRANTED admin to ${targetId}`);
  res.json({ success: true, message: `Доступ к админке выдан @${target.username ?? targetId}` });
});

/* ─── POST /admin/team/revoke — remove admin access ─── */
router.post("/team/revoke", async (req, res) => {
  const { targetId, adminId } = req.body as { targetId?: string; adminId?: string };
  if (!targetId) { res.status(400).json({ error: "targetId required" }); return; }

  if (!adminId || !SUPERADMIN_IDS.includes(adminId)) {
    res.status(403).json({ error: "Только суперадмин может отзывать права" }); return;
  }
  if (SUPERADMIN_IDS.includes(targetId)) {
    res.status(400).json({ error: "Нельзя отозвать права суперадмина" }); return;
  }

  await db.update(usersTable).set({ isAdmin: false, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, targetId));

  console.log(`[Admin] ${adminId} REVOKED admin from ${targetId}`);
  res.json({ success: true, message: `Доступ к админке отозван у ${targetId}` });
});

/* ─── POST /admin/users/:id/block ─── */
router.post("/users/:id/block", async (req, res) => {
  const { id } = req.params;
  const { block } = req.body as { block: boolean };
  await db.update(usersTable).set({ isBlocked: !!block, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, id));
  res.json({ success: true });
});

/* ─── POST /admin/users/:id/adjust-balance
     Unified endpoint for add/deduct of any currency
     body: { currency: "points"|"ton"|"tonyx", amount: number, action: "add"|"deduct", adminId }
─── */
router.post("/users/:id/adjust-balance", async (req, res) => {
  const { id } = req.params;
  const { currency, amount, action } = req.body as {
    currency?: "points" | "ton" | "tonyx";
    amount?: number;
    action?: "add" | "deduct";
  };

  if (!currency || !["points","ton","tonyx"].includes(currency)) {
    res.status(400).json({ error: "currency must be points|ton|tonyx" }); return;
  }
  if (!amount || amount <= 0) {
    res.status(400).json({ error: "amount must be > 0" }); return;
  }
  if (!action || !["add","deduct"].includes(action)) {
    res.status(400).json({ error: "action must be add|deduct" }); return;
  }

  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, id)).then(r => r[0] ?? null);
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }

  const sign = action === "add" ? 1 : -1;

  if (currency === "points") {
    const newVal = user.coins + sign * amount;
    if (newVal < 0) { res.status(400).json({ error: `Недостаточно поинтов. Баланс: ${user.coins}` }); return; }
    await db.update(usersTable).set({ coins: newVal, updatedAt: new Date() }).where(eq(usersTable.telegramId, id));
    res.json({ success: true, currency, action, newBalance: newVal });

  } else if (currency === "ton") {
    const newVal = parseFloat((Number(user.ton) + sign * amount).toFixed(8));
    if (newVal < 0) { res.status(400).json({ error: `Недостаточно TON. Баланс: ${Number(user.ton).toFixed(4)}` }); return; }
    await db.update(usersTable).set({ ton: String(newVal), updatedAt: new Date() }).where(eq(usersTable.telegramId, id));
    res.json({ success: true, currency, action, newBalance: newVal });

  } else {
    const newVal = user.tonyxCoins + sign * Math.floor(amount);
    if (newVal < 0) { res.status(400).json({ error: `Недостаточно TONYX. Баланс: ${user.tonyxCoins}` }); return; }
    await db.update(usersTable).set({ tonyxCoins: newVal, updatedAt: new Date() }).where(eq(usersTable.telegramId, id));
    res.json({ success: true, currency, action, newBalance: newVal });
  }
});

export default router;
