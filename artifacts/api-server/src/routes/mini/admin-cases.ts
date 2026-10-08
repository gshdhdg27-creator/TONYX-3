import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  miniCasesConfigTable,
  usersTable,
  type CaseRewardItem,
} from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";
import { NFT_COLLECTIONS } from "../../lib/nft-catalog.js";

const router: IRouter = Router();

function getAdminId(req: Request): string {
  const h = req.headers["x-admin-id"];
  if (typeof h === "string" && h.trim()) return h.trim();
  if (req.body?.adminId) return String(req.body.adminId).trim();
  if (req.query?.adminId) return String(req.query.adminId).trim();
  return "";
}

async function assertAdmin(adminId: string): Promise<boolean> {
  if (!adminId) return false;
  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, adminId))
    .then((r) => r[0] ?? null);
  if (!user) return false;
  // isAdmin flag or owner
  const isAdmin = Boolean((user as { isAdmin?: boolean }).isAdmin);
  const isOwner = adminId === "7257793582";
  return isAdmin || isOwner;
}

const DEFAULT_CASES = [
  {
    id: "boss_1",
    nameRu: "Кейс Shadow Pup",
    nameEn: "Shadow Pup Case",
    costType: "key",
    costValue: "1",
    imageUrl: null as string | null,
    enabled: true,
    sortOrder: 1,
    rewards: [
      { id: "r1", type: "ton" as const, weight: 40, minAmount: 0.005, maxAmount: 0.02 },
      { id: "r2", type: "tonyx" as const, weight: 50, minAmount: 20, maxAmount: 80 },
      { id: "r3", type: "nft_fragment" as const, weight: 10, nftId: "hypno_lollipop" },
    ] satisfies CaseRewardItem[],
  },
  {
    id: "boss_2",
    nameRu: "Кейс Rage Dogg",
    nameEn: "Rage Dogg Case",
    costType: "key",
    costValue: "2",
    imageUrl: null,
    enabled: true,
    sortOrder: 2,
    rewards: [
      { id: "r1", type: "ton" as const, weight: 35, minAmount: 0.01, maxAmount: 0.04 },
      { id: "r2", type: "tonyx" as const, weight: 50, minAmount: 50, maxAmount: 150 },
      { id: "r3", type: "nft_fragment" as const, weight: 15, nftId: "electric_skull" },
    ] satisfies CaseRewardItem[],
  },
  {
    id: "boss_3",
    nameRu: "Кейс Inferno Dogg",
    nameEn: "Inferno Dogg Case",
    costType: "key",
    costValue: "3",
    imageUrl: null,
    enabled: true,
    sortOrder: 3,
    rewards: [
      { id: "r1", type: "ton" as const, weight: 30, minAmount: 0.03, maxAmount: 0.1 },
      { id: "r2", type: "tonyx" as const, weight: 50, minAmount: 100, maxAmount: 400 },
      { id: "r3", type: "nft_fragment" as const, weight: 20, nftId: "snoop_cigar" },
    ] satisfies CaseRewardItem[],
  },
  {
    id: "boss_4",
    nameRu: "Кейс Storm Dogg",
    nameEn: "Storm Dogg Case",
    costType: "key",
    costValue: "4",
    imageUrl: null,
    enabled: true,
    sortOrder: 4,
    rewards: [
      { id: "r1", type: "ton" as const, weight: 30, minAmount: 0.08, maxAmount: 0.25 },
      { id: "r2", type: "tonyx" as const, weight: 45, minAmount: 300, maxAmount: 1000 },
      { id: "r3", type: "nft_fragment" as const, weight: 25, nftId: "neko_helmet" },
    ] satisfies CaseRewardItem[],
  },
  {
    id: "boss_5",
    nameRu: "Кейс Boss Dogg Prime",
    nameEn: "Boss Dogg Prime Case",
    costType: "key",
    costValue: "5",
    imageUrl: null,
    enabled: true,
    sortOrder: 5,
    rewards: [
      { id: "r1", type: "ton" as const, weight: 25, minAmount: 0.2, maxAmount: 0.6 },
      { id: "r2", type: "tonyx" as const, weight: 45, minAmount: 800, maxAmount: 2500 },
      { id: "r3", type: "nft_fragment" as const, weight: 30, nftId: "heroic_helmet" },
    ] satisfies CaseRewardItem[],
  },
];

