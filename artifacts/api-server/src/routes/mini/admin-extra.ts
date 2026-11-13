import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, systemSettingsTable, miniTasksTable, miniUserInventoryTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const OWNER_ID = "7257793582";

function normalizeId(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).trim();
}
function extractAdminId(req: import("express").Request, res: import("express").Response): string {
  const botToken = process.env["TELEGRAM_BOT_TOKEN"];
  if (botToken) {
    return normalizeId((res.locals as Record<string, unknown>)["verifiedTelegramId"]);
  }
  return normalizeId(req.query.adminId ?? req.body?.adminId ?? req.headers["x-admin-id"]);
}

router.get("/settings/ad-config", async (_req, res) => {
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
  if (!adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const { rewardTon, rewardTonyx, dailyLimit, resetHours } = req.body ?? {};
    const upsert = async (key: string, value: string) => {
      const existing = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, key));
      if (existing.length > 0) {
        await db.update(systemSettingsTable).set({ value, updatedAt: new Date() }).where(eq(systemSettingsTable.key, key));
      } else {
        await db.insert(systemSettingsTable).values({ key, value });
      }
    };
    await Promise.all([
      upsert("ad_reward_ton", String(rewardTon ?? 0.0001)),
      upsert("ad_reward_tonyx", String(rewardTonyx ?? 0)),
      upsert("ad_daily_limit", String(dailyLimit ?? 100)),
      upsert("ad_reset_hours", String(resetHours ?? 24)),
    ]);
    res.json({ message: "Ad config saved" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/adjust-balance", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const targetId = normalizeId(req.params.telegramId);
    if (!targetId) {
      res.status(400).json({ error: "telegramId required" });
      return;
    }
    const currency = String(req.body?.currency ?? "").toLowerCase();
    const action = String(req.body?.action ?? "add").toLowerCase();
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      res.status(400).json({ error: "amount >= 0" });
      return;
    }
    if (action !== "set" && amount <= 0) {
      res.status(400).json({ error: "amount > 0" });
      return;
    }
    if (currency !== "ton" && currency !== "tonyx" && currency !== "coins") {
      res.status(400).json({ error: "currency: ton | tonyx | coins" });
      return;
    }
    const isSet = action === "set";
    const sign = action === "sub" || action === "subtract" || action === "remove" || action === "deduct" ? -1 : 1;
    const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, targetId)).then((r) => r[0] ?? null);
    if (!user) {
      res.status(404).json({ error: "user not found" });
      return;
    }
    if (currency === "ton") {
      const cur = Number(user.ton ?? 0);
      const next = Math.max(0, Math.round((isSet ? amount : cur + amount * sign) * 1e8) / 1e8);
      await db.update(usersTable).set({ ton: String(next), updatedAt: new Date() }).where(eq(usersTable.telegramId, targetId));
      res.json({ ok: true, message: `TON: ${next}`, ton: next, currency: "ton" });
      return;
    }
    if (currency === "coins") {
      const cur = Number(user.coins ?? 0);
      const next = Math.max(0, Math.floor(isSet ? amount : cur + amount * sign));
      await db.update(usersTable).set({ coins: next, updatedAt: new Date() }).where(eq(usersTable.telegramId, targetId));
      res.json({ ok: true, message: `Pts: ${next}`, coins: next, currency: "coins" });
      return;
    }
    const cur = Number(user.tonyxCoins ?? 0);
    const next = Math.max(0, Math.floor(isSet ? amount : cur + amount * sign));
    await db.update(usersTable).set({ tonyxCoins: next, updatedAt: new Date() }).where(eq(usersTable.telegramId, targetId));
    res.json({ ok: true, message: `TONYX: ${next}`, tonyxCoins: next, currency: "tonyx" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/grant-gift", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const targetId = normalizeId(req.params.telegramId);
    if (!targetId) {
      res.status(400).json({ error: "telegramId required" });
      return;
    }
    const short = String(req.body?.short ?? req.body?.itemId ?? "").trim();
    const giftName = String(req.body?.giftName ?? short).trim();
    const model = String(req.body?.model ?? "").trim();
    const backdrop = String(req.body?.backdrop ?? "").trim();
    const symbol = String(req.body?.symbol ?? "").trim();
    const imageUrl = req.body?.imageUrl ? String(req.body.imageUrl) : null;
    const list = Boolean(req.body?.list);
    const priceTon = Number(req.body?.priceTon);
    if (!short || !model || !backdrop || !symbol) {
      res.status(400).json({ error: "short, model, backdrop, symbol required" });
      return;
    }
    if (list && (!Number.isFinite(priceTon) || priceTon <= 0)) {
      res.status(400).json({ error: "priceTon > 0 required when listing" });
      return;
    }
    const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, targetId)).then((r) => r[0] ?? null);
    if (!user) {
      res.status(404).json({ error: "user not found" });
      return;
    }
    const meta: Record<string, unknown> = {
      source: "admin_grant",
      grantedBy: adminId,
      grantedAt: new Date().toISOString(),
      giftName,
      short,
      model,
      backdrop,
      symbol,
      imageUrl,
      kind: "tg_gift",
    };
    if (list) {
      meta.listed = true;
      meta.priceTon = priceTon;
      meta.listedAt = new Date().toISOString();
    }
    const inserted = await db.insert(miniUserInventoryTable).values({
      telegramId: targetId,
      itemType: "nft_full",
      itemId: short,
      quantity: 1,
      meta,
    }).returning();
    res.json({ ok: true, message: list ? `listed ${priceTon} TON` : `granted to ${targetId}`, item: inserted[0] ?? null });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/ban", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const targetId = normalizeId(req.params.telegramId);
    if (!targetId || targetId === OWNER_ID) { res.status(400).json({ error: "invalid target" }); return; }
    const reason = String(req.body?.reason ?? "banned by admin");
    await db.update(usersTable).set({ isBanned: true, banReason: reason, updatedAt: new Date() }).where(eq(usersTable.telegramId, targetId));
    res.json({ ok: true, message: "banned" });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.post("/users/:telegramId/unban", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const targetId = normalizeId(req.params.telegramId);
    await db.update(usersTable).set({ isBanned: false, banReason: null, updatedAt: new Date() }).where(eq(usersTable.telegramId, targetId));
    res.json({ ok: true, message: "unbanned" });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export default router;
