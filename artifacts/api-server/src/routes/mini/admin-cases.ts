/**
 * Server: artifacts/api-server/src/routes/mini/admin-cases.ts
 * Admin CRUD for case rewards with fractional weights (0.001 precision).
 */
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
  const isAdmin = Boolean((user as { isAdmin?: boolean }).isAdmin);
  const isOwner = adminId === "7257793582";
  return isAdmin || isOwner;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function sanitizeRewards(raw: unknown): CaseRewardItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, idx) => {
    const r = item as Record<string, unknown>;
    const type = String(r.type ?? "tonyx") as CaseRewardItem["type"];
    const weight = round3(Math.max(0, Number(r.weight) || 0));
    const id = String(r.id ?? `r${idx + 1}`);

    if (type === "ton" || type === "tonyx") {
      const amt = Number(
        r.amount ??
          (r.minAmount != null && r.maxAmount != null && Number(r.minAmount) === Number(r.maxAmount)
            ? r.minAmount
            : r.minAmount ?? 0),
      );
      return {
        id,
        type,
        weight,
        minAmount: amt,
        maxAmount: amt,
        labelRu: r.labelRu != null ? String(r.labelRu) : undefined,
        labelEn: r.labelEn != null ? String(r.labelEn) : undefined,
        imageUrl: r.imageUrl != null ? String(r.imageUrl) : null,
      } satisfies CaseRewardItem;
    }

    const nftId = r.nftId != null ? String(r.nftId) : undefined;
    let pieceIndex: number | undefined;
    if (r.pieceIndex != null && r.pieceIndex !== "") {
      pieceIndex = Math.min(8, Math.max(0, Math.floor(Number(r.pieceIndex))));
    }
    return {
      id,
      type: type === "nft_full" ? "nft_full" : "nft_fragment",
      weight,
      nftId,
      pieceIndex,
      labelRu: r.labelRu != null ? String(r.labelRu) : undefined,
      labelEn: r.labelEn != null ? String(r.labelEn) : undefined,
      imageUrl: r.imageUrl != null ? String(r.imageUrl) : null,
    } satisfies CaseRewardItem;
  });
}

router.get("/cases", async (req: Request, res: Response) => {
  try {
    const adminId = getAdminId(req);
    if (!(await assertAdmin(adminId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const rows = await db
      .select()
      .from(miniCasesConfigTable)
      .orderBy(asc(miniCasesConfigTable.sortOrder));

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
    const rewards = sanitizeRewards(body.rewards);

    const totalW = rewards.reduce((s, x) => s + (x.weight || 0), 0);
    if (rewards.length > 0 && totalW <= 0) {
      res.status(400).json({ error: "Sum of reward weights must be > 0" });
      return;
    }

    for (const rw of rewards) {
      if ((rw.type === "nft_fragment" || rw.type === "nft_full") && !rw.nftId) {
        res.status(400).json({ error: "nftId required for NFT rewards" });
        return;
      }
    }

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

    console.log(
      `[admin/cases] upsert ${id} by ${adminId} rewards=${rewards.length} sumW=${totalW}`,
    );
    res.json({ ok: true, id, rewardsCount: rewards.length, totalWeight: totalW });
  } catch (err) {
    console.error("[admin/cases POST]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

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
