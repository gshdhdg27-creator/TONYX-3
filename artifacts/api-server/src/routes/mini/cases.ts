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
        // pieceIndex is chosen sequentially in /open from user progress
        return { ...item, pieceIndex: item.pieceIndex };
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

async function ensureBossCases() {
  const rows = await db.select({ id: miniCasesConfigTable.id }).from(miniCasesConfigTable);
  const have = new Set(rows.map((r) => r.id));
  const bosses: Array<{
    id: string; nameRu: string; nameEn: string; costType: "key"; costValue: string;
    imageUrl: string; enabled: boolean; sortOrder: number; rewards: CaseRewardItem[];
  }> = [
    {
      id: "boss_1", nameRu: "Кейс Shadow Pup", nameEn: "Shadow Pup Case", costType: "key", costValue: "1",
      imageUrl: "/cases/boss_1.jpg", enabled: true, sortOrder: 1,
      rewards: [
        { id: "r1", type: "ton", weight: 30, minAmount: 0.01, maxAmount: 0.01, labelRu: "0.01 TON", labelEn: "0.01 TON" },
        { id: "r2", type: "ton", weight: 20, minAmount: 0.02, maxAmount: 0.02, labelRu: "0.02 TON", labelEn: "0.02 TON" },
        { id: "r3", type: "tonyx", weight: 35, minAmount: 50, maxAmount: 50, labelRu: "50 TONYX", labelEn: "50 TONYX" },
        { id: "r4", type: "tonyx", weight: 10, minAmount: 100, maxAmount: 100, labelRu: "100 TONYX", labelEn: "100 TONYX" },
        { id: "r5", type: "nft_fragment", weight: 5, nftId: "hypno_lollipop" },
      ],
    },
    {
      id: "boss_2", nameRu: "Кейс Rage Dogg", nameEn: "Rage Dogg Case", costType: "key", costValue: "2",
      imageUrl: "/cases/boss_2.jpg", enabled: true, sortOrder: 2,
      rewards: [
        { id: "r1", type: "ton", weight: 28, minAmount: 0.02, maxAmount: 0.02, labelRu: "0.02 TON", labelEn: "0.02 TON" },
        { id: "r2", type: "ton", weight: 18, minAmount: 0.05, maxAmount: 0.05, labelRu: "0.05 TON", labelEn: "0.05 TON" },
        { id: "r3", type: "tonyx", weight: 35, minAmount: 100, maxAmount: 100, labelRu: "100 TONYX", labelEn: "100 TONYX" },
        { id: "r4", type: "tonyx", weight: 12, minAmount: 250, maxAmount: 250, labelRu: "250 TONYX", labelEn: "250 TONYX" },
        { id: "r5", type: "nft_fragment", weight: 7, nftId: "snoop_cigar" },
      ],
    },
    {
      id: "boss_3", nameRu: "Кейс Inferno Dogg", nameEn: "Inferno Dogg Case", costType: "key", costValue: "3",
      imageUrl: "/cases/boss_3.jpg", enabled: true, sortOrder: 3,
      rewards: [
        { id: "r1", type: "ton", weight: 26, minAmount: 0.05, maxAmount: 0.05, labelRu: "0.05 TON", labelEn: "0.05 TON" },
        { id: "r2", type: "ton", weight: 16, minAmount: 0.1, maxAmount: 0.1, labelRu: "0.1 TON", labelEn: "0.1 TON" },
        { id: "r3", type: "tonyx", weight: 34, minAmount: 200, maxAmount: 200, labelRu: "200 TONYX", labelEn: "200 TONYX" },
        { id: "r4", type: "tonyx", weight: 14, minAmount: 500, maxAmount: 500, labelRu: "500 TONYX", labelEn: "500 TONYX" },
        { id: "r5", type: "nft_fragment", weight: 10, nftId: "electric_skull" },
      ],
    },
    {
      id: "boss_4", nameRu: "Кейс Storm Dogg", nameEn: "Storm Dogg Case", costType: "key", costValue: "4",
      imageUrl: "/cases/boss_4.jpg", enabled: true, sortOrder: 4,
      rewards: [
        { id: "r1", type: "ton", weight: 24, minAmount: 0.1, maxAmount: 0.1, labelRu: "0.1 TON", labelEn: "0.1 TON" },
        { id: "r2", type: "ton", weight: 16, minAmount: 0.25, maxAmount: 0.25, labelRu: "0.25 TON", labelEn: "0.25 TON" },
        { id: "r3", type: "tonyx", weight: 32, minAmount: 500, maxAmount: 500, labelRu: "500 TONYX", labelEn: "500 TONYX" },
        { id: "r4", type: "tonyx", weight: 14, minAmount: 1000, maxAmount: 1000, labelRu: "1000 TONYX", labelEn: "1000 TONYX" },
        { id: "r5", type: "nft_fragment", weight: 14, nftId: "neko_helmet" },
      ],
    },
    {
      id: "boss_5", nameRu: "Кейс Boss Dogg Prime", nameEn: "Boss Dogg Prime Case", costType: "key", costValue: "5",
      imageUrl: "/cases/boss_5.jpg", enabled: true, sortOrder: 5,
      rewards: [
        { id: "r1", type: "ton", weight: 22, minAmount: 0.25, maxAmount: 0.25, labelRu: "0.25 TON", labelEn: "0.25 TON" },
        { id: "r2", type: "ton", weight: 14, minAmount: 0.5, maxAmount: 0.5, labelRu: "0.5 TON", labelEn: "0.5 TON" },
        { id: "r3", type: "tonyx", weight: 30, minAmount: 1000, maxAmount: 1000, labelRu: "1000 TONYX", labelEn: "1000 TONYX" },
        { id: "r4", type: "tonyx", weight: 14, minAmount: 2500, maxAmount: 2500, labelRu: "2500 TONYX", labelEn: "2500 TONYX" },
        { id: "r5", type: "nft_fragment", weight: 15, nftId: "heroic_helmet" },
        { id: "r6", type: "nft_fragment", weight: 5, nftId: "royal_dogg" },
      ],
    },
  ];
  for (const c of bosses) {
    // Do NOT overwrite rewards/names — admin panel owns config after seed
    if (have.has(c.id)) continue;
    await db.insert(miniCasesConfigTable).values(c);
  }
}

