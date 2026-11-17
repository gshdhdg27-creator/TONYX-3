import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniUserInventoryTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";

const router: IRouter = Router();
const PVP_OWNER = "SYSTEM_PVP_SPIN";

function normalizeId(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).trim();
}
function extractAdminId(req: import("express").Request, res: import("express").Response): string {
  const verified = normalizeId((res.locals as Record<string, unknown>)["verifiedTelegramId"]);
  if (verified) return verified;
  return normalizeId(req.query.adminId ?? req.body?.adminId ?? req.headers["x-admin-id"]);
}

async function ensureUser(telegramId: string) {
  let user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null);
  if (user) return user;
  await db.insert(usersTable).values({ telegramId, ton: "0", tonyxCoins: 0, coins: 0 });
  return db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null);
}

router.get("/pvp-gifts", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const rows = await db
      .select()
      .from(miniUserInventoryTable)
      .where(eq(miniUserInventoryTable.telegramId, PVP_OWNER))
      .orderBy(desc(miniUserInventoryTable.acquiredAt));
    const items = rows.map((it) => {
      const m = (it.meta ?? {}) as Record<string, unknown>;
      return {
        id: it.id,
        itemId: it.itemId,
        itemType: it.itemType,
        name: (m.giftName as string) || it.itemId,
        imageUrl: (m.modelImageUrl as string) || (m.imageUrl as string) || null,
        model: m.model ?? null,
        backdrop: m.backdrop ?? null,
        symbol: m.symbol ?? null,
        fromPlayer: m.fromPlayer ?? null,
        spinRoundId: m.spinRoundId ?? null,
        game: m.game ?? "spin",
        source: m.source ?? null,
        acquiredAt: it.acquiredAt,
      };
    });
    res.json({ ok: true, count: items.length, items });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/pvp-gifts/claim", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const inventoryId = Number(req.body?.inventoryId);
    const toId = normalizeId(req.body?.toTelegramId ?? adminId);
    if (!Number.isFinite(inventoryId) || inventoryId <= 0) {
      res.status(400).json({ error: "inventoryId required" }); return;
    }
    const item = await db
      .select()
      .from(miniUserInventoryTable)
      .where(and(eq(miniUserInventoryTable.id, inventoryId), eq(miniUserInventoryTable.telegramId, PVP_OWNER)))
      .then((r) => r[0] ?? null);
    if (!item) { res.status(404).json({ error: "Not found in PvP pool" }); return; }
    await ensureUser(toId);
    const m = { ...(item.meta ?? {}), source: "pvp_admin_claim", claimedBy: adminId, claimedAt: new Date().toISOString() };
    await db.update(miniUserInventoryTable).set({ telegramId: toId, meta: m, acquiredAt: new Date() }).where(eq(miniUserInventoryTable.id, item.id));
    res.json({ ok: true, message: `Gift #${item.id} → ${toId}`, inventoryId: item.id });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
