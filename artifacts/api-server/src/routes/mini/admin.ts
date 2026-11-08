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

/** Crash control — sequential rounds admin */
router.get("/settings/crash", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) return;
  try {
    const { getRoundState, resolveCrash } = await import("./games-crash.js");
    const st = await getRoundState();
    const nextId = st.phase === "betting" ? st.roundId : st.roundId + 1;
    const nextCrash = await resolveCrash(nextId);
    res.json({ ...st, nextRoundId: nextId, nextCrashPreview: nextCrash });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "crash state failed" });
  }
});

router.post("/settings/crash/force-next", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) return;
  try {
    const mult = Number(req.body?.mult);
    if (!Number.isFinite(mult) || mult < 1 || mult > 100) {
      res.status(400).json({ error: "mult must be 1–100" });
      return;
    }
    const { getRoundState, setCrashOverride } = await import("./games-crash.js");
    const st = await getRoundState();
    const target = st.phase === "betting" ? st.roundId : st.roundId + 1;
    await setCrashOverride(target, mult);
    res.json({ ok: true, message: `Коэффициент ${mult}x для раунда #${target}`, targetRoundId: target, mult });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "force failed" });
  }
});

router.post("/settings/crash/reset", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) return;
  try {
    const { resetCrashRounds, getRoundState } = await import("./games-crash.js");
    await resetCrashRounds();
    const st = await getRoundState();
    res.json({ ok: true, message: "Раунды сброшены — снова с #1", ...st });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "reset failed" });
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
      crash: s["game_enabled_crash"] !== "false",
      plinko: s["game_enabled_plinko"] !== "false",
      upgrade: s["game_enabled_upgrade"] !== "false",
      coin: s["game_enabled_coin"] !== "false",
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

router.get("/users", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const search = String(req.query.search ?? "").trim();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "30"), 10) || 30));
    const offset = (page - 1) * limit;

    const where = search
      ? or(
          ilike(usersTable.telegramId, `%${search}%`),
          ilike(usersTable.username, `%${search}%`),
          ilike(usersTable.firstName, `%${search}%`),
          ilike(usersTable.lastName, `%${search}%`),
        )
      : undefined;

    const base = db.select().from(usersTable);
    const rows = where
      ? await base.where(where).orderBy(desc(usersTable.createdAt)).limit(limit + 1).offset(offset)
      : await base.orderBy(desc(usersTable.createdAt)).limit(limit + 1).offset(offset);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const users = pageRows.map((u) => {
      const lastLogin = u.lastLoginAt ? new Date(u.lastLoginAt).getTime() : 0;
      const isOnline = lastLogin > Date.now() - 5 * 60 * 1000;
      return {
        id: u.id,
        telegramId: u.telegramId,
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        coins: u.coins,
        ton: Number(u.ton ?? 0),
        tonyxCoins: u.tonyxCoins,
        totalTonDeposited: Number(u.totalTonDeposited ?? 0),
        totalAdsWatched: u.totalAdsWatched,
        totalGamesPlayed: u.totalGamesPlayed,
        wins: u.wins,
        losses: u.losses,
        totalOrders: 0,
        referrals: 0,
        isBlocked: u.isBlocked,
        isAdmin: u.isAdmin,
        isOnline,
        forceWin: u.forceWin,
        lastIp: u.lastIp,
        twinCount: u.warningCount ?? 0,
        isMainAccount: true,
        lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,
        createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
        dailyOrdersStart: u.dailyOrdersStart,
        dailyOrdersPro: u.dailyOrdersPro,
        dailyOrdersElite: u.dailyOrdersElite,
        userStatus: u.userStatus,
        bannedReason: u.bannedReason,
        winRateModifier: u.winRateModifier != null ? Number(u.winRateModifier) : null,
      };
    });

    res.json({ users, hasMore, page, limit });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Admin] GET /users FAILED:", msg);
    res.status(500).json({ error: `DB error: ${msg}`, users: [], hasMore: false });
  }
});

export { router as adminRouterPartial };
export default router;
