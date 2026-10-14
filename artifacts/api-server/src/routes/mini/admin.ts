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

    let users;
    let total = 0;

    if (search) {
      const pattern = `%${search}%`;
      users = await db
        .select({
          id: usersTable.id,
          telegramId: usersTable.telegramId,
          username: usersTable.username,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
          coins: usersTable.coins,
          ton: usersTable.ton,
          tonyxCoins: usersTable.tonyxCoins,
          isBlocked: usersTable.isBlocked,
          isAdmin: usersTable.isAdmin,
          forceWin: usersTable.forceWin,
          lastIp: usersTable.lastIp,
          lastLoginAt: usersTable.lastLoginAt,
          createdAt: usersTable.createdAt,
          userStatus: usersTable.userStatus,
          bannedReason: usersTable.bannedReason,
          winRateModifier: usersTable.winRateModifier,
          warningCount: usersTable.warningCount,
          referralEarnings: usersTable.referralEarnings,
          totalAdsWatched: usersTable.totalAdsWatched,
          totalGamesPlayed: usersTable.totalGamesPlayed,
          wins: usersTable.wins,
          losses: usersTable.losses,
        })
        .from(usersTable)
        .where(or(
          ilike(usersTable.telegramId, pattern),
          ilike(usersTable.username, pattern),
          ilike(usersTable.firstName, pattern)
        ))
        .orderBy(desc(usersTable.createdAt))
        .limit(limit)
        .offset(offset);
      const countResult = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM users WHERE telegram_id ILIKE ${pattern} OR username ILIKE ${pattern} OR first_name ILIKE ${pattern}`);
      total = (countResult.rows[0] as any)?.cnt ?? 0;
    } else {
      users = await db
        .select({
          id: usersTable.id,
          telegramId: usersTable.telegramId,
          username: usersTable.username,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
          coins: usersTable.coins,
          ton: usersTable.ton,
          tonyxCoins: usersTable.tonyxCoins,
          isBlocked: usersTable.isBlocked,
          isAdmin: usersTable.isAdmin,
          forceWin: usersTable.forceWin,
          lastIp: usersTable.lastIp,
          lastLoginAt: usersTable.lastLoginAt,
          createdAt: usersTable.createdAt,
          userStatus: usersTable.userStatus,
          bannedReason: usersTable.bannedReason,
          winRateModifier: usersTable.winRateModifier,
          warningCount: usersTable.warningCount,
          referralEarnings: usersTable.referralEarnings,
          totalAdsWatched: usersTable.totalAdsWatched,
          totalGamesPlayed: usersTable.totalGamesPlayed,
          wins: usersTable.wins,
          losses: usersTable.losses,
        })
        .from(usersTable)
        .orderBy(desc(usersTable.createdAt))
        .limit(limit)
        .offset(offset);
      const countResult = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM users`);
      total = (countResult.rows[0] as any)?.cnt ?? 0;
    }

    const mapped = users.map(u => ({
      ...u,
      referrals: u.referralEarnings ?? 0,
      isOnline: false,
      twinCount: u.warningCount ?? 0,
      isMainAccount: true,
      totalOrders: 0,
      boostRate: "0",
      totalTonDeposited: "0",
      dailyOrdersStart: 0,
      dailyOrdersPro: 0,
      dailyOrdersElite: 0,
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

router.get("/settings/ad-config", async (req, res) => {
  try {
    const rows = await db.select().from(systemSettingsTable);
    const s: Record<string, string> = {};
    for (const r of rows) s[r.key] = r.value;
    res.json({
      rewardTon: parseFloat(s["ad_reward_ton"] ?? "0.0001") || 0.0001,
      rewardTonyx: parseFloat(s["ad_reward_tonyx"] ?? "0") || 0,
      dailyLimit: parseInt(s["ad_daily_limit"] ?? "100") || 100,
      resetHours: parseFloat(s["ad_reset_hours"] ?? "24") || 24,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/settings/ad-config", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) return;
  try {
    const { rewardTon, rewardTonyx, dailyLimit, resetHours } = req.body ?? {};
    const upsert = async (key: string, value: string) => {
      await db.insert(systemSettingsTable).values({ key, value }).onConflictDoUpdate({
        target: systemSettingsTable.key,
        set: { value, updatedAt: new Date() },
      });
    };
    await Promise.all([
      upsert("ad_reward_ton", String(rewardTon ?? 0.0001)),
      upsert("ad_reward_tonyx", String(rewardTonyx ?? 0)),
      upsert("ad_daily_limit", String(dailyLimit ?? 100)),
      upsert("ad_reset_hours", String(resetHours ?? 24)),
    ]);
    res.json({ message: "✅ Настройки рекламы сохранены" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ══════════════════ TASKS ══════════════════ */
router.get("/tasks-list", async (_req, res) => {
  try {
    const tasks = await db.select().from(miniTasksTable).orderBy(desc(miniTasksTable.createdAt));
    res.json({ tasks });
  } catch (e) {
    console.error("[Admin] tasks-list error:", e);
    res.status(500).json({ error: String(e) });
  }
});

router.post("/tasks-create", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) return;
  try {
    const { title, description, type, link, reward, rewardTon, maxCompletions } = req.body ?? {};
    if (!title || !String(title).trim()) {
      res.status(400).json({ error: "Название обязательно" });
      return;
    }
    const [created] = await db.insert(miniTasksTable).values({
      ownerId: adminId,
      title: String(title).trim(),
      description: description ? String(description) : null,
      type: type || "visit",
      link: link || null,
      reward: parseInt(reward) || 0,
      rewardTon: rewardTon != null ? String(rewardTon) : null,
      maxCompletions: maxCompletions ? parseInt(maxCompletions) : null,
      isActive: "true",
    }).returning();
    res.json({ message: "✅ Задание создано", task: created });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/tasks/:id/toggle", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) return;
  try {
    const id = parseInt(req.params.id);
    const active = req.body?.active;
    const newVal = active === true || active === "true" ? "true" : "false";
    await db.update(miniTasksTable).set({ isActive: newVal }).where(eq(miniTasksTable.id, id));
    res.json({ message: newVal === "true" ? "✅ Включено" : "⏸ Выключено" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/tasks/:id", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) return;
  try {
    const id = parseInt(req.params.id);
    await db.delete(miniTasksTable).where(eq(miniTasksTable.id, id));
    res.json({ message: "🗑 Удалено" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ══════════════════ QUEUE DEPTH & MARKET CONFIG ══════════════════ */
router.get("/settings/queue-depth", async (req, res) => {
  try {
    const rows = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "queue_depth"));
    res.json({ depth: parseInt(rows[0]?.value ?? "1") || 1 });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/settings/queue-depth", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) return;
  try {
    const depth = String(req.body?.depth ?? 1);
    await db.insert(systemSettingsTable).values({ key: "queue_depth", value: depth }).onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: { value: depth, updatedAt: new Date() },
    });
    res.json({ message: "✅ Глубина очереди сохранена" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/settings/market-config", async (req, res) => {
  try {
    const rows = await db.select().from(systemSettingsTable);
    const s: Record<string, string> = {};
    for (const r of rows) s[r.key] = r.value;
    res.json({
      feePct: parseFloat(s["market_fee_pct"] ?? "5") || 5,
      profitPctStart: parseFloat(s["profit_pct_start"] ?? "10") || 10,
      profitPctBase: parseFloat(s["profit_pct_base"] ?? "8") || 8,
      profitPctPro: parseFloat(s["profit_pct_pro"] ?? "6") || 6,
      profitPctElite: parseFloat(s["profit_pct_elite"] ?? "4") || 4,
      maxOrdersStart: parseInt(s["max_orders_start"] ?? "3") || 3,
      maxOrdersPro: parseInt(s["max_orders_pro"] ?? "3") || 3,
      maxOrdersElite: parseInt(s["max_orders_elite"] ?? "3") || 3,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/settings/market-config", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) return;
  try {
    const b = req.body ?? {};
    const upsert = async (key: string, value: string) => {
      await db.insert(systemSettingsTable).values({ key, value }).onConflictDoUpdate({
        target: systemSettingsTable.key,
        set: { value, updatedAt: new Date() },
      });
    };
    await Promise.all([
      upsert("market_fee_pct", String(b.feePct ?? 5)),
      upsert("profit_pct_start", String(b.profitPctStart ?? 10)),
      upsert("profit_pct_base", String(b.profitPctBase ?? 8)),
      upsert("profit_pct_pro", String(b.profitPctPro ?? 6)),
      upsert("profit_pct_elite", String(b.profitPctElite ?? 4)),
      upsert("max_orders_start", String(b.maxOrdersStart ?? 3)),
      upsert("max_orders_pro", String(b.maxOrdersPro ?? 3)),
      upsert("max_orders_elite", String(b.maxOrdersElite ?? 3)),
    ]);
    res.json({ message: "✅ Настройки маркета сохранены" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ══════════════════ USER ACTIONS ══════════════════ */
router.post("/users/:id/adjust-balance", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) return;
  try {
    const targetId = req.params.id;
    const { currency, amount, action } = req.body ?? {};
    const num = Number(amount);
    if (!num || num <= 0) { res.status(400).json({ error: "Сумма должна быть > 0" }); return; }
    const delta = action === "subtract" ? -num : num;
    if (currency === "ton") {
      await db.update(usersTable).set({ ton: sql`${usersTable.ton}::numeric + ${delta}` }).where(eq(usersTable.telegramId, targetId));
    } else if (currency === "tonyx") {
      await db.update(usersTable).set({ tonyxCoins: sql`${usersTable.tonyxCoins} + ${Math.round(delta)}` }).where(eq(usersTable.telegramId, targetId));
    } else {
      await db.update(usersTable).set({ coins: sql`${usersTable.coins} + ${Math.round(delta)}` }).where(eq(usersTable.telegramId, targetId));
    }
    res.json({ message: `✅ ${action === "add" ? "Начислено" : "Списано"}` });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:id/win-rate", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) return;
  try {
    const targetId = req.params.id;
    const modifier = req.body?.modifier;
    await db.update(usersTable).set({ winRateModifier: modifier == null ? null : String(modifier) }).where(eq(usersTable.telegramId, targetId));
    res.json({ message: "✅ Win-rate обновлён" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:id/force-win", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) return;
  try {
    const targetId = req.params.id;
    const enable = !!req.body?.enable;
    await db.update(usersTable).set({ forceWin: enable }).where(eq(usersTable.telegramId, targetId));
    res.json({ message: enable ? "✅ Force-win включён" : "⏸ Force-win выключен" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ══════════════════ TWINS (stub) ══════════════════ */
router.get("/twins", async (req, res) => {
  try {
    res.json({ groups: [] });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/twins/ban-group", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) return;
  res.json({ message: "✅ Группа обработана" });
});

/* ══════════════════ WITHDRAWALS ══════════════════ */
router.get("/withdrawals", async (req, res) => {
  try {
    const status = String(req.query.status ?? "pending");
    const rows = await db.select().from(miniWithdrawalsTable).where(eq(miniWithdrawalsTable.status, status)).orderBy(desc(miniWithdrawalsTable.createdAt)).limit(50);
    res.json({ withdrawals: rows });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/withdrawals/:id/approve", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) return;
  try {
    const id = parseInt(req.params.id);
    await db.update(miniWithdrawalsTable).set({ status: "approved", txHash: req.body?.txHash || null }).where(eq(miniWithdrawalsTable.id, id));
    res.json({ message: "✅ Одобрено" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/withdrawals/:id/reject", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) return;
  try {
    const id = parseInt(req.params.id);
    await db.update(miniWithdrawalsTable).set({ status: "rejected" }).where(eq(miniWithdrawalsTable.id, id));
    res.json({ message: "❌ Отклонено" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});


export default router;
