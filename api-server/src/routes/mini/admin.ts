import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniMarketOrdersTable, systemSettingsTable, miniWithdrawalsTable, miniTopupRequestsTable } from "@workspace/db/schema";
import { eq, sql, or, ilike, desc } from "drizzle-orm";

const router: IRouter = Router();

/* ══════════════════════════════════════════════════════════════════
   OWNER — hardcoded Telegram ID of the superadmin.
   All checks for this ID are SYNCHRONOUS — no DB lookup ever.
   This constant is the single source of truth; do NOT change it.
══════════════════════════════════════════════════════════════════ */
const OWNER_ID = "7257793582";

/* ─── Optional extra admins via env (additive only, cannot override owner) ─── */
const EXTRA_ADMIN_IDS = (process.env.ADMIN_TELEGRAM_IDS ?? "")
  .split(",").map(s => s.trim()).filter(Boolean).filter(id => id !== OWNER_ID);

const SUPERADMIN_IDS = new Set([OWNER_ID, ...EXTRA_ADMIN_IDS]);

/* ─── Normalize incoming IDs — always string + trimmed ─── */
function normalizeId(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).trim();
}

/* ─── Extract the calling admin's ID from query, body, or header ─── */
function extractAdminId(req: import("express").Request): string {
  // Accept from: ?adminId=, body.adminId, or X-Admin-Id header
  return normalizeId(
    req.query.adminId ?? req.body?.adminId ?? req.headers["x-admin-id"]
  );
}

/* ─── Async check: superadmin list (sync) OR DB isAdmin flag ─── */
async function checkAdmin(id: string): Promise<boolean> {
  if (!id) return false;
  // OWNER and env-configured superadmins: SYNCHRONOUS — no DB lookup
  if (SUPERADMIN_IDS.has(id)) return true;
  // For other IDs: check DB flag
  const user = await db
    .select({ isAdmin: usersTable.isAdmin })
    .from(usersTable)
    .where(eq(usersTable.telegramId, id))
    .then(r => r[0] ?? null);
  return user?.isAdmin === true;
}

/* ════════════════════════════════════════════════════
   PUBLIC — no middleware needed
════════════════════════════════════════════════════ */

/* GET /admin/check?telegramId=... */
router.get("/check", async (req, res) => {
  const id = normalizeId(req.query.telegramId);
  const isSuperAdmin = id === OWNER_ID;
  // Fast path: owner always admin
  if (isSuperAdmin) {
    res.json({ isAdmin: true, isSuperAdmin: true, ownerId: OWNER_ID });
    return;
  }
  const isAdmin = await checkAdmin(id);
  res.json({ isAdmin, isSuperAdmin: false });
});

/* ════════════════════════════════════════════════════
   PROTECTED — admin middleware below
════════════════════════════════════════════════════ */

router.use(async (req, res, next) => {
  const id = extractAdminId(req);

  // SYNCHRONOUS fast-path for owner — zero DB overhead
  if (id === OWNER_ID) { next(); return; }

  // Async check for DB-level admins
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
  const adminId = extractAdminId(req);
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
      totalUsers:     usersCount.rows[0]?.cnt ?? 0,
      totalCoinsSold,
      totalTonVolume: Number(soldRow.rows[0]?.total_ton ?? 0),
      activeOrders:   activeOrders.rows[0]?.cnt ?? 0,
      isMarketActive: settings["is_market_active"] === "true",
      canActivate:    totalCoinsSold >= 1_000_000,
      poolProgress:   Math.min(100, (totalCoinsSold / 1_000_000) * 100).toFixed(2),
      settings,
      isSuperAdmin,
      admins: adminRows.rows.map(a => ({ telegramId: a.telegram_id, username: a.username })),
    });
  } catch (e) {
    console.error("[Admin] GET stats error:", e);
    res.status(500).json({ error: "Database error fetching stats" });
  }
});

