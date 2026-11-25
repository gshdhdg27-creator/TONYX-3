import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniUserInventoryTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";
import { NFT_COLLECTIONS, getNftCollection } from "../../lib/nft-catalog.js";
import { randomBytes } from "crypto";

const router: IRouter = Router();

/** House edge baked into chance (5%) */
const HOUSE = 0.05;
const CHANCE_MIN = 1;
const CHANCE_MAX = 85;

function isListedMeta(m: Record<string, unknown>): boolean {
  const v = m.listed;
  if (v === true || v === 1 || v === "1" || v === "true" || v === "yes") return true;
  if (m.listedAt && m.priceTon != null && Number(m.priceTon) > 0) return true;
  return false;
}

function isUpgradeableType(itemType: string): boolean {
  const t = (itemType || "").toLowerCase();
  return t === "nft_full" || t === "nft" || t === "gift" || t === "tg_gift" || t.includes("nft");
}

function itemValue(meta: Record<string, unknown>, itemId: string): number {
  const col = getNftCollection(itemId);
  const v =
    Number(meta.valueTon) ||
    Number(meta.estimatedTon) ||
    Number(meta.priceTon) ||
    col?.valueTon ||
    0;
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function calcChance(fromValue: number, toValue: number): number {
  if (toValue <= 0 || fromValue <= 0) return CHANCE_MIN;
  const raw = (fromValue / toValue) * (1 - HOUSE) * 100;
  return Math.max(CHANCE_MIN, Math.min(CHANCE_MAX, Math.round(raw * 100) / 100));
}

function mapItem(it: {
  id: number;
  itemType: string;
  itemId: string;
  quantity: number;
  acquiredAt: Date | string;
  meta: unknown;
}) {
  const m = (it.meta ?? {}) as Record<string, unknown>;
  const col = getNftCollection(it.itemId);
  const valueTon = itemValue(m, it.itemId);
  return {
    id: it.id,
    itemType: it.itemType,
    itemId: it.itemId,
    quantity: it.quantity,
    nameRu: (m.giftName as string) || col?.nameRu || it.itemId,
    nameEn: (m.collectionName as string) || col?.nameEn || it.itemId,
    valueTon,
    imageUrl: (m.modelImageUrl as string) || (m.imageUrl as string) || col?.imageUrl || null,
    rarity: col?.rarity ?? null,
    model: (m.model as string) || null,
    backdrop: (m.backdrop as string) || null,
    symbol: (m.symbol as string) || null,
  };
}

/** GET /info */
router.get("/info", (_req, res) => {
  res.json({
    houseEdge: HOUSE,
    chanceMin: CHANCE_MIN,
    chanceMax: CHANCE_MAX,
    mode: "item_to_item",
  });
});

/**
 * GET /targets
 * Catalog of upgrade targets (NFT collections), sorted by value asc.
 */
router.get("/targets", async (_req, res) => {
  try {
    if (!(await isGameEnabled("upgrade"))) {
      res.status(403).json({ error: GAME_DISABLED_MESSAGE });
      return;
    }
    const targets = NFT_COLLECTIONS.map((c) => ({
      id: c.id,
      nameRu: c.nameRu,
      nameEn: c.nameEn,
      valueTon: c.valueTon,
      rarity: c.rarity,
      imageUrl: c.imageUrl ?? null,
    })).sort((a, b) => a.valueTon - b.valueTon);
    res.json({ targets, houseEdge: HOUSE });
  } catch (e: any) {
    console.error("[upgrade/targets]", e);
    res.status(500).json({ error: e?.message ?? "Failed" });
  }
});

/**
 * GET /my-items?telegramId=
 * User's upgradeable inventory (not listed).
 */
router.get("/my-items", async (req, res) => {
  try {
    if (!(await isGameEnabled("upgrade"))) {
      res.status(403).json({ error: GAME_DISABLED_MESSAGE });
      return;
    }
    const telegramId = String(req.query.telegramId ?? req.body?.telegramId ?? "");
    if (!telegramId) {
      res.status(400).json({ error: "telegramId required" });
      return;
    }
    const rows = await db
      .select()
      .from(miniUserInventoryTable)
      .where(eq(miniUserInventoryTable.telegramId, telegramId))
      .orderBy(desc(miniUserInventoryTable.acquiredAt));

    const items = rows
      .filter((it) => isUpgradeableType(it.itemType) && !isListedMeta((it.meta ?? {}) as Record<string, unknown>))
      .map(mapItem)
      .filter((x) => x.valueTon > 0);

    res.json({ items });
  } catch (e: any) {
    console.error("[upgrade/my-items]", e);
    res.status(500).json({ error: e?.message ?? "Failed" });
  }
});

/**
 * POST /preview
 * body: { inventoryId, targetId, telegramId }
 * Returns chance / mult without playing.
 */
router.post("/preview", async (req, res) => {
  try {
    const telegramId = String(req.body?.telegramId ?? "");
    const inventoryId = Number(req.body?.inventoryId);
    const targetId = String(req.body?.targetId ?? "").trim();

    if (!telegramId || !inventoryId || !targetId) {
      res.status(400).json({ error: "telegramId, inventoryId, targetId required" });
      return;
    }

    const target = getNftCollection(targetId);
    if (!target) {
      res.status(400).json({ error: "Unknown target" });
      return;
    }

    const item = await db
      .select()
      .from(miniUserInventoryTable)
      .where(and(eq(miniUserInventoryTable.id, inventoryId), eq(miniUserInventoryTable.telegramId, telegramId)))
      .then((r) => r[0] ?? null);

    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    if (!isUpgradeableType(item.itemType) || isListedMeta((item.meta ?? {}) as Record<string, unknown>)) {
      res.status(400).json({ error: "Item cannot be upgraded" });
      return;
    }

    const fromValue = itemValue((item.meta ?? {}) as Record<string, unknown>, item.itemId);
    const toValue = target.valueTon;
    if (toValue <= fromValue) {
      res.status(400).json({ error: "Target must be more expensive than your item" });
      return;
    }

    const chance = calcChance(fromValue, toValue);
    const mult = Math.round((toValue / fromValue) * 1000) / 1000;

    res.json({
      fromValue,
      toValue,
      chance,
      multiplier: mult,
      houseEdge: HOUSE,
    });
  } catch (e: any) {
    console.error("[upgrade/preview]", e);
    res.status(500).json({ error: e?.message ?? "Failed" });
  }
});

/**
 * POST /play
 * body: { telegramId, inventoryId, targetId }
 *
 * Item → more expensive catalog NFT.
 * chance = (fromValue / toValue) * (1 - HOUSE) * 100, clamped 1..85
 * Win  → source deleted, target minted into inventory
 * Lose → source deleted (burned)
 */
router.post("/play", async (req, res) => {
  try {
    if (!(await isGameEnabled("upgrade"))) {
      res.status(403).json({ error: GAME_DISABLED_MESSAGE });
      return;
    }

    const telegramId = String(req.body?.telegramId ?? "");
    const inventoryId = Number(req.body?.inventoryId);
    const targetId = String(req.body?.targetId ?? "").trim();

    if (!telegramId) {
      res.status(400).json({ error: "telegramId required" });
      return;
    }
    if (!inventoryId || Number.isNaN(inventoryId)) {
      res.status(400).json({ error: "inventoryId required" });
      return;
    }
    if (!targetId) {
      res.status(400).json({ error: "targetId required" });
      return;
    }

    const target = getNftCollection(targetId);
    if (!target) {
      res.status(400).json({ error: "Unknown target NFT" });
      return;
    }

    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .then((r) => r[0] ?? null);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const item = await db
      .select()
      .from(miniUserInventoryTable)
      .where(and(eq(miniUserInventoryTable.id, inventoryId), eq(miniUserInventoryTable.telegramId, telegramId)))
      .then((r) => r[0] ?? null);

    if (!item) {
      res.status(404).json({ error: "Item not found in your inventory" });
      return;
    }
    if (!isUpgradeableType(item.itemType)) {
      res.status(400).json({ error: "This item type cannot be upgraded" });
      return;
    }
    const meta = (item.meta ?? {}) as Record<string, unknown>;
    if (isListedMeta(meta)) {
      res.status(400).json({ error: "Unlist the item from market first" });
      return;
    }

    const fromValue = itemValue(meta, item.itemId);
    const toValue = target.valueTon;
    if (fromValue <= 0) {
      res.status(400).json({ error: "Item has no value" });
      return;
    }
    if (toValue <= fromValue) {
      res.status(400).json({ error: "Target must be more expensive than your item" });
      return;
    }

    const chance = calcChance(fromValue, toValue);
    const mult = Math.round((toValue / fromValue) * 1000) / 1000;

    // Burn source first (lock)
    await db.delete(miniUserInventoryTable).where(eq(miniUserInventoryTable.id, item.id));

    const roll = randomBytes(2).readUInt16BE(0) / 65536; // 0..1
    let won = roll * 100 < chance;
    if (user.forceWin) won = true;

    let newItem: ReturnType<typeof mapItem> | null = null;

    if (won) {
      const [inserted] = await db
        .insert(miniUserInventoryTable)
        .values({
          telegramId,
          itemType: "nft_full",
          itemId: target.id,
          quantity: 1,
          meta: {
            source: "upgrade_win",
            upgradedFrom: item.itemId,
            upgradedFromId: inventoryId,
            fromValue,
            toValue,
            chance,
            giftName: target.nameRu,
            imageUrl: target.imageUrl ?? null,
            valueTon: target.valueTon,
            upgradedAt: new Date().toISOString(),
          },
        })
        .returning();

      if (inserted) {
        newItem = mapItem(inserted);
      }

      await db
        .update(usersTable)
        .set({
          wins: (user.wins ?? 0) + 1,
          totalGamesPlayed: (user.totalGamesPlayed ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.telegramId, telegramId));
    } else {
      await db
        .update(usersTable)
        .set({
          losses: (user.losses ?? 0) + 1,
          totalGamesPlayed: (user.totalGamesPlayed ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.telegramId, telegramId));
    }

    res.json({
      ok: true,
      won,
      roll: Math.round(roll * 10000) / 100,
      chance,
      multiplier: mult,
      fromValue,
      toValue,
      source: {
        id: inventoryId,
        itemId: item.itemId,
        nameRu: (meta.giftName as string) || getNftCollection(item.itemId)?.nameRu || item.itemId,
        valueTon: fromValue,
      },
      target: {
        id: target.id,
        nameRu: target.nameRu,
        valueTon: target.valueTon,
        imageUrl: target.imageUrl ?? null,
        rarity: target.rarity,
      },
      newItem,
    });
  } catch (e: any) {
    console.error("[upgrade/play]", e);
    res.status(500).json({ error: e?.message ?? "Upgrade failed" });
  }
});

export default router;
