import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, systemSettingsTable, miniUserInventoryTable, miniNftInventoryTable, miniUserBossKeysTable } from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

const router: IRouter = Router();
const OWNER_ID = "5956529124";

function extractAdminId(req: any, res: any): string | null {
  const fromLocals = (res.locals as any)?.verifiedTelegramId;
  if (fromLocals) return String(fromLocals);
  const h = req.headers["x-telegram-id"] || req.headers["x-admin-id"];
  if (h) return String(h);
  const b = req.body?.adminId;
  if (b) return String(b);
  return null;
}

function normalizeId(id: string | undefined): string {
  return String(id || "").trim();
}

async function ensureUser(telegramId: string) {
  let user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null);
  if (!user) {
    await db.insert(usersTable).values({ telegramId, ton: "0", tonyxCoins: 0 });
    user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null);
  }
  return user;
}

/** Admin: grant assembled Telegram gift NFT to a user (optionally list on market) */
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
    const valueTonRaw = Number(req.body?.valueTon ?? req.body?.estimatedTon);
    const valueTon = Number.isFinite(valueTonRaw) && valueTonRaw > 0 ? valueTonRaw
      : (Number.isFinite(priceTon) && priceTon > 0 ? priceTon : 0);
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
      kind: "tg_gift", real: true, valueTon,
    };
    if (giftNumber != null && Number.isFinite(giftNumber) && giftNumber > 0) {
      meta.giftNumber = giftNumber; meta.number = giftNumber;
    }
    if (list) {
      meta.listed = true; meta.priceTon = priceTon; meta.listedAt = new Date().toISOString();
      if (!meta.valueTon || Number(meta.valueTon) <= 0) meta.valueTon = priceTon;
    }
    const inserted = await db.insert(miniUserInventoryTable).values({
      telegramId: targetId, itemType: "nft_full", itemId: short, quantity: 1, meta,
    }).returning();
    console.log(`[Admin] ${adminId} grant-gift → ${targetId} ${short} / ${model} / ${backdrop} / ${symbol} list=${list}`);
    res.json({
      ok: true,
      message: list ? `NFT выдан и выставлен на маркет за ${priceTon} TON` : `NFT выдан пользователю ${targetId}`,
      item: inserted[0] ?? null, inventoryId: inserted[0]?.id ?? null,
    });
  } catch (e) {
    console.error("[grant-gift]", e);
    res.status(500).json({ error: String(e) });
  }
});

export default router;
