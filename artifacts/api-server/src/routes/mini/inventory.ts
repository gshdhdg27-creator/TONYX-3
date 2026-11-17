import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  miniNftInventoryTable,
  miniUserInventoryTable,
  systemSettingsTable,
  type NftCollections,
} from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  getNftCollection,
  NFT_COLLECTIONS,
  emptyPieces,
  isCollectionComplete,
} from "../../lib/nft-catalog.js";

const router: IRouter = Router();

function getTelegramId(res: Response): string | null {
  return (res.locals as Record<string, unknown>)["verifiedTelegramId"] as string | null;
}

function isListedMeta(m: Record<string, unknown>): boolean {
  const v = m.listed;
  if (v === true || v === 1 || v === "1" || v === "true" || v === "yes") return true;
  if (m.listedAt && m.priceTon != null && Number(m.priceTon) > 0) return true;
  return false;
}

function isListableType(itemType: string): boolean {
  const t = (itemType || "").toLowerCase();
  return t === "nft_full" || t === "nft" || t === "gift" || t === "tg_gift" || t.includes("nft");
}

async function ensureNftRow(telegramId: string) {
  let row = await db
    .select()
    .from(miniNftInventoryTable)
    .where(eq(miniNftInventoryTable.telegramId, telegramId))
    .then((r) => r[0] ?? null);
  if (!row) {
    await db.insert(miniNftInventoryTable).values({
      telegramId,
      fragments: {},
      assembled: [],
      collections: {},
    });
    row = await db
      .select()
      .from(miniNftInventoryTable)
      .where(eq(miniNftInventoryTable.telegramId, telegramId))
      .then((r) => r[0]!);
  }
  return row;
}

function buildCollections(progress: NftCollections | null | undefined) {
  const map = progress ?? {};
  return NFT_COLLECTIONS.map((cat) => {
    const prog = map[cat.id] ?? { pieces: emptyPieces(cat.piecesCount || 9), claimed: 0 };
    let pieces = Array.isArray(prog.pieces) ? [...prog.pieces] : emptyPieces(9);
    while (pieces.length < 9) pieces.push(0);
    pieces = pieces.slice(0, 9).map((p) => (p >= 1 ? 1 : 0));
    const owned = pieces.filter((p) => p >= 1).length;
    const canClaim = isCollectionComplete(pieces);
    return {
      id: cat.id,
      nameRu: cat.nameRu,
      nameEn: cat.nameEn,
      valueTon: cat.valueTon,
      rarity: cat.rarity,
      imageUrl: cat.imageUrl ?? null,
      pieces,
      owned,
      total: 9,
      canClaim,
      claimedTimes: Number(prog.claimed) || 0,
    };
  });
}

function mapInvItem(it: {
  id: number;
  itemType: string;
  itemId: string;
  quantity: number;
  acquiredAt: Date | string;
  meta: unknown;
}) {
  const m = (it.meta ?? {}) as Record<string, unknown>;
  const col = getNftCollection(it.itemId);
  const listed = isListedMeta(m);
  return {
    id: it.id,
    itemType: it.itemType,
    itemId: it.itemId,
    quantity: it.quantity,
    acquiredAt: it.acquiredAt,
    nameRu: (m.giftName as string) || col?.nameRu || it.itemId,
    nameEn: (m.tgBaseName as string) || col?.nameEn || it.itemId,
    valueTon: Number(m.priceTon) || col?.valueTon || 0,
    imageUrl: (m.imageUrl as string) || col?.imageUrl || null,
    modelImageUrl: (m.modelImageUrl as string) || null,
    symbolImageUrl: (m.symbolImageUrl as string) || null,
    patternImageUrl: (m.patternImageUrl as string) || null,
    rarity: col?.rarity ?? null,
    number: m.number != null ? Number(m.number) : null,
    model: (m.model as string) || null,
    backdrop: (m.backdrop as string) || null,
    symbol: (m.symbol as string) || null,
    backdropCenter: (m.backdropCenter as string) || null,
    backdropEdge: (m.backdropEdge as string) || null,
    ownedGiftId: (m.ownedGiftId as string) || null,
    realTgGift: Boolean(m.realTgGift),
    listed,
    listPriceTon: m.priceTon != null ? Number(m.priceTon) : null,
    meta: m,
  };
}

