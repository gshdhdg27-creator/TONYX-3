import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { systemSettingsTable, miniUserInventoryTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function normalizeId(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).trim();
}
function extractAdminId(req: import("express").Request, res: import("express").Response): string {
  const botToken = process.env["TELEGRAM_BOT_TOKEN"];
  if (botToken) {
    return normalizeId((res.locals as Record<string, unknown>)["verifiedTelegramId"]);
  }
  return normalizeId(req.query.adminId ?? req.body?.adminId ?? req.headers["x-admin-id"]);
}

async function getSettingMap(): Promise<Record<string, string>> {
  const rows = await db.select().from(systemSettingsTable);
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;
  return s;
}

async function upsertSetting(key: string, value: string) {
  const existing = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, key));
  if (existing.length > 0) {
    await db.update(systemSettingsTable).set({ value, updatedAt: new Date() }).where(eq(systemSettingsTable.key, key));
  } else {
    await db.insert(systemSettingsTable).values({ key, value });
  }
}

router.get("/settings/nft-market", async (_req, res) => {
  try {
    const s = await getSettingMap();
    res.json({
      enabled: (s["nft_market_enabled"] ?? "1") !== "0",
      buyEnabled: (s["nft_market_buy_enabled"] ?? "0") === "1",
      feePercent: parseFloat(s["nft_market_fee_pct"] ?? "1") || 1,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/settings/nft-market", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const body = req.body ?? {};
    if (body.enabled !== undefined) {
      await upsertSetting("nft_market_enabled", body.enabled ? "1" : "0");
    }
    if (body.buyEnabled !== undefined) {
      await upsertSetting("nft_market_buy_enabled", body.buyEnabled ? "1" : "0");
    }
    if (body.feePercent !== undefined) {
      const fee = Math.max(0, Math.min(20, Number(body.feePercent) || 0));
      await upsertSetting("nft_market_fee_pct", String(fee));
    }
    const s = await getSettingMap();
    res.json({
      ok: true,
      message: "NFT Market settings saved",
      enabled: (s["nft_market_enabled"] ?? "1") !== "0",
      buyEnabled: (s["nft_market_buy_enabled"] ?? "0") === "1",
      feePercent: parseFloat(s["nft_market_fee_pct"] ?? "1") || 1,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/nft-market/listings", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const rows = await db.select().from(miniUserInventoryTable);
    const listings = [];
    for (const it of rows) {
      const m = (it.meta ?? {}) as Record<string, unknown>;
      if (!m.listed) continue;
      listings.push({
        id: it.id,
        sellerId: it.telegramId,
        nftId: it.itemId,
        itemType: it.itemType,
        giftName: m.giftName ?? m.nameRu ?? it.itemId,
        model: m.model ?? null,
        backdrop: m.backdrop ?? null,
        symbol: m.symbol ?? null,
        imageUrl: m.imageUrl ?? null,
        priceTon: Number(m.priceTon) || 0,
        listedAt: m.listedAt ?? it.acquiredAt,
        meta: m,
      });
    }
    listings.sort((a, b) => String(b.listedAt).localeCompare(String(a.listedAt)));
    res.json({ listings, count: listings.length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/nft-market/unlist", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const inventoryId = Number(req.body?.inventoryId ?? req.body?.id);
    if (!inventoryId) {
      res.status(400).json({ error: "inventoryId required" });
      return;
    }
    const item = await db
      .select()
      .from(miniUserInventoryTable)
      .where(eq(miniUserInventoryTable.id, inventoryId))
      .then((r) => r[0] ?? null);
    if (!item) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const meta = { ...(item.meta ?? {}) } as Record<string, unknown>;
    delete meta.listed;
    delete meta.priceTon;
    delete meta.listedAt;
    meta.adminUnlistedBy = adminId;
    meta.adminUnlistedAt = new Date().toISOString();
    await db.update(miniUserInventoryTable).set({ meta }).where(eq(miniUserInventoryTable.id, item.id));
    res.json({ ok: true, message: "Снято с продажи", id: item.id });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/nft-market/unlist-all", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const rows = await db.select().from(miniUserInventoryTable);
    let n = 0;
    for (const it of rows) {
      const m = (it.meta ?? {}) as Record<string, unknown>;
      if (!m.listed) continue;
      const meta = { ...m };
      delete meta.listed;
      delete meta.priceTon;
      delete meta.listedAt;
      meta.adminUnlistedBy = adminId;
      meta.adminUnlistedAt = new Date().toISOString();
      await db.update(miniUserInventoryTable).set({ meta }).where(eq(miniUserInventoryTable.id, it.id));
      n++;
    }
    res.json({ ok: true, message: `Снято с продажи: ${n}`, count: n });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/nft-market/listing/:id", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const id = Number(req.params.id);
    if (!id) {
      res.status(400).json({ error: "id required" });
      return;
    }
    const item = await db
      .select()
      .from(miniUserInventoryTable)
      .where(eq(miniUserInventoryTable.id, id))
      .then((r) => r[0] ?? null);
    if (!item) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db.delete(miniUserInventoryTable).where(eq(miniUserInventoryTable.id, id));
    console.log(`[Admin] ${adminId} deleted inventory item ${id} nft=${item.itemId} seller=${item.telegramId}`);
    res.json({ ok: true, message: "Удалено", id });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
