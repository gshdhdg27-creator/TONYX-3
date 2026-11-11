import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  miniNftInventoryTable,
  miniUserInventoryTable,
  type NftCollections,
} from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  NFT_COLLECTIONS,
  getNftCollection,
  emptyPieces,
  isCollectionComplete,
} from "../../lib/nft-catalog.js";

const router: IRouter = Router();

function getTelegramId(res: Response): string | null {
  return (res.locals as Record<string, unknown>)["verifiedTelegramId"] as string | null;
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

/** GET /api/mini/inventory — inventory + collection progress */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const telegramId = getTelegramId(res);
    if (!telegramId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [user, nftRow, items] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null),
      ensureNftRow(telegramId),
      db
        .select()
        .from(miniUserInventoryTable)
        .where(eq(miniUserInventoryTable.telegramId, telegramId))
        .orderBy(desc(miniUserInventoryTable.acquiredAt)),
    ]);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const collections = (nftRow.collections ?? {}) as NftCollections;

    const collectionList = NFT_COLLECTIONS.map((c) => {
      const prog = collections[c.id] ?? { pieces: emptyPieces(9), claimed: 0 };
      const pieces = [...prog.pieces];
      while (pieces.length < 9) pieces.push(0);
      const owned = pieces.filter((p) => p >= 1).length;
      return {
        id: c.id,
        nameRu: c.nameRu,
        nameEn: c.nameEn,
        valueTon: c.valueTon,
        rarity: c.rarity,
        imageUrl: c.imageUrl ?? null,
        pieces,
        owned,
        total: 9,
        canClaim: isCollectionComplete(pieces),
        claimedTimes: prog.claimed,
      };
    });

    const allItems = items.map((it) => {
      const col = it.itemType === "nft_full" ? getNftCollection(it.itemId) : undefined;
      const m = (it.meta ?? {}) as Record<string, unknown>;
      return {
        id: it.id,
        itemType: it.itemType,
        itemId: it.itemId,
        quantity: it.quantity,
        acquiredAt: it.acquiredAt,
        nameRu: col?.nameRu ?? it.itemId,
        nameEn: col?.nameEn ?? it.itemId,
        valueTon: col?.valueTon ?? 0,
        imageUrl: col?.imageUrl ?? null,
        rarity: col?.rarity ?? null,
        listed: Boolean(m.listed),
        listPriceTon: m.priceTon != null ? Number(m.priceTon) : null,
      };
    });
    const inventory = allItems.filter((x) => !x.listed);
    const listed = allItems.filter((x) => x.listed);

    res.json({
      balances: { ton: Number(user.ton), tonyx: user.tonyxCoins },
      collections: collectionList,
      inventory,
      listed,
    });
  } catch (err) {
    console.error("[inventory GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /api/mini/inventory/claim  body: { nftId } — assemble 9/9 → inventory */
router.post("/claim", async (req: Request, res: Response) => {
  try {
    const telegramId = getTelegramId(res);
    if (!telegramId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const nftId = String(req.body?.nftId ?? "").trim();
    const colMeta = getNftCollection(nftId);
    if (!colMeta) {
      res.status(400).json({ error: "Unknown NFT" });
      return;
    }

    const nftRow = await ensureNftRow(telegramId);
    const collections: NftCollections = { ...(nftRow.collections ?? {}) };
    const prog = collections[nftId] ?? { pieces: emptyPieces(9), claimed: 0 };
    const pieces = [...prog.pieces];
    while (pieces.length < 9) pieces.push(0);

    if (!isCollectionComplete(pieces)) {
      res.status(400).json({
        error: "Collection incomplete",
        owned: pieces.filter((p) => p >= 1).length,
        need: 9,
      });
      return;
    }

    collections[nftId] = {
      pieces: emptyPieces(9),
      claimed: (prog.claimed ?? 0) + 1,
    };

    const fragments = { ...(nftRow.fragments ?? {}) };
    fragments[nftId] = 0;

    const assembled = [...(nftRow.assembled ?? [])];
    if (!assembled.includes(nftId)) assembled.push(nftId);

    await Promise.all([
      db.insert(miniUserInventoryTable).values({
        telegramId,
        itemType: "nft_full",
        itemId: nftId,
        quantity: 1,
        meta: { source: "claim", claimedAt: new Date().toISOString() },
      }),
      db
        .update(miniNftInventoryTable)
        .set({
          collections,
          fragments,
          assembled,
          updatedAt: new Date(),
        })
        .where(eq(miniNftInventoryTable.telegramId, telegramId)),
    ]);

    console.log(`[inventory/claim] ${telegramId} nft=${nftId}`);

    const items = await db
      .select()
      .from(miniUserInventoryTable)
      .where(eq(miniUserInventoryTable.telegramId, telegramId))
      .orderBy(desc(miniUserInventoryTable.acquiredAt));

    const inventory = items.map((it) => {
      const meta = getNftCollection(it.itemId);
      const m = (it.meta ?? {}) as Record<string, unknown>;
      return {
        id: it.id,
        itemType: it.itemType,
        itemId: it.itemId,
        quantity: it.quantity,
        acquiredAt: it.acquiredAt,
        nameRu: meta?.nameRu ?? it.itemId,
        nameEn: meta?.nameEn ?? it.itemId,
        valueTon: meta?.valueTon ?? 0,
        imageUrl: meta?.imageUrl ?? null,
        rarity: meta?.rarity ?? null,
        listed: Boolean(m.listed),
        listPriceTon: m.priceTon != null ? Number(m.priceTon) : null,
      };
    }).filter((x) => !x.listed);

    const newest = inventory.find((x) => x.itemId === nftId) ?? inventory[0] ?? null;

    res.json({
      ok: true,
      nftId,
      valueTon: colMeta.valueTon,
      nameRu: colMeta.nameRu,
      item: newest,
      inventory,
      collections: NFT_COLLECTIONS.map((c) => {
        const prog2 = collections[c.id] ?? { pieces: emptyPieces(9), claimed: 0 };
        const pcs = [...(prog2.pieces ?? [])];
        while (pcs.length < 9) pcs.push(0);
        const o = pcs.filter((p) => p >= 1).length;
        return {
          id: c.id,
          nameRu: c.nameRu,
          nameEn: c.nameEn,
          valueTon: c.valueTon,
          rarity: c.rarity,
          imageUrl: c.imageUrl ?? null,
          pieces: pcs,
          owned: o,
          total: 9,
          canClaim: isCollectionComplete(pcs),
          claimedTimes: prog2.claimed ?? 0,
        };
      }),
    });
  } catch (err) {
    console.error("[inventory/claim]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/list", async (req: Request, res: Response) => {
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
      .where(
        and(
          eq(miniUserInventoryTable.id, inventoryId),
          eq(miniUserInventoryTable.telegramId, telegramId),
        ),
      )
      .then((r) => r[0] ?? null);

    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    if (item.itemType !== "nft_full") {
      res.status(400).json({ error: "Only NFT can be listed" });
      return;
    }

    const meta = { ...(item.meta ?? {}), listed: true, priceTon, listedAt: new Date().toISOString() };
    await db.update(miniUserInventoryTable).set({ meta }).where(eq(miniUserInventoryTable.id, item.id));

    console.log(`[inventory/list] ${telegramId} item=${item.id} nft=${item.itemId} price=${priceTon}`);
    res.json({ ok: true, inventoryId: item.id, priceTon, nftId: item.itemId });
  } catch (err) {
    console.error("[inventory/list]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

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
      .where(
        and(
          eq(miniUserInventoryTable.id, inventoryId),
          eq(miniUserInventoryTable.telegramId, telegramId),
        ),
      )
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

router.get("/listings", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(miniUserInventoryTable).orderBy(desc(miniUserInventoryTable.acquiredAt));
    const listings = [];
    for (const it of rows) {
      const m = (it.meta ?? {}) as Record<string, unknown>;
      if (!m.listed) continue;
      const col = getNftCollection(it.itemId);
      const priceTon = Number(m.priceTon) || col?.valueTon || 0;
      listings.push({
        id: it.id,
        sellerId: it.telegramId,
        nftId: it.itemId,
        nameRu: col?.nameRu ?? it.itemId,
        nameEn: col?.nameEn ?? it.itemId,
        imageUrl: col?.imageUrl ?? null,
        rarity: col?.rarity ?? null,
        priceTon,
        listedAt: m.listedAt ?? it.acquiredAt,
      });
    }
    res.json({ listings });
  } catch (err) {
    console.error("[inventory/listings]", err);
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
    if (!m.listed) {
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

    const buyer = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .then((r) => r[0] ?? null);
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
    };

    await Promise.all([
      db
        .update(miniUserInventoryTable)
        .set({ telegramId, meta: newMeta, acquiredAt: new Date() })
        .where(eq(miniUserInventoryTable.id, item.id)),
      db
        .update(usersTable)
        .set({ ton: String(newBuyerTon), updatedAt: new Date() })
        .where(eq(usersTable.telegramId, telegramId)),
      seller && newSellerTon != null
        ? db
            .update(usersTable)
            .set({ ton: String(newSellerTon), updatedAt: new Date() })
            .where(eq(usersTable.telegramId, item.telegramId))
        : Promise.resolve(),
    ]);

    console.log(
      `[inventory/buy] buyer=${telegramId} seller=${item.telegramId} item=${item.id} price=${priceTon} fee=${feeTon}`,
    );

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

/** Legacy: list at price instead of instant system sell */
router.post("/sell", async (req: Request, res: Response) => {
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
      .where(
        and(
          eq(miniUserInventoryTable.id, inventoryId),
          eq(miniUserInventoryTable.telegramId, telegramId),
        ),
      )
      .then((r) => r[0] ?? null);
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    const col = getNftCollection(item.itemId);
    const priceTon = Number(req.body?.priceTon) || col?.valueTon || 0;
    if (priceTon <= 0) {
      res.status(400).json({ error: "Set priceTon to list on market" });
      return;
    }
    const meta = { ...(item.meta ?? {}), listed: true, priceTon, listedAt: new Date().toISOString() };
    await db.update(miniUserInventoryTable).set({ meta }).where(eq(miniUserInventoryTable.id, item.id));
    res.json({ ok: true, listed: true, priceTon, inventoryId: item.id, nftId: item.itemId });
  } catch (err) {
    console.error("[inventory/sell->list]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