/* GET /admin/users */
router.get("/users", async (req, res) => {
  const search = normalizeId(req.query.search);
  const page   = Math.max(1, parseInt(String(req.query.page ?? "1")));
  const limit  = 20;
  const offset = (page - 1) * limit;
  try {
    const rows = search
      ? await db.select().from(usersTable)
          .where(or(
            eq(usersTable.telegramId, search),
            ilike(usersTable.username, `%${search.replace(/^@/, "")}%`),
            ilike(usersTable.firstName, `%${search}%`),
          ))
          .orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset)
      : await db.select().from(usersTable)
          .orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset);

    const enriched = await Promise.all(rows.map(async (u) => {
      let ordersCount = 0;
      let referralsCount = 0;
      try {
        const [ordersRow, referralsRow] = await Promise.all([
          db.execute<{ cnt: number }>(sql`SELECT COUNT(*)::int AS cnt FROM mini_market_orders WHERE seller_id = ${u.telegramId}`),
          db.execute<{ cnt: number }>(sql`SELECT COUNT(*)::int AS cnt FROM users WHERE referred_by = ${u.telegramId}`),
        ]);
        ordersCount = ordersRow.rows[0]?.cnt ?? 0;
        referralsCount = referralsRow.rows[0]?.cnt ?? 0;
      } catch { /* non-fatal */ }

      const isOnline = u.lastLoginAt && (Date.now() - u.lastLoginAt.getTime() < 5 * 60 * 1000);
      return {
        id: u.id, telegramId: u.telegramId, username: u.username ?? null,
        firstName: u.firstName ?? null, lastName: u.lastName ?? null,
        coins: Number(u.coins ?? 0), ton: Number(u.ton ?? 0), tonyxCoins: Number(u.tonyxCoins ?? 0),
        boostRate: Number(u.boostRate ?? 0),
        totalTonDeposited: Number(u.totalTonDeposited ?? 0),
        totalAdsWatched: u.totalAdsWatched ?? 0, totalGamesPlayed: u.totalGamesPlayed ?? 0,
        wins: u.wins ?? 0, losses: u.losses ?? 0,
        totalOrders: ordersCount,
        referrals: referralsCount,
        isBlocked: u.isBlocked ?? false, isAdmin: u.isAdmin ?? false,
        isOnline: !!isOnline, lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
        dailyOrdersStart: u.dailyOrdersStart ?? 0,
        dailyOrdersPro: u.dailyOrdersPro ?? 0,
        dailyOrdersElite: u.dailyOrdersElite ?? 0,
      };
    }));

    res.json({ users: enriched, page, hasMore: rows.length === limit });
  } catch (e) {
    console.error("[Admin] GET users error:", e);
    res.status(500).json({ error: "Database error fetching users" });
  }
});

/* POST /admin/market/activate */
router.post("/market/activate", async (_req, res) => {
  const soldRow = await db.execute<{ sold: number }>(
    sql`SELECT COALESCE(SUM(amount),0)::int AS sold FROM mini_market_orders WHERE status = 'sold'`,
  );
  const sold = soldRow.rows[0]?.sold ?? 0;
  if (sold < 1_000_000) {
    res.status(400).json({ error: `Нельзя — куплено ${sold.toLocaleString()} из 1 000 000`, sold }); return;
  }
  await db.insert(systemSettingsTable)
    .values({ key: "is_market_active", value: "true" })
    .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: "true", updatedAt: new Date() } });
  res.json({ success: true, message: "P2P рынок активирован!" });
});

/* POST /admin/market/deactivate */
router.post("/market/deactivate", async (_req, res) => {
  await db.insert(systemSettingsTable)
    .values({ key: "is_market_active", value: "false" })
    .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: "false", updatedAt: new Date() } });
  res.json({ success: true, message: "P2P рынок деактивирован" });
});

/* POST /admin/market/force-activate */
router.post("/market/force-activate", async (_req, res) => {
  await db.insert(systemSettingsTable)
    .values({ key: "is_market_active", value: "true" })
    .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: "true", updatedAt: new Date() } });
  res.json({ success: true, message: "P2P рынок принудительно активирован" });
});

/* POST /admin/team/grant */
router.post("/team/grant", async (req, res) => {
  const adminId  = extractAdminId(req);
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
  await db.update(usersTable).set({ isAdmin: true, updatedAt: new Date() }).where(eq(usersTable.telegramId, targetId));
  console.log(`[Admin] ${adminId} GRANTED admin to ${targetId} (@${target.username ?? "—"})`);
  res.json({ success: true, message: `✅ Роль администратора выдана @${target.username ?? targetId}` });
});

/* POST /admin/team/revoke */
router.post("/team/revoke", async (req, res) => {
  const adminId  = extractAdminId(req);
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
  console.log(`[Admin] ${adminId} REVOKED admin from ${targetId} (@${target.username ?? "—"})`);
  res.json({ success: true, message: `✅ Роль администратора снята с @${target.username ?? targetId}` });
});

/* POST /admin/users/:id/block */
router.post("/users/:id/block", async (req, res) => {
  const { id } = req.params;
  const { block } = req.body as { block: boolean };
  await db.update(usersTable).set({ isBlocked: !!block, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, id));
  res.json({ success: true });
});

/* POST /admin/users/:id/adjust-balance */
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

/* ══════════════════════════════════════════════════════════════════
   WITHDRAWAL MANAGEMENT
══════════════════════════════════════════════════════════════════ */

