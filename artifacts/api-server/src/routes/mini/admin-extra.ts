import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, systemSettingsTable, miniUserInventoryTable, miniNftInventoryTable, miniUserBossKeysTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { NFT_COLLECTIONS, emptyPieces, getNftCollection } from "../../lib/nft-catalog.js";

const router: IRouter = Router();
const OWNER_ID = "7257793582";

function normalizeId(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).trim();
}
function extractAdminId(req: import("express").Request, res: import("express").Response): string {
  const verified = normalizeId((res.locals as Record<string, unknown>)["verifiedTelegramId"]);
  if (verified) return verified;
  return normalizeId(req.query.adminId ?? req.body?.adminId ?? req.headers["x-admin-id"]);
}

async function ensureUser(telegramId: string) {
  let user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null);
  if (user) return user;
  await db.insert(usersTable).values({ telegramId, ton: "0", tonyxCoins: 0, coins: 0 });
  user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null);
  return user;
}

async function deleteInventoryItem(targetId: string, inventoryId: number) {
  let item = await db
    .select()
    .from(miniUserInventoryTable)
    .where(and(eq(miniUserInventoryTable.id, inventoryId), eq(miniUserInventoryTable.telegramId, targetId)))
    .then((r) => r[0] ?? null);
  if (!item) {
    item = await db.select().from(miniUserInventoryTable).where(eq(miniUserInventoryTable.id, inventoryId)).then((r) => r[0] ?? null);
  }
  if (!item) return null;
  await db.delete(miniUserInventoryTable).where(eq(miniUserInventoryTable.id, item.id));
  return item;
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
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
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
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const targetId = normalizeId(req.params.telegramId);
    if (!targetId) { res.status(400).json({ error: "telegramId required" }); return; }
    const currency = String(req.body?.currency ?? "").toLowerCase();
    const action = String(req.body?.action ?? "add").toLowerCase();
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount < 0) { res.status(400).json({ error: "amount >= 0" }); return; }
    if (action !== "set" && amount <= 0) { res.status(400).json({ error: "amount > 0" }); return; }
    if (currency !== "ton" && currency !== "tonyx" && currency !== "coins") {
      res.status(400).json({ error: "currency: ton | tonyx | coins" }); return;
    }
    const isSet = action === "set";
    const sign = action === "sub" || action === "subtract" || action === "remove" || action === "deduct" ? -1 : 1;
    const user = await ensureUser(targetId);
    if (!user) { res.status(500).json({ error: "failed to ensure user" }); return; }
    if (currency === "ton") {
      const cur = Number(user.ton ?? 0);
      const next = Math.max(0, Math.round((isSet ? amount : cur + amount * sign) * 1e8) / 1e8);
      await db.update(usersTable).set({ ton: String(next), updatedAt: new Date() }).where(eq(usersTable.telegramId, targetId));
      res.json({ ok: true, telegramId: targetId, currency: "ton", ton: next });
    } else if (currency === "tonyx") {
      const cur = Number(user.tonyxCoins ?? 0);
      const next = Math.max(0, Math.floor(isSet ? amount : cur + amount * sign));
      await db.update(usersTable).set({ tonyxCoins: next, updatedAt: new Date() }).where(eq(usersTable.telegramId, targetId));
      res.json({ ok: true, telegramId: targetId, currency: "tonyx", tonyxCoins: next });
    } else {
      const cur = Number(user.coins ?? 0);
      const next = Math.max(0, Math.floor(isSet ? amount : cur + amount * sign));
      await db.update(usersTable).set({ coins: next, updatedAt: new Date() }).where(eq(usersTable.telegramId, targetId));
      res.json({ ok: true, telegramId: targetId, currency: "coins", coins: next });
    }
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/grant-gift", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const targetId = normalizeId(req.params.telegramId);
    if (!targetId) { res.status(400).json({ error: "telegramId required" }); return; }
    const short = String(req.body?.short ?? req.body?.itemId ?? "").trim();
    const giftName = String(req.body?.giftName ?? short).trim();
    const model = String(req.body?.model ?? "").trim();
    const backdrop = String(req.body?.backdrop ?? "").trim();
    const symbol = String(req.body?.symbol ?? "").trim();
    const imageUrl = req.body?.imageUrl ? String(req.body.imageUrl) : null;
    const modelImageUrl = req.body?.modelImageUrl ? String(req.body.modelImageUrl) : null;
    const symbolImageUrl = req.body?.symbolImageUrl ? String(req.body.symbolImageUrl) : null;
    const patternImageUrl = req.body?.patternImageUrl ? String(req.body.patternImageUrl) : null;
    const backdropCenter = req.body?.backdropCenter ? String(req.body.backdropCenter) : null;
    const backdropEdge = req.body?.backdropEdge ? String(req.body.backdropEdge) : null;
    const giftNumberRaw = req.body?.giftNumber ?? req.body?.number ?? null;
    const giftNumber = giftNumberRaw != null && String(giftNumberRaw).trim() !== ""
      ? Number(String(giftNumberRaw).replace(/[^0-9]/g, "")) : null;
    const list = Boolean(req.body?.list);
    const priceTon = Number(req.body?.priceTon);
    const valueTonRaw = Number(req.body?.valueTon ?? req.body?.estimatedTon);
    const valueTon = Number.isFinite(valueTonRaw) && valueTonRaw > 0 ? valueTonRaw
      : (Number.isFinite(priceTon) && priceTon > 0 ? priceTon : 0);
    if (!short || !model || !backdrop || !symbol) {
      res.status(400).json({ error: "short, model, backdrop, symbol required" }); return;
    }
    if (list && (!Number.isFinite(priceTon) || priceTon <= 0)) {
      res.status(400).json({ error: "priceTon > 0 required when listing" }); return;
    }
    const user = await ensureUser(targetId);
    if (!user) { res.status(500).json({ error: "failed to ensure user" }); return; }
    const displayName = giftNumber != null && Number.isFinite(giftNumber) ? `${giftName} #${giftNumber}` : giftName;
    const meta: Record<string, unknown> = {
      source: "admin_grant", grantedBy: adminId, grantedAt: new Date().toISOString(),
      giftName: displayName, collectionName: giftName, short, model, backdrop, symbol,
      imageUrl: modelImageUrl || imageUrl, modelImageUrl: modelImageUrl || imageUrl,
      symbolImageUrl, patternImageUrl, backdropCenter, backdropEdge, tgBaseName: giftName,
      kind: "tg_gift", real: true,
      valueTon: (Number.isFinite(valueTon) && valueTon > 0 ? valueTon : (Number.isFinite(priceTon) && priceTon > 0 ? priceTon : 0)),
    };
    if (giftNumber != null && Number.isFinite(giftNumber) && giftNumber > 0) {
      meta.giftNumber = giftNumber; meta.number = giftNumber;
    }
    if (list) {
      meta.listed = true; meta.priceTon = priceTon; meta.listedAt = new Date().toISOString();
      if (!meta.valueTon || Number(meta.valueTon) <= 0) meta.valueTon = priceTon;
    }
    const inserted = await db.insert(miniUserInventoryTable).values({
      telegramId: targetId, itemType: "nft_full", itemId: short, quantity: 1, meta,
    }).returning();
    console.log(`[Admin] ${adminId} grant-gift → ${targetId} ${short} / ${model} / ${backdrop} / ${symbol} list=${list}`);
    res.json({
      ok: true,
      message: list ? `NFT выдан и выставлен на маркет за ${priceTon} TON` : `NFT выдан пользователю ${targetId}`,
      item: inserted[0] ?? null, inventoryId: inserted[0]?.id ?? null,
    });
  } catch (e) {
    console.error("[grant-gift]", e);
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/ban", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const targetId = normalizeId(req.params.telegramId);
    if (!targetId) { res.status(400).json({ error: "telegramId required" }); return; }
    await db.update(usersTable).set({ isBanned: true, updatedAt: new Date() } as any).where(eq(usersTable.telegramId, targetId));
    res.json({ ok: true, telegramId: targetId, banned: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/unban", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const targetId = normalizeId(req.params.telegramId);
    if (!targetId) { res.status(400).json({ error: "telegramId required" }); return; }
    await db.update(usersTable).set({ isBanned: false, updatedAt: new Date() } as any).where(eq(usersTable.telegramId, targetId));
    res.json({ ok: true, telegramId: targetId, banned: false });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/users/:telegramId/assets", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const targetId = normalizeId(req.params.telegramId);
    if (!targetId) { res.status(400).json({ error: "telegramId required" }); return; }
    const items = await db.select().from(miniUserInventoryTable).where(eq(miniUserInventoryTable.telegramId, targetId)).orderBy(desc(miniUserInventoryTable.acquiredAt));
    const mapped = items.map((it) => {
      const m = (it.meta ?? {}) as Record<string, unknown>;
      return {
        id: it.id, itemType: it.itemType, itemId: it.itemId, quantity: it.quantity, acquiredAt: it.acquiredAt,
        giftName: m.giftName, model: m.model, backdrop: m.backdrop, symbol: m.symbol,
        imageUrl: m.modelImageUrl ?? m.imageUrl ?? null, modelImageUrl: m.modelImageUrl ?? null,
        symbolImageUrl: m.symbolImageUrl ?? null, patternImageUrl: m.patternImageUrl ?? null,
        backdropCenter: m.backdropCenter ?? null, backdropEdge: m.backdropEdge ?? null,
        number: m.giftNumber ?? m.number ?? null, kind: m.kind ?? null, listed: Boolean(m.listed),
        priceTon: m.priceTon != null ? Number(m.priceTon) : null, valueTon: m.valueTon != null ? Number(m.valueTon) : null,
        meta: m,
      };
    });
    res.json({ telegramId: targetId, items: mapped, count: mapped.length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/inventory/remove", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const targetId = normalizeId(req.params.telegramId);
    const inventoryId = Number(req.body?.inventoryId ?? req.body?.id);
    if (!targetId || !inventoryId) { res.status(400).json({ error: "telegramId and inventoryId required" }); return; }
    const item = await deleteInventoryItem(targetId, inventoryId);
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    res.json({ ok: true, removed: item.id });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/remove-item", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const targetId = normalizeId(req.params.telegramId);
    const inventoryId = Number(req.body?.inventoryId ?? req.body?.id);
    if (!targetId || !inventoryId) { res.status(400).json({ error: "telegramId and inventoryId required" }); return; }
    const item = await deleteInventoryItem(targetId, inventoryId);
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    res.json({ ok: true, removed: item.id });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/inventory/add", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const targetId = normalizeId(req.params.telegramId);
    const itemId = String(req.body?.itemId ?? req.body?.nftId ?? "").trim();
    if (!targetId || !itemId) { res.status(400).json({ error: "telegramId and itemId required" }); return; }
    const col = getNftCollection(itemId);
    const meta = {
      source: "admin_add", grantedBy: adminId, grantedAt: new Date().toISOString(),
      giftName: col?.nameRu ?? itemId, imageUrl: col?.imageUrl ?? null, valueTon: col?.valueTon ?? 0,
    };
    const inserted = await db.insert(miniUserInventoryTable).values({
      telegramId: targetId, itemType: "nft_full", itemId, quantity: 1, meta,
    }).returning();
    res.json({ ok: true, item: inserted[0] ?? null });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/fragments", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const targetId = normalizeId(req.params.telegramId);
    const nftId = String(req.body?.nftId ?? "").trim();
    const piece = Number(req.body?.piece ?? req.body?.index);
    if (!targetId || !nftId) { res.status(400).json({ error: "telegramId and nftId required" }); return; }
    let row = await db.select().from(miniNftInventoryTable).where(eq(miniNftInventoryTable.telegramId, targetId)).then((r) => r[0] ?? null);
    if (!row) {
      await db.insert(miniNftInventoryTable).values({ telegramId: targetId, fragments: {}, assembled: [], collections: {} });
      row = await db.select().from(miniNftInventoryTable).where(eq(miniNftInventoryTable.telegramId, targetId)).then((r) => r[0]!);
    }
    const collections = { ...((row.collections as any) ?? {}) };
    const prog = collections[nftId] ?? { pieces: emptyPieces(9), claimed: 0 };
    let pieces = Array.isArray(prog.pieces) ? [...prog.pieces] : emptyPieces(9);
    while (pieces.length < 9) pieces.push(0);
    if (Number.isFinite(piece) && piece >= 0 && piece < 9) {
      pieces[piece] = 1;
    } else {
      pieces = pieces.map(() => 1);
    }
    collections[nftId] = { pieces, claimed: Number(prog.claimed) || 0 };
    await db.update(miniNftInventoryTable).set({ collections, updatedAt: new Date() }).where(eq(miniNftInventoryTable.telegramId, targetId));
    res.json({ ok: true, nftId, pieces });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/keys", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const targetId = normalizeId(req.params.telegramId);
    const bossLevel = Number(req.body?.bossLevel ?? req.body?.level ?? 1);
    const keys = Number(req.body?.keys ?? req.body?.count ?? 1);
    if (!targetId || !Number.isFinite(bossLevel)) { res.status(400).json({ error: "telegramId and bossLevel required" }); return; }
    const existing = await db.select().from(miniUserBossKeysTable).where(and(eq(miniUserBossKeysTable.telegramId, targetId), eq(miniUserBossKeysTable.bossLevel, bossLevel))).then((r) => r[0] ?? null);
    const next = Math.max(0, (existing?.keysCount ?? 0) + (Number.isFinite(keys) ? keys : 1));
    if (existing) {
      await db.update(miniUserBossKeysTable).set({ keysCount: next }).where(and(eq(miniUserBossKeysTable.telegramId, targetId), eq(miniUserBossKeysTable.bossLevel, bossLevel)));
    } else {
      await db.insert(miniUserBossKeysTable).values({ telegramId: targetId, bossLevel, keysCount: next });
    }
    res.json({ ok: true, message: `Ключи L${bossLevel}: ${next}`, bossLevel, keysCount: next });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