async function ensureTonCases() {
  const rows = await db.select({ id: miniCasesConfigTable.id }).from(miniCasesConfigTable);
  const have = new Set(rows.map((r) => r.id));
  const extras: Array<{
    id: string; nameRu: string; nameEn: string; costType: "ton"; costValue: string;
    imageUrl: string; enabled: boolean; sortOrder: number; rewards: CaseRewardItem[];
  }> = [
    {
      id: "ton_0_1", nameRu: "TON Starter", nameEn: "TON Starter", costType: "ton", costValue: "0.1",
      imageUrl: "/cases/ton_0_1.svg", enabled: true, sortOrder: 10,
      rewards: [
        { id: "r1", type: "ton", weight: 30, minAmount: 0.05, maxAmount: 0.05, labelRu: "0.05 TON", labelEn: "0.05 TON" },
        { id: "r2", type: "ton", weight: 25, minAmount: 0.08, maxAmount: 0.08, labelRu: "0.08 TON", labelEn: "0.08 TON" },
        { id: "r3", type: "ton", weight: 20, minAmount: 0.1, maxAmount: 0.1, labelRu: "0.1 TON", labelEn: "0.1 TON" },
        { id: "r4", type: "ton", weight: 12, minAmount: 0.15, maxAmount: 0.15, labelRu: "0.15 TON", labelEn: "0.15 TON" },
        { id: "r5", type: "ton", weight: 8, minAmount: 0.25, maxAmount: 0.25, labelRu: "0.25 TON", labelEn: "0.25 TON" },
        { id: "r6", type: "tonyx", weight: 3, minAmount: 50, maxAmount: 50, labelRu: "50 TONYX", labelEn: "50 TONYX" },
        { id: "r7", type: "nft_fragment", weight: 2, nftId: "hypno_lollipop" },
      ],
    },
    {
      id: "ton_1", nameRu: "TON Silver", nameEn: "TON Silver", costType: "ton", costValue: "1",
      imageUrl: "/cases/ton_1.svg", enabled: true, sortOrder: 11,
      rewards: [
        { id: "r1", type: "ton", weight: 28, minAmount: 0.3, maxAmount: 0.3, labelRu: "0.3 TON", labelEn: "0.3 TON" },
        { id: "r2", type: "ton", weight: 24, minAmount: 0.5, maxAmount: 0.5, labelRu: "0.5 TON", labelEn: "0.5 TON" },
        { id: "r3", type: "ton", weight: 18, minAmount: 0.8, maxAmount: 0.8, labelRu: "0.8 TON", labelEn: "0.8 TON" },
        { id: "r4", type: "ton", weight: 12, minAmount: 1.2, maxAmount: 1.2, labelRu: "1.2 TON", labelEn: "1.2 TON" },
        { id: "r5", type: "ton", weight: 8, minAmount: 2, maxAmount: 2, labelRu: "2 TON", labelEn: "2 TON" },
        { id: "r6", type: "tonyx", weight: 6, minAmount: 200, maxAmount: 200, labelRu: "200 TONYX", labelEn: "200 TONYX" },
        { id: "r7", type: "nft_fragment", weight: 4, nftId: "moon_pendant" },
      ],
    },
    {
      id: "ton_2_5", nameRu: "TON Gold", nameEn: "TON Gold", costType: "ton", costValue: "2.5",
      imageUrl: "/cases/ton_2_5.svg", enabled: true, sortOrder: 12,
      rewards: [
        { id: "r1", type: "ton", weight: 26, minAmount: 0.8, maxAmount: 0.8, labelRu: "0.8 TON", labelEn: "0.8 TON" },
        { id: "r2", type: "ton", weight: 22, minAmount: 1.2, maxAmount: 1.2, labelRu: "1.2 TON", labelEn: "1.2 TON" },
        { id: "r3", type: "ton", weight: 18, minAmount: 2, maxAmount: 2, labelRu: "2 TON", labelEn: "2 TON" },
        { id: "r4", type: "ton", weight: 12, minAmount: 3, maxAmount: 3, labelRu: "3 TON", labelEn: "3 TON" },
        { id: "r5", type: "ton", weight: 8, minAmount: 5, maxAmount: 5, labelRu: "5 TON", labelEn: "5 TON" },
        { id: "r6", type: "tonyx", weight: 8, minAmount: 500, maxAmount: 500, labelRu: "500 TONYX", labelEn: "500 TONYX" },
        { id: "r7", type: "nft_fragment", weight: 6, nftId: "electric_skull" },
      ],
    },
    {
      id: "ton_5", nameRu: "TON Platinum", nameEn: "TON Platinum", costType: "ton", costValue: "5",
      imageUrl: "/cases/ton_5.svg", enabled: true, sortOrder: 13,
      rewards: [
        { id: "r1", type: "ton", weight: 26, minAmount: 1.5, maxAmount: 1.5, labelRu: "1.5 TON", labelEn: "1.5 TON" },
        { id: "r2", type: "ton", weight: 22, minAmount: 2.5, maxAmount: 2.5, labelRu: "2.5 TON", labelEn: "2.5 TON" },
        { id: "r3", type: "ton", weight: 16, minAmount: 4, maxAmount: 4, labelRu: "4 TON", labelEn: "4 TON" },
        { id: "r4", type: "ton", weight: 12, minAmount: 6, maxAmount: 6, labelRu: "6 TON", labelEn: "6 TON" },
        { id: "r5", type: "ton", weight: 8, minAmount: 10, maxAmount: 10, labelRu: "10 TON", labelEn: "10 TON" },
        { id: "r6", type: "tonyx", weight: 8, minAmount: 1000, maxAmount: 1000, labelRu: "1000 TONYX", labelEn: "1000 TONYX" },
        { id: "r7", type: "nft_fragment", weight: 8, nftId: "neko_helmet" },
      ],
    },
    {
      id: "ton_10", nameRu: "TON Diamond", nameEn: "TON Diamond", costType: "ton", costValue: "10",
      imageUrl: "/cases/ton_10.svg", enabled: true, sortOrder: 14,
      rewards: [
        { id: "r1", type: "ton", weight: 24, minAmount: 3, maxAmount: 3, labelRu: "3 TON", labelEn: "3 TON" },
        { id: "r2", type: "ton", weight: 20, minAmount: 5, maxAmount: 5, labelRu: "5 TON", labelEn: "5 TON" },
        { id: "r3", type: "ton", weight: 16, minAmount: 8, maxAmount: 8, labelRu: "8 TON", labelEn: "8 TON" },
        { id: "r4", type: "ton", weight: 12, minAmount: 12, maxAmount: 12, labelRu: "12 TON", labelEn: "12 TON" },
        { id: "r5", type: "ton", weight: 8, minAmount: 20, maxAmount: 20, labelRu: "20 TON", labelEn: "20 TON" },
        { id: "r6", type: "tonyx", weight: 8, minAmount: 2500, maxAmount: 2500, labelRu: "2500 TONYX", labelEn: "2500 TONYX" },
        { id: "r7", type: "nft_fragment", weight: 8, nftId: "heroic_helmet" },
        { id: "r8", type: "nft_fragment", weight: 4, nftId: "royal_dogg" },
      ],
    },
  ];
  for (const c of extras) {
    // Do NOT overwrite rewards — admin panel owns percentages after seed
    if (have.has(c.id)) continue;
    await db.insert(miniCasesConfigTable).values(c);
  }
}