/* GET /admin/withdrawals?status=pending */
router.get("/withdrawals", async (req, res) => {
  const status = String(req.query.status ?? "pending");
  try {
    const rows = await db.select()
      .from(miniWithdrawalsTable)
      .where(eq(miniWithdrawalsTable.status, status))
      .orderBy(desc(miniWithdrawalsTable.createdAt));

    const enriched = await Promise.all(rows.map(async (w) => {
      const userRow = await db.select({
        firstName: usersTable.firstName,
        username: usersTable.username,
        lastIp: usersTable.lastIp,
      }).from(usersTable).where(eq(usersTable.telegramId, w.telegramId)).then((r) => r[0] ?? null);

      let isTwin = false;
      if (userRow?.lastIp) {
        try {
          const twins = await db.execute<{ cnt: number }>(
            sql`SELECT COUNT(*)::int AS cnt FROM users WHERE last_ip = ${userRow.lastIp} AND telegram_id != ${w.telegramId}`,
          );
          isTwin = (twins.rows[0]?.cnt ?? 0) > 0;
        } catch { /* ignore twin check error */ }
      }

      return {
        id: w.id,
        telegramId: w.telegramId,
        tonAmount: w.tonAmount,
        amount: w.amount,
        address: w.address,
        status: w.status,
        txHash: w.txHash ?? null,
        createdAt: w.createdAt.toISOString(),
        userFirstName: userRow?.firstName ?? null,
        userUsername: userRow?.username ?? null,
        userLastIp: userRow?.lastIp ?? null,
        isTwin,
      };
    }));

    res.json({ withdrawals: enriched });
  } catch (e) {
    console.error("[Admin] GET withdrawals error:", e);
    res.status(500).json({ error: "Database error" });
  }
});

/* POST /admin/withdrawals/:id/approve */
router.post("/withdrawals/:id/approve", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid withdrawal ID" }); return; }

  let row;
  try {
    row = await db.select().from(miniWithdrawalsTable)
      .where(eq(miniWithdrawalsTable.id, id))
      .then((r) => r[0] ?? null);
  } catch (e) {
    console.error("[Admin] approve fetch error:", e);
    res.status(500).json({ error: "Database error" });
    return;
  }

  if (!row) { res.status(404).json({ error: "Withdrawal not found" }); return; }
  if (row.status !== "pending") { res.status(400).json({ error: "Withdrawal is not in pending state" }); return; }

  const manualTxHash: string | null = req.body?.txHash ? String(req.body.txHash) : null;
  let txHash: string | null = manualTxHash;

  const mnemonic = process.env.ADMIN_WALLET_MNEMONIC;
  if (mnemonic && !txHash && row.tonAmount) {
    try {
      const { TonClient, WalletContractV4, internal, toNano } = await import("@ton/ton");
      const { mnemonicToPrivateKey } = await import("@ton/crypto");
      const endpoint = process.env.TON_ENDPOINT ?? "https://toncenter.com/api/v2/jsonRPC";
      const apiKey = process.env.TON_API_KEY ?? "";

      const keyPair = await mnemonicToPrivateKey(mnemonic.split(" "));
      const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
      const client = new TonClient({ endpoint, apiKey });
      const contract = client.open(wallet);
      const seqno = await contract.getSeqno();

      await contract.sendTransfer({
        secretKey: keyPair.secretKey,
        seqno,
        messages: [internal({ to: row.address, value: toNano(row.tonAmount), bounce: false })],
      });

      txHash = `auto_${Date.now()}_seqno${seqno}`;
      console.log(`[Withdrawal] Auto-sent ${row.tonAmount} TON to ${row.address}, seqno=${seqno}`);
    } catch (e) {
      console.error("[Withdrawal] Auto-send failed:", e);
      res.status(500).json({ error: `Auto-send failed: ${String(e)}. Add txHash manually to approve.` });
      return;
    }
  }

  await db.update(miniWithdrawalsTable)
    .set({ status: "approved", txHash: txHash ?? undefined })
    .where(eq(miniWithdrawalsTable.id, id));

  console.log(`[Withdrawal] id=${id} approved by admin. txHash=${txHash ?? "manual"}`);
  res.json({ ok: true, txHash, message: "Withdrawal approved" + (txHash ? `. TX: ${txHash}` : " (manual process)") });
});

