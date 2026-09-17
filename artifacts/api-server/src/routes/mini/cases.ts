import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  miniUserBossKeysTable,
  miniCaseOpensTable,
  miniNftInventoryTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import {
  CASES,
  pickCaseReward,
  NFT_FRAGMENTS_NEEDED,
  type CaseConfig,
} from "../../lib/game-constants.js";

const router: IRouter = Router();

function getTelegramId(res: Response): string | null {
  return (res.locals as Record<string, unknown>)["verifiedTelegramId"] as string | null;
}

function getCase(caseId: string): CaseConfig | undefined {
  return CASES.find((c) => c.id === caseId);
}

// GET /api/mini/cases/list
router.get("/list", async (_req: Request, res: Response) => {
  try {
    const telegramId = getTelegramId(res);
    if (!telegramId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [user, keys, nft] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null),
      db.select().from(miniUserBossKeysTable).where(eq(miniUserBossKeysTable.telegramId, telegramId)),
      db.select().from(miniNftInventoryTable).where(eq(miniNftInventoryTable.telegramId, telegramId)).then((r) => r[0] ?? null),
    ]);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const bossKeys: Record<number, number> = {};
    for (const k of keys) {
      bossKeys[k.bossLevel] = k.keysCount;
    }

    const cases = CASES.map((c) => {
      let canOpen = false;
      let have = 0;

      if (c.costType === "key") {
        have = bossKeys[c.costValue] ?? 0;
        canOpen = have >= 1;
      } else if (c.costType === "ton") {
        have = Number(user.ton);
        canOpen = have >= c.costValue;
      } else if (c.costType === "tonyx") {
        have = user.tonyxCoins;
        canOpen = have >= c.costValue;
      }

      return {
        id: c.id,
        nameRu: c.nameRu,
        nameEn: c.nameEn,
        costType: c.costType,
        costValue: c.costValue,
        canOpen,
        have,
      };
    });

    res.json({
      cases,
      balances: { ton: Number(user.ton), tonyx: user.tonyxCoins },
      bossKeys,
      nftInventory: {
        fragments: nft?.fragments ?? {},
        assembled: nft?.assembled ?? [],
      },
    });
  } catch (err) {
    console.error("[cases/list]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/mini/cases/open
// Body: { caseId: string }
router.post("/open", async (req: Request, res: Response) => {
  try {
    const telegramId = getTelegramId(res);
    if (!telegramId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const caseId = String(req.body?.caseId ?? "");
    const cfg = getCase(caseId);
    if (!cfg) {
      res.status(400).json({ error: "Unknown case" });
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

    // ── Pay cost ──
    if (cfg.costType === "key") {
      const bossLevel = cfg.costValue;
      const keyRow = await db
        .select()
        .from(miniUserBossKeysTable)
        .where(and(
          eq(miniUserBossKeysTable.telegramId, telegramId),
          eq(miniUserBossKeysTable.bossLevel, bossLevel),
        ))
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
      if (newTon < cfg.costValue) {
        res.status(400).json({ error: "Not enough TON", need: cfg.costValue, have: newTon });
        return;
      }
      newTon -= cfg.costValue;
      costAmount = cfg.costValue;
    } else if (cfg.costType === "tonyx") {
      if (newTonyx < cfg.costValue) {
        res.status(400).json({ error: "Not enough TONYX", need: cfg.costValue, have: newTonyx });
        return;
      }
      newTonyx -= cfg.costValue;
      costAmount = cfg.costValue;
    }

    // ── Roll reward (server only) ──
    const picked = pickCaseReward(cfg.rewards);
    const rewards: Array<{
      type: "ton" | "tonyx" | "nft_fragment";
      amount?: number;
      nftId?: string;
    }> = [picked];

    if (picked.type === "ton" && picked.amount) {
      newTon += picked.amount;
    }
    if (picked.type === "tonyx" && picked.amount) {
      newTonyx += picked.amount;
    }

    // NFT fragment
    let nftRow = await db
      .select()
      .from(miniNftInventoryTable)
      .where(eq(miniNftInventoryTable.telegramId, telegramId))
      .then((r) => r[0] ?? null);

    if (!nftRow) {
      await db.insert(miniNftInventoryTable).values({ telegramId });
      nftRow = await db
        .select()
        .from(miniNftInventoryTable)
        .where(eq(miniNftInventoryTable.telegramId, telegramId))
        .then((r) => r[0]!);
    }

    const fragments = { ...(nftRow.fragments as Record<string, number>) };
    const assembled = [...(nftRow.assembled as string[])];

    if (picked.type === "nft_fragment" && picked.nftId) {
      const id = picked.nftId;
      fragments[id] = (fragments[id] ?? 0) + 1;
      if (fragments[id] >= NFT_FRAGMENTS_NEEDED && !assembled.includes(id)) {
        assembled.push(id);
        fragments[id] = 0;
      }
    }

    // Persist
    await Promise.all([
      db.update(usersTable)
        .set({ ton: String(newTon), tonyxCoins: newTonyx, updatedAt: new Date() })
        .where(eq(usersTable.telegramId, telegramId)),
      db.update(miniNftInventoryTable)
        .set({ fragments, assembled, updatedAt: new Date() })
        .where(eq(miniNftInventoryTable.telegramId, telegramId)),
      db.insert(miniCaseOpensTable).values({
        telegramId,
        caseId: cfg.id,
        costType: cfg.costType,
        costAmount: costAmount != null ? String(costAmount) : null,
        rewards,
      }),
    ]);

    // Fresh keys
    const keys = await db
      .select()
      .from(miniUserBossKeysTable)
      .where(eq(miniUserBossKeysTable.telegramId, telegramId));

    const bossKeys: Record<number, number> = {};
    for (const k of keys) {
      bossKeys[k.bossLevel] = k.keysCount;
    }

    console.log(
      `[cases/open] ${telegramId} case=${cfg.id} reward=${JSON.stringify(picked)}`,
    );

    res.json({
      rewards,
      balances: { ton: newTon, tonyx: newTonyx },
      bossKeys,
      nftInventory: { fragments, assembled },
    });
  } catch (err) {
    console.error("[cases/open]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
