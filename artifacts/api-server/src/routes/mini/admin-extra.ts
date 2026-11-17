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
      res.json({ ok: true, message: `TON: ${next}`, ton: next, currency: "ton" }); return;
    }
    if (currency === "coins") {
      const cur = Number(user.coins ?? 0);
      const next = Math.max(0, Math.floor(isSet ? amount : cur + amount * sign));
      await db.update(usersTable).set({ coins: next, updatedAt: new Date() }).where(eq(usersTable.telegramId, targetId));
      res.json({ ok: true, message: `Pts: ${next}`, coins: next, currency: "coins" }); return;
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
    };
    if (giftNumber != null && Number.isFinite(giftNumber)) { meta.giftNumber = giftNumber; meta.number = giftNumber; }
    if (list) { meta.listed = true; meta.priceTon = priceTon; meta.listedAt = new Date().toISOString(); }
    const itemId = giftNumber != null ? `${short}#${giftNumber}` : short;
    const inserted = await db.insert(miniUserInventoryTable).values({
      telegramId: targetId, itemType: "nft_full", itemId, quantity: 1, meta,
    }).returning();
    res.json({
      ok: true,
      message: list ? `listed ${priceTon} TON → ${targetId}` : `granted ${displayName} → ${targetId}`,
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
    if (!targetId || targetId === OWNER_ID) { res.status(400).json({ error: "invalid target" }); return; }
    const reason = String(req.body?.reason ?? "banned by admin");
    await db.update(usersTable).set({ isBlocked: true, bannedReason: reason, userStatus: "banned", updatedAt: new Date() }).where(eq(usersTable.telegramId, targetId));
    res.json({ ok: true, message: "banned" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/unban", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const targetId = normalizeId(req.params.telegramId);
    await db.update(usersTable).set({ isBlocked: false, bannedReason: null, userStatus: "active", updatedAt: new Date() }).where(eq(usersTable.telegramId, targetId));
    res.json({ ok: true, message: "unbanned" });
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
    const [user, invRows, nftRow, keyRows] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.telegramId, targetId)).then((r) => r[0] ?? null),
      db.select().from(miniUserInventoryTable).where(eq(miniUserInventoryTable.telegramId, targetId)).orderBy(desc(miniUserInventoryTable.acquiredAt)),
      db.select().from(miniNftInventoryTable).where(eq(miniNftInventoryTable.telegramId, targetId)).then((r) => r[0] ?? null),
      db.select().from(miniUserBossKeysTable).where(eq(miniUserBossKeysTable.telegramId, targetId)),
    ]);
    const inventory = invRows.map((it) => {
      const m = (it.meta ?? {}) as Record<string, unknown>;
      return {
        id: it.id, itemType: it.itemType, itemId: it.itemId, quantity: it.quantity, acquiredAt: it.acquiredAt,
        name: (m.giftName as string) || it.itemId, model: m.model ?? null, backdrop: m.backdrop ?? null,
        symbol: m.symbol ?? null, imageUrl: m.modelImageUrl || m.imageUrl || null,
        listed: Boolean(m.listed), priceTon: m.priceTon != null ? Number(m.priceTon) : null,
      };
    });
    const collections = NFT_COLLECTIONS.map((c) => {
      const prog = (nftRow?.collections as Record<string, { pieces?: number[]; claimed?: number }> | null)?.[c.id];
      let pieces = Array.isArray(prog?.pieces) ? [...prog!.pieces!] : emptyPieces(9);
      while (pieces.length < 9) pieces.push(0);
      pieces = pieces.slice(0, 9).map((p) => (p >= 1 ? 1 : 0));
      return {
        id: c.id, nameRu: c.nameRu, pieces, owned: pieces.filter((p) => p >= 1).length, total: 9,
        claimed: Number(prog?.claimed) || 0,
        fragmentsLegacy: Number((nftRow?.fragments as Record<string, number> | null)?.[c.id]) || 0,
      };
    });
    const keys = [1, 2, 3, 4, 5].map((level) => {
      const row = keyRows.find((k) => k.bossLevel === level);
      return { bossLevel: level, keysCount: row?.keysCount ?? 0 };
    });
    res.json({
      ok: true,
      user: user ? { telegramId: user.telegramId, ton: Number(user.ton ?? 0), tonyxCoins: user.tonyxCoins, coins: user.coins, isBlocked: user.isBlocked, userStatus: user.userStatus } : null,
      inventory, collections, keys,
    });
  } catch (e) {
    console.error("[admin/assets]", e);
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/inventory/remove", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const targetId = normalizeId(req.params.telegramId);
    const rawId = req.body?.inventoryId ?? req.body?.id ?? req.query.inventoryId;
    const inventoryId = typeof rawId === "string" ? parseInt(rawId, 10) : Number(rawId);
    if (!targetId || !Number.isFinite(inventoryId) || inventoryId <= 0) {
      res.status(400).json({ error: "telegramId + inventoryId required" }); return;
    }
    const item = await deleteInventoryItem(targetId, inventoryId);
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    res.json({ ok: true, message: `Удалено #${item.id}`, deletedId: item.id });
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
    if (!targetId || !Number.isFinite(inventoryId) || inventoryId <= 0) {
      res.status(400).json({ error: "telegramId + inventoryId required" }); return;
    }
    const item = await deleteInventoryItem(targetId, inventoryId);
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    res.json({ ok: true, message: `Удалено #${item.id}`, deletedId: item.id });
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
    if (!targetId || !itemId) { res.status(400).json({ error: "telegramId + itemId required" }); return; }
    const col = getNftCollection(itemId);
    await ensureUser(targetId);
    const [row] = await db.insert(miniUserInventoryTable).values({
      telegramId: targetId, itemType: "nft_full", itemId, quantity: 1,
      meta: { source: "admin_add", grantedBy: adminId, giftName: col?.nameRu ?? itemId, imageUrl: col?.imageUrl ?? null },
    }).returning();
    res.json({ ok: true, message: `NFT ${col?.nameRu ?? itemId} → ${targetId}`, item: row });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/fragments", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const targetId = normalizeId(req.params.telegramId);
    const nftId = String(req.body?.nftId ?? req.body?.collectionId ?? "").trim();
    if (!targetId || !nftId) { res.status(400).json({ error: "telegramId + nftId required" }); return; }
    if (!getNftCollection(nftId)) { res.status(400).json({ error: "Unknown collection" }); return; }
    let row = await db.select().from(miniNftInventoryTable).where(eq(miniNftInventoryTable.telegramId, targetId)).then((r) => r[0] ?? null);
    if (!row) {
      await db.insert(miniNftInventoryTable).values({ telegramId: targetId, fragments: {}, assembled: [], collections: {} });
      row = await db.select().from(miniNftInventoryTable).where(eq(miniNftInventoryTable.telegramId, targetId)).then((r) => r[0]!);
    }
    const collections = { ...((row.collections as Record<string, { pieces: number[]; claimed: number }>) ?? {}) };
    const cur = collections[nftId] ?? { pieces: emptyPieces(9), claimed: 0 };
    let pieces = Array.isArray(cur.pieces) ? [...cur.pieces] : emptyPieces(9);
    while (pieces.length < 9) pieces.push(0);
    pieces = pieces.slice(0, 9);
    if (req.body?.clear === true) pieces = emptyPieces(9);
    else if (req.body?.fill === true) pieces = Array.from({ length: 9 }, () => 1);
    else if (Array.isArray(req.body?.pieces)) {
      pieces = (req.body.pieces as unknown[]).slice(0, 9).map((p) => (Number(p) >= 1 ? 1 : 0));
      while (pieces.length < 9) pieces.push(0);
    } else if (req.body?.pieceIndex != null) {
      const idx = Number(req.body.pieceIndex);
      if (idx < 0 || idx > 8) { res.status(400).json({ error: "pieceIndex 0..8" }); return; }
      pieces[idx] = req.body.set != null ? (Number(req.body.set) >= 1 ? 1 : 0) : pieces[idx] ? 0 : 1;
    }
    collections[nftId] = { pieces, claimed: Number(cur.claimed) || 0 };
    const fragments = { ...((row.fragments as Record<string, number>) ?? {}) };
    fragments[nftId] = pieces.filter((p) => p >= 1).length;
    await db.update(miniNftInventoryTable).set({ collections, fragments, updatedAt: new Date() }).where(eq(miniNftInventoryTable.telegramId, targetId));
    res.json({ ok: true, message: `Фрагменты ${nftId}: ${fragments[nftId]}/9`, pieces, owned: fragments[nftId] });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/users/:telegramId/keys", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const targetId = normalizeId(req.params.telegramId);
    const bossLevel = Number(req.body?.bossLevel ?? req.body?.level);
    const action = String(req.body?.action ?? "add").toLowerCase();
    const amount = Number(req.body?.amount ?? 1);
    if (!targetId || ![1, 2, 3, 4, 5].includes(bossLevel)) {
      res.status(400).json({ error: "telegramId + bossLevel 1..5 required" }); return;
    }
    await ensureUser(targetId);
    const existing = await db.select().from(miniUserBossKeysTable).where(and(eq(miniUserBossKeysTable.telegramId, targetId), eq(miniUserBossKeysTable.bossLevel, bossLevel))).then((r) => r[0] ?? null);
    const cur = existing?.keysCount ?? 0;
    let next = cur;
    if (action === "set") next = Math.max(0, Math.floor(amount));
    else if (action === "sub" || action === "subtract") next = Math.max(0, cur - Math.floor(amount));
    else next = cur + Math.floor(amount);
    if (existing) {
      await db.update(miniUserBossKeysTable).set({ keysCount: next }).where(eq(miniUserBossKeysTable.id, existing.id));
    } else {
      await db.insert(miniUserBossKeysTable).values({ telegramId: targetId, bossLevel, keysCount: next });
    }
    res.json({ ok: true, message: `Ключи L${bossLevel}: ${next}`, bossLevel, keysCount: next });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
