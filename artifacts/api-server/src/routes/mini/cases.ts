import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  miniUserBossKeysTable,
  miniCaseOpensTable,
  miniNftInventoryTable,
  miniCasesConfigTable,
  miniUserInventoryTable,
  type CaseRewardItem,
  type NftCollections,
} from "@workspace/db/schema";
import { eq, and, asc } from "drizzle-orm";
import {
  getNftCollection,
  emptyPieces,
  isCollectionComplete,
} from "../../lib/nft-catalog.js";

const router: IRouter = Router();

function getTelegramId(res: Response): string | null {
  return (res.locals as Record<string, unknown>)["verifiedTelegramId"] as string | null;
}

function pickReward(pool: CaseRewardItem[]): CaseRewardItem & { amount?: number; pieceIndex?: number } {
  if (!pool.length) {
    return { id: "empty", type: "tonyx", weight: 1, amount: 0 };
  }
  const total = pool.reduce((s, r) => s + (r.weight || 0), 0) || 1;
  let roll = Math.random() * total;
  for (const item of pool) {
    roll -= item.weight || 0;
    if (roll <= 0) {
      if (item.type === "nft_fragment" || item.type === "nft_full") {
        const pieceIndex =
          item.pieceIndex != null
            ? item.pieceIndex
            : Math.floor(Math.random() * 9);
        return { ...item, pieceIndex };
      }
      const min = item.minAmount ?? 0;
      const max = item.maxAmount ?? min;
      const amount = Math.round((min + Math.random() * (max - min)) * 10000) / 10000;
      return { ...item, amount };
    }
  }
  const last = pool[pool.length - 1];
  return { ...last, amount: last.minAmount ?? 0 };
}

async function loadCasesFromDb() {
  return db
    .select()
    .from(miniCasesConfigTable)
    .where(eq(miniCasesConfigTable.enabled, true))
    .orderBy(asc(miniCasesConfigTable.sortOrder));
}

