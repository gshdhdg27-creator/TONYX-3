import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniMarketOrdersTable, systemSettingsTable, miniWithdrawalsTable, miniTopupRequestsTable, miniTasksTable, miniTaskCompletionsTable } from "@workspace/db/schema";
import { eq, sql, or, ilike, desc } from "drizzle-orm";
import { sendTgMessage, TgMsg } from "../../lib/tg-notify";
import { notifyUser } from "../../services/botNotify.js";

const router: IRouter = Router();

const OWNER_ID = "7257793582";
const EXTRA_ADMIN_IDS = (process.env.ADMIN_TELEGRAM_IDS ?? "")
  .split(",").map(s => s.trim()).filter(Boolean).filter(id => id !== OWNER_ID);
const SUPERADMIN_IDS = new Set([OWNER_ID, ...EXTRA_ADMIN_IDS]);

function normalizeId(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).trim();
}

function extractAdminId(req: import("express").Request, res: import("express").Response): string {
  const botToken = process.env["TELEGRAM_BOT_TOKEN"];
  if (botToken) {
    return normalizeId((res.locals as Record<string, unknown>)["verifiedTelegramId"]);
  }
  const fallback = normalizeId(
    req.query.adminId ?? req.body?.adminId ?? req.headers["x-admin-id"]
  );
  if (fallback) {
    console.warn(`[Admin] DEV MODE: trusting unverified adminId=${fallback} (no BOT_TOKEN)`);
  }
  return fallback;
}

/** Owner + env admins + anyone with isAdmin=true in DB (granted via admin panel) */
async function checkAdmin(id: string): Promise<boolean> {
  if (!id) return false;
  if (SUPERADMIN_IDS.has(id)) return true;
  const user = await db
    .select({ isAdmin: usersTable.isAdmin })
    .from(usersTable)
    .where(eq(usersTable.telegramId, id))
    .then(r => r[0] ?? null);
  return user?.isAdmin === true;
}

router.get("/check", async (req, res) => {
  const id = normalizeId(req.query.telegramId);
  const isSuperAdmin = id === OWNER_ID;
  if (isSuperAdmin) {
    res.json({ isAdmin: true, isSuperAdmin: true, ownerId: OWNER_ID });
    return;
  }
  const isAdmin = await checkAdmin(id);
  res.json({ isAdmin, isSuperAdmin: false });
});

/* Admins (including granted) never see ban screen */
router.get("/user-status", async (req, res) => {
  const id = normalizeId(req.query.telegramId);
  if (!id) { res.json({ status: "active", bannedReason: null }); return; }
  try {
    if (await checkAdmin(id)) {
      await db.update(usersTable).set({
        userStatus: "active", isBlocked: false, bannedReason: null, warningCount: 0, updatedAt: new Date(),
      }).where(eq(usersTable.telegramId, id));
      res.json({ status: "active", bannedReason: null });
      return;
    }
    const user = await db.select({
      userStatus: usersTable.userStatus,
      bannedReason: usersTable.bannedReason,
      isBlocked: usersTable.isBlocked,
    }).from(usersTable).where(eq(usersTable.telegramId, id)).then(r => r[0] ?? null);
    if (!user) { res.json({ status: "active", bannedReason: null }); return; }
    const status = user.userStatus ?? (user.isBlocked ? "banned" : "active");
    res.json({ status, bannedReason: user.bannedReason ?? null });
  } catch {
    res.json({ status: "active", bannedReason: null });
  }
});

