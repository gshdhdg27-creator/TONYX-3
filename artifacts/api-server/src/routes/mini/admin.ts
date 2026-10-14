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

/* GET /admin/user-status — admins always active, auto-clear ban */
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
    `Добро пожаловать обратно! Вы снова можете пользоваться всеми функциями приложения.`
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

export default router;