/* POST /admin/withdrawals/:id/reject */
router.post("/withdrawals/:id/reject", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid withdrawal ID" }); return; }

  const row = await db.select().from(miniWithdrawalsTable)
    .where(eq(miniWithdrawalsTable.id, id))
    .then((r) => r[0] ?? null);

  if (!row) { res.status(404).json({ error: "Withdrawal not found" }); return; }
  if (row.status !== "pending") { res.status(400).json({ error: "Withdrawal is not in pending state" }); return; }

  if (row.tonAmount) {
    const user = await db.select().from(usersTable)
      .where(eq(usersTable.telegramId, row.telegramId))
      .then((r) => r[0] ?? null);
    if (user) {
      const refunded = parseFloat((Number(user.ton ?? 0) + Number(row.tonAmount)).toFixed(8));
      await db.update(usersTable)
        .set({ ton: String(refunded), updatedAt: new Date() })
        .where(eq(usersTable.telegramId, row.telegramId));
      console.log(`[Withdrawal] id=${id} rejected — refunded ${row.tonAmount} TON to ${row.telegramId}`);
    }
  }

  await db.update(miniWithdrawalsTable)
    .set({ status: "rejected" })
    .where(eq(miniWithdrawalsTable.id, id));

  res.json({ ok: true, message: "Withdrawal rejected. TON balance returned to user." });
});

/* ══════════════════════════════════════════════════════════════════
   TOPUP MANAGEMENT
══════════════════════════════════════════════════════════════════ */

/* GET /admin/topups?status=pending */
router.get("/topups", async (req, res) => {
  const adminId = normalizeId(req.query.adminId ?? req.body?.adminId ?? req.headers["x-admin-id"]);
  if (!(await checkAdmin(adminId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const status = String(req.query.status ?? "pending");
  try {
    const rows = await db.select().from(miniTopupRequestsTable)
      .where(eq(miniTopupRequestsTable.status, status))
      .orderBy(desc(miniTopupRequestsTable.createdAt));

    const enriched = await Promise.all(rows.map(async (t) => {
      const userRow = await db.select({
        firstName: usersTable.firstName,
        username: usersTable.username,
      }).from(usersTable).where(eq(usersTable.telegramId, t.telegramId)).then(r => r[0] ?? null);
      return {
        id: t.id,
        telegramId: t.telegramId,
        tonAmount: t.tonAmount,
        memo: t.memo,
        walletAddress: t.walletAddress,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
        userFirstName: userRow?.firstName ?? null,
        userUsername: userRow?.username ?? null,
      };
    }));

    res.json({ topups: enriched });
  } catch (e) {
    console.error("[Admin] GET topups error:", e);
    res.status(500).json({ error: "Database error" });
  }
});

/* POST /admin/topups/:id/approve — credit TON to user */
router.post("/topups/:id/approve", async (req, res) => {
  const adminId = normalizeId(req.body?.adminId ?? req.query.adminId ?? req.headers["x-admin-id"]);
  if (!(await checkAdmin(adminId))) { res.status(403).json({ error: "Forbidden" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid topup ID" }); return; }

  try {
    const row = await db.select().from(miniTopupRequestsTable)
      .where(eq(miniTopupRequestsTable.id, id))
      .then(r => r[0] ?? null);
    if (!row) { res.status(404).json({ error: "Topup request not found" }); return; }
    if (row.status !== "pending") { res.status(400).json({ error: "Topup already processed" }); return; }

    const tonAmount = Number(row.tonAmount);
    if (!isNaN(tonAmount) && tonAmount > 0) {
      const user = await db.select({ ton: usersTable.ton })
        .from(usersTable).where(eq(usersTable.telegramId, row.telegramId))
        .then(r => r[0] ?? null);
      if (user) {
        const newTon = parseFloat((Number(user.ton ?? 0) + tonAmount).toFixed(8));
        await db.update(usersTable)
          .set({ ton: String(newTon), updatedAt: new Date() })
          .where(eq(usersTable.telegramId, row.telegramId));
        console.log(`[Topup] id=${id} approved — credited ${tonAmount} TON to ${row.telegramId}`);
      }
    }

    await db.update(miniTopupRequestsTable)
      .set({ status: "approved" })
      .where(eq(miniTopupRequestsTable.id, id));

    res.json({ ok: true, message: `Топап одобрен: +${row.tonAmount} TON зачислено пользователю` });
  } catch (e) {
    console.error("[Admin] topup approve error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

/* POST /admin/topups/:id/reject */
router.post("/topups/:id/reject", async (req, res) => {
  const adminId = normalizeId(req.body?.adminId ?? req.query.adminId ?? req.headers["x-admin-id"]);
  if (!(await checkAdmin(adminId))) { res.status(403).json({ error: "Forbidden" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid topup ID" }); return; }

  try {
    const row = await db.select().from(miniTopupRequestsTable)
      .where(eq(miniTopupRequestsTable.id, id))
      .then(r => r[0] ?? null);
    if (!row) { res.status(404).json({ error: "Topup request not found" }); return; }
    if (row.status !== "pending") { res.status(400).json({ error: "Topup already processed" }); return; }

    await db.update(miniTopupRequestsTable)
      .set({ status: "rejected" })
      .where(eq(miniTopupRequestsTable.id, id));

    res.json({ ok: true, message: "Топап отклонён" });
  } catch (e) {
    console.error("[Admin] topup reject error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