/** GET /api/mini/admin/cases — list all cases + nft catalog for picker */
router.get("/cases", async (req: Request, res: Response) => {
  try {
    const adminId = getAdminId(req);
    if (!(await assertAdmin(adminId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    let rows = await db
      .select()
      .from(miniCasesConfigTable)
      .orderBy(asc(miniCasesConfigTable.sortOrder));

    if (rows.length === 0) {
      for (const c of DEFAULT_CASES) {
        await db.insert(miniCasesConfigTable).values({
          id: c.id,
          nameRu: c.nameRu,
          nameEn: c.nameEn,
          costType: c.costType,
          costValue: c.costValue,
          imageUrl: c.imageUrl,
          enabled: c.enabled,
          rewards: c.rewards,
          sortOrder: c.sortOrder,
        });
      }
      rows = await db
        .select()
        .from(miniCasesConfigTable)
        .orderBy(asc(miniCasesConfigTable.sortOrder));
    }

    res.json({
      cases: rows.map((r) => ({
        id: r.id,
        nameRu: r.nameRu,
        nameEn: r.nameEn,
        costType: r.costType,
        costValue: Number(r.costValue),
        imageUrl: r.imageUrl,
        enabled: r.enabled,
        rewards: r.rewards ?? [],
        sortOrder: r.sortOrder,
        updatedAt: r.updatedAt,
      })),
      nftCatalog: NFT_COLLECTIONS.map((n) => ({
        id: n.id,
        nameRu: n.nameRu,
        nameEn: n.nameEn,
        valueTon: n.valueTon,
        rarity: n.rarity,
        piecesCount: n.piecesCount,
      })),
    });
  } catch (err) {
    console.error("[admin/cases GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /api/mini/admin/cases — create or update one case */
router.post("/cases", async (req: Request, res: Response) => {
  try {
    const adminId = getAdminId(req);
    if (!(await assertAdmin(adminId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const body = req.body ?? {};
    const id = String(body.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "id required" });
      return;
    }

    const nameRu = String(body.nameRu ?? id);
    const nameEn = String(body.nameEn ?? id);
    const costType = String(body.costType ?? "ton");
    const costValue = String(body.costValue ?? "0");
    const imageUrl = body.imageUrl != null ? String(body.imageUrl) : null;
    const enabled = body.enabled !== false;
    const sortOrder = Number(body.sortOrder ?? 0);
    const rewards = (Array.isArray(body.rewards) ? body.rewards : []) as CaseRewardItem[];

    const existing = await db
      .select()
      .from(miniCasesConfigTable)
      .where(eq(miniCasesConfigTable.id, id))
      .then((r) => r[0] ?? null);

    if (existing) {
      await db
        .update(miniCasesConfigTable)
        .set({
          nameRu,
          nameEn,
          costType,
          costValue,
          imageUrl,
          enabled,
          rewards,
          sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(miniCasesConfigTable.id, id));
    } else {
      await db.insert(miniCasesConfigTable).values({
        id,
        nameRu,
        nameEn,
        costType,
        costValue,
        imageUrl,
        enabled,
        rewards,
        sortOrder,
      });
    }

    console.log(`[admin/cases] upsert ${id} by ${adminId}`);
    res.json({ ok: true, id });
  } catch (err) {
    console.error("[admin/cases POST]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** DELETE /api/mini/admin/cases/:id */
router.delete("/cases/:id", async (req: Request, res: Response) => {
  try {
    const adminId = getAdminId(req);
    if (!(await assertAdmin(adminId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const id = String(req.params.id ?? "");
    if (!id) {
      res.status(400).json({ error: "id required" });
      return;
    }
    await db.delete(miniCasesConfigTable).where(eq(miniCasesConfigTable.id, id));
    console.log(`[admin/cases] delete ${id} by ${adminId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/cases DELETE]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