async function loadCasesFromDb() {
  try { await ensureBossCases(); } catch (e) { console.error("[cases] ensureBossCases", e); }
  try { await ensureTonCases(); } catch (e) { console.error("[cases] ensureTonCases", e); }
  return db
    .select()
    .from(miniCasesConfigTable)
    .where(eq(miniCasesConfigTable.enabled, true))
    .orderBy(asc(miniCasesConfigTable.sortOrder));
}

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
            if (r.type === "ton") labelRu = (r.minAmount != null && r.minAmount === r.maxAmount) ? `${r.minAmount} TON` : `${r.minAmount ?? 0}–${r.maxAmount ?? 0} TON`;
            else if (r.type === "tonyx") labelRu = (r.minAmount != null && r.minAmount === r.maxAmount) ? `${r.minAmount} TONYX` : `${r.minAmount ?? 0}–${r.maxAmount ?? 0} TONYX`;
            else if (r.type === "nft_fragment") labelRu = `Фрагмент ${col?.nameRu ?? r.nftId ?? "NFT"}`;
            else if (r.type === "nft_full") labelRu = col?.nameRu ?? r.nftId ?? "NFT";
          }
          if (!labelEn) {
            if (r.type === "ton") labelEn = (r.minAmount != null && r.minAmount === r.maxAmount) ? `${r.minAmount} TON` : `${r.minAmount ?? 0}–${r.maxAmount ?? 0} TON`;
            else if (r.type === "tonyx") labelEn = (r.minAmount != null && r.minAmount === r.maxAmount) ? `${r.minAmount} TONYX` : `${r.minAmount ?? 0}–${r.maxAmount ?? 0} TONYX`;
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
            valueTon: col?.valueTon ?? (r.type === "ton" ? (r.maxAmount ?? r.minAmount ?? 0) : null),
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
      type: picked.type.type,
      amount: picked.amount ?? null,
      nftId: picked.nftId ?? null,
      pieceIndex: picked.pieceIndex ?? null,
    };

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
      // Sequential fill 1..9 without repeats: first missing slot
      let idx = pieces.findIndex((p) => p < 1);
      if (idx < 0) {
        // Already complete — wait for claim/reset; keep as last piece for UX
        idx = 8;
      }
      pieces[idx] = 1;
      collections[nftId] = { pieces, claimed: col.claimed };
      fragments[nftId] = pieces.filter((p) => p >= 1).length;
      rewardPayload = { ...rewardPayload, pieceIndex: idx, piecesOwned: fragments[nftId], pieceLabel: `${idx + 1}/9` };
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
      rewards: [rewardPayload],
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