router.get("/", async (_req: Request, res: Response) => {
  try {
    const telegramId = getTelegramId(res);
    if (!telegramId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const [user, nftRow, allItems] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null),
      ensureNftRow(telegramId),
      db
        .select()
        .from(miniUserInventoryTable)
        .where(eq(miniUserInventoryTable.telegramId, telegramId))
        .orderBy(desc(miniUserInventoryTable.acquiredAt)),
    ]);

    const mapped = allItems.map(mapInvItem);
    const inventory = mapped.filter((x) => !x.listed);
    const listed = mapped.filter((x) => x.listed);
    const collections = buildCollections(nftRow.collections as NftCollections);

    res.json({
      balances: { ton: Number(user?.ton ?? 0), tonyx: Number(user?.tonyxCoins ?? 0) },
      inventory,
      listed,
      collections,
    });
  } catch (err) {
    console.error("[inventory]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/claim", async (req: Request, res: Response) => {
  try {
    const telegramId = getTelegramId(res);
    if (!telegramId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const nftId = String(req.body?.nftId ?? "").trim();
    if (!nftId) {
      res.status(400).json({ error: "nftId required" });
      return;
    }
    const cat = getNftCollection(nftId);
    if (!cat) {
      res.status(400).json({ error: "Unknown NFT collection" });
      return;
    }
    const nftRow = await ensureNftRow(telegramId);
    const collections: NftCollections = { ...((nftRow.collections as NftCollections) ?? {}) };
    const prog = collections[nftId] ?? { pieces: emptyPieces(9), claimed: 0 };
    let pieces = Array.isArray(prog.pieces) ? [...prog.pieces] : emptyPieces(9);
    while (pieces.length < 9) pieces.push(0);
    pieces = pieces.slice(0, 9);
    if (!isCollectionComplete(pieces)) {
      const owned = pieces.filter((p) => p >= 1).length;
      res.status(400).json({ error: "Collection incomplete", owned, total: 9 });
      return;
    }
    const [inserted] = await db
      .insert(miniUserInventoryTable)
      .values({
        telegramId,
        itemType: "nft_full",
        itemId: nftId,
        quantity: 1,
        meta: {
          source: "collection_claim",
          claimedAt: new Date().toISOString(),
          giftName: cat.nameRu,
          imageUrl: cat.imageUrl ?? null,
        },
      })
      .returning();
    const claimedTimes = (Number(prog.claimed) || 0) + 1;
    collections[nftId] = { pieces: emptyPieces(9), claimed: claimedTimes };
    const fragments = { ...(nftRow.fragments as Record<string, number>) };
    fragments[nftId] = 0;
    let assembled = Array.isArray(nftRow.assembled) ? [...nftRow.assembled] : [];
    if (!assembled.includes(nftId)) assembled.push(nftId);
    await db
      .update(miniNftInventoryTable)
      .set({ collections, fragments, assembled, updatedAt: new Date() })
      .where(eq(miniNftInventoryTable.telegramId, telegramId));
    const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null);
    const allItems = await db
      .select()
      .from(miniUserInventoryTable)
      .where(eq(miniUserInventoryTable.telegramId, telegramId))
      .orderBy(desc(miniUserInventoryTable.acquiredAt));
    const mapped = allItems.map(mapInvItem);
    res.json({
      ok: true,
      nftId,
      valueTon: cat.valueTon,
      nameRu: cat.nameRu,
      item: inserted
        ? {
            id: inserted.id,
            itemType: inserted.itemType,
            itemId: inserted.itemId,
            quantity: inserted.quantity,
            acquiredAt: inserted.acquiredAt,
            nameRu: cat.nameRu,
            nameEn: cat.nameEn,
            valueTon: cat.valueTon,
            imageUrl: cat.imageUrl ?? null,
            rarity: cat.rarity,
          }
        : null,
      inventory: mapped.filter((x) => !x.listed),
      collections: buildCollections(collections),
      balances: { ton: Number(user?.ton ?? 0), tonyx: Number(user?.tonyxCoins ?? 0) },
    });
  } catch (err) {
    console.error("[inventory/claim]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/listings", async (_req: Request, res: Response) => {
  try {
    try {
      const srows = await db.select().from(systemSettingsTable);
      const s: Record<string, string> = {};
      for (const r of srows) s[r.key] = r.value;
      if ((s["nft_market_enabled"] ?? "1") === "0") {
        res.json({ listings: [], buyEnabled: false, enabled: false });
        return;
      }
    } catch {
      /* */
    }
    const rows = await db.select().from(miniUserInventoryTable).orderBy(desc(miniUserInventoryTable.acquiredAt));
    const listings = [];
    for (const it of rows) {
      const m = (it.meta ?? {}) as Record<string, unknown>;
      if (!isListedMeta(m)) continue;
      const col = getNftCollection(it.itemId);
      const priceTon = Number(m.priceTon) || col?.valueTon || 0;
      listings.push({
        id: it.id,
        inventoryId: it.id,
        sellerId: it.telegramId,
        nftId: it.itemId,
        nameRu: (m.giftName as string) || col?.nameRu || it.itemId,
        nameEn: (m.tgBaseName as string) || col?.nameEn || it.itemId,
        imageUrl: (m.imageUrl as string) || col?.imageUrl || null,
        modelImageUrl: (m.modelImageUrl as string) || null,
        symbolImageUrl: (m.symbolImageUrl as string) || null,
        patternImageUrl: (m.patternImageUrl as string) || null,
        rarity: col?.rarity ?? null,
        number: m.number != null ? Number(m.number) : null,
        model: m.model ?? null,
        backdrop: m.backdrop ?? null,
        symbol: m.symbol ?? null,
        backdropCenter: (m.backdropCenter as string) || null,
        backdropEdge: (m.backdropEdge as string) || null,
        ownedGiftId: (m.ownedGiftId as string) || null,
        realTgGift: Boolean(m.realTgGift),
        priceTon,
        listedAt: m.listedAt ?? it.acquiredAt,
      });
    }
    let buyEnabled = false;
    try {
      const srows = await db.select().from(systemSettingsTable);
      const s: Record<string, string> = {};
      for (const r of srows) s[r.key] = r.value;
      buyEnabled = (s["nft_market_buy_enabled"] ?? "0") === "1";
    } catch {
      /* */
    }
    res.json({ listings, buyEnabled, enabled: true, count: listings.length });
  } catch (err) {
    console.error("[inventory/listings]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function listItem(req: Request, res: Response) {
  try {
    const telegramId = getTelegramId(res);
    if (!telegramId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const inventoryId = Number(req.body?.inventoryId);
    const priceTon = Number(req.body?.priceTon);
    if (!inventoryId || Number.isNaN(inventoryId)) {
      res.status(400).json({ error: "inventoryId required" });
      return;
    }
    if (!Number.isFinite(priceTon) || priceTon <= 0) {
      res.status(400).json({ error: "priceTon must be > 0" });
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
    if (!isListableType(item.itemType)) {
      res.status(400).json({ error: `Only NFT can be listed (got ${item.itemType})` });
      return;
    }
    const meta = { ...(item.meta ?? {}), listed: true, priceTon, listedAt: new Date().toISOString() };
    await db.update(miniUserInventoryTable).set({ meta }).where(eq(miniUserInventoryTable.id, item.id));
    res.json({ ok: true, inventoryId: item.id, priceTon, nftId: item.itemId, listed: true });
  } catch (err) {
    console.error("[inventory/list]", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

router.post("/list", listItem);
router.post("/sell", listItem);

router.post("/unlist", async (req: Request, res: Response) => {
  try {
    const telegramId = getTelegramId(res);
    if (!telegramId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const inventoryId = Number(req.body?.inventoryId);
    const item = await db
      .select()
      .from(miniUserInventoryTable)
      .where(and(eq(miniUserInventoryTable.id, inventoryId), eq(miniUserInventoryTable.telegramId, telegramId)))
      .then((r) => r[0] ?? null);
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    const meta = { ...(item.meta ?? {}) } as Record<string, unknown>;
    delete meta.listed;
    delete meta.priceTon;
    delete meta.listedAt;
    await db.update(miniUserInventoryTable).set({ meta }).where(eq(miniUserInventoryTable.id, item.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[inventory/unlist]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/buy", async (req: Request, res: Response) => {
  try {
    const telegramId = getTelegramId(res);
    if (!telegramId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const rows = await db.select().from(systemSettingsTable);
      const s: Record<string, string> = {};
      for (const r of rows) s[r.key] = r.value;
      if ((s["nft_market_enabled"] ?? "1") === "0") {
        res.status(403).json({ error: "NFT Market disabled by admin" });
        return;
      }
      if ((s["nft_market_buy_enabled"] ?? "0") !== "1") {
        res.status(403).json({ error: "NFT purchase disabled by admin" });
        return;
      }
    } catch {
      /* fail-open */
    }
    const inventoryId = Number(req.body?.inventoryId);
    if (!inventoryId || Number.isNaN(inventoryId)) {
      res.status(400).json({ error: "inventoryId required" });
      return;
    }
    const item = await db
      .select()
      .from(miniUserInventoryTable)
      .where(eq(miniUserInventoryTable.id, inventoryId))
      .then((r) => r[0] ?? null);
    if (!item) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }
    const m = (item.meta ?? {}) as Record<string, unknown>;
    if (!isListedMeta(m)) {
      res.status(400).json({ error: "Item is not listed" });
      return;
    }
    if (item.telegramId === telegramId) {
      res.status(400).json({ error: "Cannot buy your own NFT" });
      return;
    }
    const priceTon = Number(m.priceTon);
    if (!Number.isFinite(priceTon) || priceTon <= 0) {
      res.status(400).json({ error: "Invalid price" });
      return;
    }
    const FEE = 0.01;
    const feeTon = Math.round(priceTon * FEE * 1e8) / 1e8;
    const sellerGets = Math.round((priceTon - feeTon) * 1e8) / 1e8;
    const buyer = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null);
    if (!buyer) {
      res.status(404).json({ error: "Buyer not found" });
      return;
    }
    const buyerTon = Number(buyer.ton);
    if (buyerTon < priceTon) {
      res.status(400).json({ error: "Not enough TON", need: priceTon, have: buyerTon });
      return;
    }
    const seller = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, item.telegramId))
      .then((r) => r[0] ?? null);
    const newBuyerTon = Math.round((buyerTon - priceTon) * 1e8) / 1e8;
    const newSellerTon = seller ? Math.round((Number(seller.ton) + sellerGets) * 1e8) / 1e8 : null;
    const newMeta = {
      source: "p2p_buy",
      boughtAt: new Date().toISOString(),
      fromSeller: item.telegramId,
      paidTon: priceTon,
      feeTon,
      giftName: m.giftName,
      model: m.model,
      backdrop: m.backdrop,
      symbol: m.symbol,
      imageUrl: m.imageUrl,
      modelImageUrl: m.modelImageUrl,
      symbolImageUrl: m.symbolImageUrl,
      patternImageUrl: m.patternImageUrl,
      number: m.number,
      ownedGiftId: m.ownedGiftId,
      tgBaseName: m.tgBaseName,
      realTgGift: m.realTgGift,
      backdropCenter: m.backdropCenter,
      backdropEdge: m.backdropEdge,
    };
    await Promise.all([
      db.update(miniUserInventoryTable).set({ telegramId, meta: newMeta, acquiredAt: new Date() }).where(eq(miniUserInventoryTable.id, item.id)),
      db.update(usersTable).set({ ton: String(newBuyerTon), updatedAt: new Date() }).where(eq(usersTable.telegramId, telegramId)),
      seller && newSellerTon != null
        ? db.update(usersTable).set({ ton: String(newSellerTon), updatedAt: new Date() }).where(eq(usersTable.telegramId, item.telegramId))
        : Promise.resolve(),
    ]);
    res.json({
      ok: true,
      nftId: item.itemId,
      paidTon: priceTon,
      feeTon,
      sellerReceived: sellerGets,
      balances: { ton: newBuyerTon, tonyx: buyer.tonyxCoins },
    });
  } catch (err) {
    console.error("[inventory/buy]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