// GET /api/mini/cases/list
router.get("/list", async (_req: Request, res: Response) => {
  try {
    const telegramId = getTelegramId(res);
    if (!telegramId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [user, keys, nft, caseRows] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null),
      db.select().from(miniUserBossKeysTable).where(eq(miniUserBossKeysTable.telegramId, telegramId)),
      db.select().from(miniNftInventoryTable).where(eq(miniNftInventoryTable.telegramId, telegramId)).then((r) => r[0] ?? null),
      loadCasesFromDb(),
    ]);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const bossKeys: Record<number, number> = {};
    for (const k of keys) {
      bossKeys[k.bossLevel] = k.keysCount;
    }

    const cases = caseRows.map((c) => {
      const costValue = Number(c.costValue);
      let canOpen = false;
      let have = 0;

      if (c.costType === "key") {
        have = bossKeys[costValue] ?? 0;
        canOpen = have >= 1;
      } else if (c.costType === "ton") {
        have = Number(user.ton);
        canOpen = have >= costValue;
      } else if (c.costType === "tonyx") {
        have = user.tonyxCoins;
        canOpen = have >= costValue;
      }

      const rewards = (c.rewards ?? []) as CaseRewardItem[];

      return {
        id: c.id,
        nameRu: c.nameRu,
        nameEn: c.nameEn,
        costType: c.costType,
        costValue,
        canOpen,
        have,
        imageUrl: c.imageUrl ?? null,
        possibleRewards: rewards.map((r) => {
          const col = r.nftId ? getNftCollection(r.nftId) : undefined;
          let labelRu = r.labelRu ?? "";
          let labelEn = r.labelEn ?? "";
          if (!labelRu) {
            if (r.type === "ton") labelRu = `${r.minAmount ?? 0}–${r.maxAmount ?? 0} TON`;
            else if (r.type === "tonyx") labelRu = `${r.minAmount ?? 0}–${r.maxAmount ?? 0} TONYX`;
            else if (r.type === "nft_fragment") labelRu = `Фрагмент ${col?.nameRu ?? r.nftId ?? "NFT"}`;
            else if (r.type === "nft_full") labelRu = col?.nameRu ?? r.nftId ?? "NFT";
          }
          if (!labelEn) {
            if (r.type === "ton") labelEn = `${r.minAmount ?? 0}–${r.maxAmount ?? 0} TON`;
            else if (r.type === "tonyx") labelEn = `${r.minAmount ?? 0}–${r.maxAmount ?? 0} TONYX`;
            else if (r.type === "nft_fragment") labelEn = `Fragment ${col?.nameEn ?? r.nftId ?? "NFT"}`;
            else if (r.type === "nft_full") labelEn = col?.nameEn ?? r.nftId ?? "NFT";
          }
          return {
            type: r.type,
            weight: r.weight,
            minAmount: r.minAmount,
            maxAmount: r.maxAmount,
            nftId: r.nftId,
            pieceIndex: r.pieceIndex,
            labelRu,
            labelEn,
            imageUrl: r.imageUrl ?? col?.imageUrl ?? null,
          };
        }),
      };
    });

    res.json({
      cases,
      balances: { ton: Number(user.ton), tonyx: user.tonyxCoins },
      bossKeys,
      nftInventory: {
        fragments: nft?.fragments ?? {},
        assembled: nft?.assembled ?? [],
        collections: nft?.collections ?? {},
      },
    });
  } catch (err) {
    console.error("[cases/list]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/mini/cases/open  body: { caseId }
router.post("/open", async (req: Request, res: Response) => {
  try {
    const telegramId = getTelegramId(res);
    if (!telegramId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const caseId = String(req.body?.caseId ?? "");
    const cfg = await db
      .select()
      .from(miniCasesConfigTable)
      .where(and(eq(miniCasesConfigTable.id, caseId), eq(miniCasesConfigTable.enabled, true)))
      .then((r) => r[0] ?? null);

    if (!cfg) {
      res.status(400).json({ error: "Unknown or disabled case" });
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

    let newTon = Number(user.ton);
    let newTonyx = user.tonyxCoins;
    let costAmount: number | null = null;
    const costValue = Number(cfg.costValue);

    if (cfg.costType === "key") {
      const keyRow = await db
        .select()
        .from(miniUserBossKeysTable)
        .where(
          and(
            eq(miniUserBossKeysTable.telegramId, telegramId),
            eq(miniUserBossKeysTable.bossLevel, costValue),
          ),
        )
        .then((r) => r[0] ?? null);

      if (!keyRow || keyRow.keysCount < 1) {
        res.status(400).json({ error: "Not enough keys", need: 1, have: keyRow?.keysCount ?? 0 });
        return;
      }

      await db
        .update(miniUserBossKeysTable)
        .set({ keysCount: keyRow.keysCount - 1, updatedAt: new Date() })
        .where(eq(miniUserBossKeysTable.id, keyRow.id));

      costAmount = 1;
    } else if (cfg.costType === "ton") {
      if (newTon < costValue) {
        res.status(400).json({ error: "Not enough TON", need: costValue, have: newTon });
        return;
      }
      newTon = Math.round((newTon - costValue) * 1e8) / 1e8;
      costAmount = costValue;
    } else if (cfg.costType === "tonyx") {
      if (newTonyx < costValue) {
        res.status(400).json({ error: "Not enough TONYX", need: costValue, have: newTonyx });
        return;
      }
      newTonyx -= costValue;
      costAmount = costValue;
    } else {
      res.status(400).json({ error: "Invalid cost type" });
      return;
    }

    const rewardsPool = (cfg.rewards ?? []) as CaseRewardItem[];
    const picked = pickReward(rewardsPool);

    let rewardPayload: Record<string, unknown> = {
      type: picked.type,
      amount: picked.amount ?? null,
      nftId: picked.nftId ?? null,
      pieceIndex: picked.pieceIndex ?? null,
    };

    // ensure nft row
    let nftRow = await db
      .select()
      .from(miniNftInventoryTable)
      .where(eq(miniNftInventoryTable.telegramId, telegramId))
      .then((r) => r[0] ?? null);

    if (!nftRow) {
      await db.insert(miniNftInventoryTable).values({
        telegramId,
        fragments: {},
        assembled: [],
        collections: {},
      });
      nftRow = await db
        .select()
        .from(miniNftInventoryTable)
        .where(eq(miniNftInventoryTable.telegramId, telegramId))
        .then((r) => r[0]!);
    }

    const collections: NftCollections = { ...(nftRow.collections ?? {}) };
    const fragments = { ...(nftRow.fragments ?? {}) };
    const assembled = [...(nftRow.assembled ?? [])];

    if (picked.type === "ton" && picked.amount) {
      newTon = Math.round((newTon + picked.amount) * 1e8) / 1e8;
    } else if (picked.type === "tonyx" && picked.amount) {
      newTonyx += Math.floor(picked.amount);
    } else if (picked.type === "nft_fragment" && picked.nftId) {
      const nftId = picked.nftId;
      const col = collections[nftId] ?? { pieces: emptyPieces(9), claimed: 0 };
      const pieces = [...col.pieces];
      while (pieces.length < 9) pieces.push(0);
      const idx = Math.min(8, Math.max(0, picked.pieceIndex ?? Math.floor(Math.random() * 9)));
      pieces[idx] = 1;
      collections[nftId] = { pieces, claimed: col.claimed };
      fragments[nftId] = pieces.filter((p) => p >= 1).length;
      rewardPayload = { ...rewardPayload, pieceIndex: idx, piecesOwned: fragments[nftId] };
    } else if (picked.type === "nft_full" && picked.nftId) {
      const nftId = picked.nftId;
      await db.insert(miniUserInventoryTable).values({
        telegramId,
        itemType: "nft_full",
        itemId: nftId,
        quantity: 1,
        meta: { source: "case", caseId },
      });
      if (!assembled.includes(nftId)) assembled.push(nftId);
      rewardPayload = { ...rewardPayload, toInventory: true };
    }

    await Promise.all([
      db
        .update(usersTable)
        .set({
          ton: String(newTon),
          tonyxCoins: newTonyx,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.telegramId, telegramId)),
      db
        .update(miniNftInventoryTable)
        .set({
          fragments,
          assembled,
          collections,
          updatedAt: new Date(),
        })
        .where(eq(miniNftInventoryTable.telegramId, telegramId)),
      db.insert(miniCaseOpensTable).values({
        telegramId,
        caseId,
        costType: cfg.costType,
        costAmount: costAmount != null ? String(costAmount) : null,
        rewards: rewardPayload,
      }),
    ]);

    console.log(
      `[cases/open] ${telegramId} case=${caseId} reward=${JSON.stringify(rewardPayload)}`,
    );

    res.json({
      reward: rewardPayload,
      balances: { ton: newTon, tonyx: newTonyx },
      nftInventory: { fragments, assembled, collections },
      complete: picked.nftId ? isCollectionComplete(collections[picked.nftId!]?.pieces ?? []) : false,
    });
  } catch (err) {
    console.error("[cases/open]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
