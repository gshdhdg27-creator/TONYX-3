import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, systemSettingsTable } from "@workspace/db/schema";
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

router.post("/users/:telegramId/soft-delete", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const targetId = normalizeId(req.params.telegramId);
    if (!targetId || targetId === OWNER_ID) {
      res.status(400).json({ error: "Нельзя удалить владельца" });
      return;
    }
    await db.update(usersTable).set({
      isBlocked: true,
      userStatus: "soft_deleted",
      bannedReason: String(req.body?.reason ?? "Мягкое удаление админом").slice(0, 500),
      updatedAt: new Date(),
    }).where(eq(usersTable.telegramId, targetId));
    res.json({ ok: true, message: "Аккаунт мягко удалён" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/restore", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const targetId = normalizeId(req.params.telegramId);
    if (!targetId) { res.status(400).json({ error: "telegramId required" }); return; }
    await db.update(usersTable).set({
      isBlocked: false,
      userStatus: "active",
      bannedReason: null,
      updatedAt: new Date(),
    }).where(eq(usersTable.telegramId, targetId));
    res.json({ ok: true, message: "Аккаунт восстановлен" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/twins", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const rows = await db.select({
      telegramId: usersTable.telegramId,
      username: usersTable.username,
      firstName: usersTable.firstName,
      createdAt: usersTable.createdAt,
      lastLoginAt: usersTable.lastLoginAt,
      lastIp: usersTable.lastIp,
      warningCount: usersTable.warningCount,
      isBlocked: usersTable.isBlocked,
      userStatus: usersTable.userStatus,
      ton: usersTable.ton,
      tonyxCoins: usersTable.tonyxCoins,
    }).from(usersTable);

    const byIp = new Map<string, typeof rows>();
    for (const u of rows) {
      const ip = (u.lastIp ?? "").trim();
      if (!ip || ip === "unknown" || ip === "null") continue;
      const list = byIp.get(ip) ?? [];
      list.push(u);
      byIp.set(ip, list);
    }

    const groups = [...byIp.entries()]
      .filter(([, list]) => list.length >= 2)
      .map(([ip, list]) => {
        const sorted = [...list].sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return ta - tb;
        });
        return {
          ip,
          matchedBy: "ip" as const,
          count: sorted.length,
          accounts: sorted.map((a, i) => ({
            telegramId: a.telegramId,
            username: a.username,
            firstName: a.firstName,
            createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : null,
            lastLoginAt: a.lastLoginAt ? new Date(a.lastLoginAt).toISOString() : null,
            warningCount: Number(a.warningCount ?? 0),
            isMain: i === 0,
            isBlocked: Boolean(a.isBlocked),
            userStatus: a.userStatus ?? null,
            ton: Number(a.ton ?? 0),
            tonyxCoins: Number(a.tonyxCoins ?? 0),
          })),
        };
      })
      .sort((a, b) => b.count - a.count);

    res.json({ groups });
  } catch (e) {
    console.error("[Admin] GET /twins", e);
    res.status(500).json({ error: String(e), groups: [] });
  }
});

router.post("/twins/ban-group", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const ip = String(req.body?.ip ?? req.body?.deviceId ?? "").trim();
    const keepMain = Boolean(req.body?.keepMain);
    const reason = String(req.body?.reason ?? "Твинк-аккаунт (мульти-аккаунт)").slice(0, 500);
    if (!ip) { res.status(400).json({ error: "ip required" }); return; }

    const rows = await db.select({
      telegramId: usersTable.telegramId,
      createdAt: usersTable.createdAt,
    }).from(usersTable).where(eq(usersTable.lastIp, ip));

    const sorted = [...rows].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });

    let banned = 0;
    for (let i = 0; i < sorted.length; i++) {
      const u = sorted[i];
      if (u.telegramId === OWNER_ID) continue;
      if (keepMain && i === 0) continue;
      await db.update(usersTable).set({
        isBlocked: true,
        userStatus: "banned",
        bannedReason: reason,
        updatedAt: new Date(),
      }).where(eq(usersTable.telegramId, u.telegramId));
      banned++;
    }

    res.json({
      ok: true,
      message: keepMain
        ? `Забанено твинков: ${banned} (главный оставлен)`
        : `Забанено аккаунтов: ${banned}`,
      banned,
    });
  } catch (e) {
    console.error("[Admin] POST /twins/ban-group", e);
    res.status(500).json({ error: String(e) });
  }
});

router.get("/settings/nft-market", async (_req, res) => {
  try {
    const rows = await db.select().from(systemSettingsTable);
    const s: Record<string, string> = {};
    for (const r of rows) s[r.key] = r.value;
    res.json({
      feePercent: parseFloat(s["nft_market_fee_pct"] ?? "1") || 1,
      enabled: (s["nft_market_enabled"] ?? "1") !== "0",
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/settings/nft-market", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const fee = Number(req.body?.feePercent);
    const enabled = req.body?.enabled;
    const upsert = async (key: string, value: string) => {
      const existing = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, key));
      if (existing.length > 0) {
        await db.update(systemSettingsTable).set({ value, updatedAt: new Date() }).where(eq(systemSettingsTable.key, key));
      } else {
        await db.insert(systemSettingsTable).values({ key, value });
      }
    };
    if (Number.isFinite(fee) && fee >= 0 && fee <= 50) {
      await upsert("nft_market_fee_pct", String(fee));
    }
    if (typeof enabled === "boolean") {
      await upsert("nft_market_enabled", enabled ? "1" : "0");
    }
    res.json({ message: "✅ NFT market settings saved" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