router.get("/settings/game-config", async (_req, res) => {
  try {
    const rows = await db.select().from(systemSettingsTable);
    const s: Record<string, string> = {};
    for (const r of rows) s[r.key] = r.value;
    res.json({
      bosses: [1,2,3,4,5].map(level => ({
        level,
        hp: s[`boss_hp_${level}`] ? parseInt(s[`boss_hp_${level}`]!) : null,
        reviveTon: s[`boss_revive_ton_${level}`] ? parseFloat(s[`boss_revive_ton_${level}`]!) : null,
        reviveAds: s[`boss_revive_ads_${level}`] !== undefined ? (s[`boss_revive_ads_${level}`] === "null" ? null : parseInt(s[`boss_revive_ads_${level}`]!)) : undefined,
      })),
      respawnHours: parseInt(s["boss_respawn_hours"] ?? "") || 24,
      adBoostPct: parseInt(s["boost_ad_pct"] ?? "") || 20,
      tonBoostPct1: parseInt(s["boost_ton_pct_1"] ?? "") || 50,
      tonBoostPct2: parseInt(s["boost_ton_pct_2"] ?? "") || 100,
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.get("/settings/games-enabled", async (_req, res) => {
  try {
    const rows = await db.select().from(systemSettingsTable);
    const s: Record<string, string> = {};
    for (const r of rows) s[r.key] = r.value;
    res.json({
      spin: s["game_enabled_spin"] !== "false",
      mines: s["game_enabled_mines"] !== "false",
      arena: s["game_enabled_arena"] !== "false",
      igro: s["game_enabled_igro"] !== "false",
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.get("/online-count", async (_req, res) => {
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const row = await db.execute<{ cnt: number }>(
      sql`SELECT COUNT(*)::int AS cnt FROM users WHERE last_login_at >= ${fiveMinAgo}`
    );
    res.json({ count: row.rows[0]?.cnt ?? 0 });
  } catch (e) {
    console.error("[Admin] online-count error:", e);
    res.status(500).json({ count: 0 });
  }
});

router.use(async (req, res, next) => {
  const id = extractAdminId(req, res);
  if (id === OWNER_ID) { next(); return; }
  const ok = await checkAdmin(id);
  if (!ok) {
    res.status(403).json({
      error: "Нет доступа. Вы не являетесь администратором.",
      hint: "Передайте adminId в query, body или заголовке X-Admin-Id",
    });
    return;
  }
  next();
});

/* GET /admin/stats */
router.get("/stats", async (req, res) => {
  const adminId = extractAdminId(req, res);
  const isSuperAdmin = adminId === OWNER_ID;
  try {
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
    const tonyxSoldFromSettings = parseInt(settings["total_tonyx_sold"] ?? "0") || 0;
    const totalCoinsSold = Math.max(soldRow.rows[0]?.sold ?? 0, tonyxSoldFromSettings);
    res.json({
      totalUsers: usersCount.rows[0]?.cnt ?? 0,
      totalCoinsSold,
      totalTonVolume: Number(soldRow.rows[0]?.total_ton ?? 0),
      activeOrders: activeOrders.rows[0]?.cnt ?? 0,
      isMarketActive: settings["is_market_active"] === "true",
      canActivate: totalCoinsSold >= 1_000_000,
      poolProgress: Math.min(100, (totalCoinsSold / 1_000_000) * 100).toFixed(2),
      settings,
      isSuperAdmin,
      admins: adminRows.rows.map(a => ({ telegramId: a.telegram_id, username: a.username })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Admin] GET /stats FAILED:", msg);
    res.status(500).json({ error: `DB error: ${msg}` });
  }
});

/* POST /admin/team/grant — owner grants isAdmin; that user gets ban immunity */
router.post("/team/grant", async (req, res) => {
  const adminId = extractAdminId(req, res);
  const targetId = normalizeId(req.body?.targetId);
  if (!targetId) { res.status(400).json({ error: "targetId required" }); return; }
  if (adminId !== OWNER_ID) {
    res.status(403).json({ error: "Только главный администратор может назначать администраторов" }); return;
  }
  if (targetId === OWNER_ID) {
    res.status(400).json({ error: "Нельзя изменить права главного администратора" }); return;
  }
  const target = await db.select().from(usersTable).where(eq(usersTable.telegramId, targetId)).then(r => r[0] ?? null);
  if (!target) { res.status(404).json({ error: "Пользователь не найден" }); return; }
  await db.update(usersTable).set({
    isAdmin: true,
    userStatus: "active",
    isBlocked: false,
    bannedReason: null,
    warningCount: 0,
    updatedAt: new Date(),
  }).where(eq(usersTable.telegramId, targetId));
  console.log(`[Admin] ${adminId} GRANTED admin to ${targetId}`);
  res.json({ success: true, message: `✅ Роль администратора выдана @${target.username ?? targetId}` });
});

/* POST /admin/team/revoke */
router.post("/team/revoke", async (req, res) => {
  const adminId = extractAdminId(req, res);
  const targetId = normalizeId(req.body?.targetId);
  if (!targetId) { res.status(400).json({ error: "targetId required" }); return; }
  if (adminId !== OWNER_ID) {
    res.status(403).json({ error: "Только главный администратор может снимать администраторов" }); return;
  }
  if (targetId === OWNER_ID) {
    res.status(400).json({ error: "Нельзя снять права у главного администратора" }); return;
  }
  const target = await db.select().from(usersTable).where(eq(usersTable.telegramId, targetId)).then(r => r[0] ?? null);
  if (!target) { res.status(404).json({ error: "Пользователь не найден" }); return; }
  await db.update(usersTable).set({ isAdmin: false, updatedAt: new Date() }).where(eq(usersTable.telegramId, targetId));
  console.log(`[Admin] ${adminId} REVOKED admin from ${targetId}`);
  res.json({ success: true, message: `✅ Роль администратора снята с @${target.username ?? targetId}` });
});

router.post("/users/:id/ban", async (req, res) => {
  const { id } = req.params;
  if (id === OWNER_ID || await checkAdmin(id)) {
    res.status(400).json({ error: "Нельзя забанить администратора" }); return;
  }
  const { reason } = req.body as { reason?: string };
  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, id)).then(r => r[0] ?? null);
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }
  const banReason = reason?.trim() || "Нарушение правил";
  await db.update(usersTable).set({
    userStatus: "banned", isBlocked: true,
    bannedReason: banReason,
    updatedAt: new Date(),
  }).where(eq(usersTable.telegramId, id));
  void notifyUser(id,
    `🔴 <b>Ваш аккаунт TONYX заблокирован</b>\n\n` +
    `Причина: <i>${banReason}</i>\n\n` +
    `Если вы считаете это ошибкой — обратитесь в поддержку.`
  );
  res.json({ success: true, message: `🔴 Пользователь ${id} заблокирован` });
});

router.post("/users/:id/unban", async (req, res) => {
  const { id } = req.params;
  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, id)).then(r => r[0] ?? null);
  if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }
  await db.update(usersTable).set({
    userStatus: "active", isBlocked: false, bannedReason: null, updatedAt: new Date(),
  }).where(eq(usersTable.telegramId, id));
  void notifyUser(id,
    `✅ <b>Ваш аккаунт TONYX разблокирован</b>\n\n` +
    `Добро пожаловать обратно!`
  );
  res.json({ success: true, message: `✅ Пользователь ${id} разблокирован` });
});

router.post("/users/:id/block", async (req, res) => {
  const { id } = req.params;
  if (await checkAdmin(id)) {
    res.status(400).json({ error: "Нельзя заблокировать администратора" }); return;
  }
  const { block } = req.body as { block: boolean };
  await db.update(usersTable).set({ isBlocked: !!block, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, id));
  res.json({ success: true });
});

router.post("/users/:id/soft-delete", async (req, res) => {
  const { id } = req.params;
  if (id === OWNER_ID || await checkAdmin(id)) {
    res.status(400).json({ error: "Нельзя мягко удалить администратора" }); return;
  }
  await db.update(usersTable).set({
    userStatus: "soft_deleted", isBlocked: true, updatedAt: new Date(),
  }).where(eq(usersTable.telegramId, id));
  res.json({ success: true, message: `🗑 Пользователь ${id} мягко удалён` });
});

router.post("/users/:id/restore", async (req, res) => {
  const { id } = req.params;
  await db.update(usersTable).set({
    userStatus: "active", isBlocked: false, bannedReason: null, updatedAt: new Date(),
  }).where(eq(usersTable.telegramId, id));
  res.json({ success: true, message: `♻️ Пользователь ${id} восстановлен` });
});


/* GET /admin/users — list users with pagination and search */
router.get("/users", async (req, res) => {
  try {
    const adminId = extractAdminId(req, res);
    if (!adminId) {
      res.status(401).json({ error: "Admin ID required" });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? "1")) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;
    const search = String(req.query.search ?? "").trim();

    let where = undefined;
    if (search) {
      where = or(
        ilike(usersTable.telegramId, `%${search}%`),
        ilike(usersTable.username, `%${search}%`),
        ilike(usersTable.firstName, `%${search}%`)
      );
    }

    const [users, totalRow] = await Promise.all([
      db
        .select({
          id: usersTable.id,
          telegramId: usersTable.telegramId,
          username: usersTable.username,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
          coins: usersTable.coins,
          ton: usersTable.ton,
          tonyxCoins: usersTable.tonyxCoins,
          boostRate: usersTable.boostRate,
          totalTonDeposited: usersTable.totalTonDeposited,
          totalAdsWatched: usersTable.totalAdsWatched,
          totalGamesPlayed: usersTable.totalGamesPlayed,
          wins: usersTable.wins,
          losses: usersTable.losses,
          isBlocked: usersTable.isBlocked,
          isAdmin: usersTable.isAdmin,
          forceWin: usersTable.forceWin,
          lastIp: usersTable.lastIp,
          lastLoginAt: usersTable.lastLoginAt,
          createdAt: usersTable.createdAt,
          dailyOrdersStart: usersTable.dailyOrdersStart,
          dailyOrdersPro: usersTable.dailyOrdersPro,
          dailyOrdersElite: usersTable.dailyOrdersElite,
          userStatus: usersTable.userStatus,
          bannedReason: usersTable.bannedReason,
          winRateModifier: usersTable.winRateModifier,
          warningCount: usersTable.warningCount,
          referralEarnings: usersTable.referralEarnings,
        })
        .from(usersTable)
        .where(where)
        .orderBy(desc(usersTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.execute<{ cnt: number }>(
        sql`SELECT COUNT(*)::int AS cnt FROM users ${search ? sql`WHERE telegram_id ILIKE ${'%' + search + '%'} OR username ILIKE ${'%' + search + '%'} OR first_name ILIKE ${'%' + search + '%'}` : sql``}`
      ),
    ]);

    const total = totalRow.rows[0]?.cnt ?? 0;

    const mapped = users.map(u => ({
      ...u,
      referrals: u.referralEarnings ?? 0,
      isOnline: false,
      twinCount: u.warningCount ?? 0,
      isMainAccount: true,
      totalOrders: 0,
    }));
    res.json({
      users: mapped,
      page,
      hasMore: offset + users.length < total,
      total,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Admin] GET /users FAILED:", msg);
    res.status(500).json({ error: `DB error: ${msg}` });
  }
});

export default router;
