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
    res.json({ message: "✅ Настройки рекламы сохранены" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Credit / debit / set TON, TONYX or coins */
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
      res.status(400).json({ error: "Сумма должна быть >= 0" });
      return;
    }
    if (action !== "set" && amount <= 0) {
      res.status(400).json({ error: "Сумма должна быть > 0" });
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
      res.status(404).json({ error: "Пользователь не найден" });
      return;
    }

    if (currency === "ton") {
      const cur = Number(user.ton ?? 0);
      const next = Math.max(0, Math.round((isSet ? amount : cur + amount * sign) * 1e8) / 1e8);
      await db.update(usersTable).set({ ton: String(next), updatedAt: new Date() }).where(eq(usersTable.telegramId, targetId));
      console.log(`[Admin] ${adminId} ton ${isSet ? "set" : (sign > 0 ? "+" : "-")}${amount} → ${targetId} = ${next}`);
      res.json({ ok: true, message: `TON: ${next}`, ton: next, currency: "ton" });
      return;
    }

    if (currency === "coins") {
      const cur = Number(user.coins ?? 0);
      const next = Math.max(0, Math.floor(isSet ? amount : cur + amount * sign));
      await db.update(usersTable).set({ coins: next, updatedAt: new Date() }).where(eq(usersTable.telegramId, targetId));
      console.log(`[Admin] ${adminId} coins ${isSet ? "set" : (sign > 0 ? "+" : "-")}${amount} → ${targetId} = ${next}`);
      res.json({ ok: true, message: `Pts: ${next}`, coins: next, currency: "coins" });
      return;
    }

    // tonyx
    const cur = Number(user.tonyxCoins ?? 0);
    const next = Math.max(0, Math.floor(isSet ? amount : cur + amount * sign));
    await db.update(usersTable).set({ tonyxCoins: next, updatedAt: new Date() }).where(eq(usersTable.telegramId, targetId));
    console.log(`[Admin] ${adminId} tonyx ${isSet ? "set" : (sign > 0 ? "+" : "-")}${amount} → ${targetId} = ${next}`);
    res.json({ ok: true, message: `TONYX: ${next}`, tonyxCoins: next, currency: "tonyx" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Admin] adjust-balance FAILED:", msg);
    res.status(500).json({ error: msg });
  }
});

router.post("/users/:telegramId/win-rate", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const targetId = normalizeId(req.params.telegramId);
    if (!targetId || targetId === OWNER_ID) {
      res.status(400).json({ error: "Нельзя изменить владельца" });
      return;
    }
    let modifier: number | null = null;
    if (req.body?.modifier !== null && req.body?.modifier !== undefined && req.body?.modifier !== "") {
      const m = Number(req.body.modifier);
      if (!Number.isFinite(m) || m < 0 || m > 100) {
        res.status(400).json({ error: "modifier 0–100 или null" });
        return;
      }
      modifier = m;
    }
    await db.update(usersTable).set({
      winRateModifier: modifier == null ? null : String(modifier),
      updatedAt: new Date(),
    }).where(eq(usersTable.telegramId, targetId));
    res.json({ ok: true, message: modifier == null ? "Честная игра" : `Win rate ${modifier}%`, modifier });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/ban", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const targetId = normalizeId(req.params.telegramId);
    if (!targetId || targetId === OWNER_ID) {
      res.status(400).json({ error: "Нельзя банить владельца" });
      return;
    }
    const reason = String(req.body?.reason ?? "Banned by admin").slice(0, 500);
    await db.update(usersTable).set({
      userStatus: "banned",
      isBlocked: true,
      bannedReason: reason,
      updatedAt: new Date(),
    }).where(eq(usersTable.telegramId, targetId));
    res.json({ ok: true, message: "Забанен", reason });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/unban", async (req, res) => {
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
    await db.update(usersTable).set({
      userStatus: "active",
      isBlocked: false,
      bannedReason: null,
      updatedAt: new Date(),
    }).where(eq(usersTable.telegramId, targetId));
    res.json({ ok: true, message: "Разбанен" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/force-win", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const targetId = normalizeId(req.params.telegramId);
    if (!targetId || targetId === OWNER_ID) {
      res.status(400).json({ error: "Нельзя" });
      return;
    }
    const enable = Boolean(req.body?.enable);
    await db.update(usersTable).set({ forceWin: enable, updatedAt: new Date() }).where(eq(usersTable.telegramId, targetId));
    res.json({ ok: true, message: enable ? "Force win ВКЛ" : "Force win ВЫКЛ", forceWin: enable });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/reset", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const targetId = normalizeId(req.params.telegramId);
    if (!targetId || targetId === OWNER_ID) {
      res.status(400).json({ error: "Нельзя сбросить владельца" });
      return;
    }
    await db.update(usersTable).set({
      ton: "0",
      tonyxCoins: 0,
      coins: 0,
      wins: 0,
      losses: 0,
      totalGamesPlayed: 0,
      forceWin: false,
      winRateModifier: null,
      updatedAt: new Date(),
    }).where(eq(usersTable.telegramId, targetId));
    res.json({ ok: true, message: "Баланс и статистика сброшены" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/delete-data", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const targetId = normalizeId(req.params.telegramId);
    if (!targetId || targetId === OWNER_ID) {
      res.status(400).json({ error: "Нельзя удалить владельца" });
      return;
    }
    await db.update(usersTable).set({
      ton: "0",
      tonyxCoins: 0,
      coins: 0,
      username: null,
      firstName: null,
      lastName: null,
      photoUrl: null,
      isBlocked: true,
      userStatus: "soft_deleted",
      bannedReason: "Данные удалены админом",
      updatedAt: new Date(),
    }).where(eq(usersTable.telegramId, targetId));
    res.json({ ok: true, message: "Данные профиля очищены" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
