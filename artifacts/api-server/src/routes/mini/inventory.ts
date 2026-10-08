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

    const inventory = items.map((it) => {
      const col = it.itemType === "nft_full" ? getNftCollection(it.itemId) : undefined;
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
      };
    });

    res.json({
      balances: { ton: Number(user.ton), tonyx: user.tonyxCoins },
      collections: collectionList,
      inventory,
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

    // reset puzzle for re-collect, increment claimed
    collections[nftId] = {
      pieces: emptyPieces(9),
      claimed: (prog.claimed ?? 0) + 1,
    };

    const fragments = { ...(nftRow.fragments ?? {}) };
    fragments[nftId] = 0;

    const assembled = [...(nftRow.assembled ?? [])];
    // keep history of ever assembled ids
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

    res.json({
      ok: true,
      nftId,
      valueTon: colMeta.valueTon,
      nameRu: colMeta.nameRu,
    });
  } catch (err) {
    console.error("[inventory/claim]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /api/mini/inventory/sell  body: { inventoryId } — sell NFT for catalog TON */
router.post("/sell", async (req: Request, res: Response) => {
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
      res.status(400).json({ error: "Only NFT can be sold" });
      return;
    }

    const colMeta = getNftCollection(item.itemId);
    if (!colMeta) {
      res.status(400).json({ error: "Unknown NFT price" });
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

    const sellPrice = colMeta.valueTon;
    const newTon = Math.round((Number(user.ton) + sellPrice) * 1e8) / 1e8;

    if (item.quantity > 1) {
      await db
        .update(miniUserInventoryTable)
        .set({ quantity: item.quantity - 1 })
        .where(eq(miniUserInventoryTable.id, item.id));
    } else {
      await db.delete(miniUserInventoryTable).where(eq(miniUserInventoryTable.id, item.id));
    }

    await db
      .update(usersTable)
      .set({ ton: String(newTon), updatedAt: new Date() })
      .where(eq(usersTable.telegramId, telegramId));

    console.log(
      `[inventory/sell] ${telegramId} item=${item.id} nft=${item.itemId} +${sellPrice} TON`,
    );

    res.json({
      ok: true,
      sold: item.itemId,
      receivedTon: sellPrice,
      balances: { ton: newTon, tonyx: user.tonyxCoins },
    });
  } catch (err) {
    console.error("[inventory/sell]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
