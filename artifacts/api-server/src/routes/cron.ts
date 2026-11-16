/**
 * Vercel Cron routes — mounted at /api/cron/*
 * Protected by CRON_SECRET / x-vercel-cron.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { scanOnce } from "../services/depositScanner.js";
import { getBusinessConnection, creditGiftToInventory } from "../services/giftDeposit.js";

const router: IRouter = Router();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function authorizeCron(req: Request, res: Response): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = String(req.headers["authorization"] ?? "");
  const isVercelCron = String(req.headers["x-vercel-cron"] ?? "") === "1";

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}` && !isVercelCron) {
      res.status(401).json({ error: "Unauthorized" });
      return false;
    }
  } else if (!isVercelCron) {
    console.warn("[Cron] CRON_SECRET not set and not x-vercel-cron — endpoint disabled");
    res.status(503).json({ error: "Cron not configured (CRON_SECRET missing)" });
    return false;
  }
  return true;
}

async function handleScanDeposits(req: Request, res: Response): Promise<void> {
  if (!authorizeCron(req, res)) return;

  const startedAt = Date.now();
  console.log("[Cron] scan-deposits triggered", { method: req.method });

  try {
    await scanOnce();
    const durationMs = Date.now() - startedAt;
    console.log(`[Cron] scan-deposits completed in ${durationMs}ms`);
    res.json({ ok: true, durationMs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Cron] scan-deposits error:", msg);
    res.status(500).json({ error: msg });
  }
}

async function handleScanGifts(req: Request, res: Response): Promise<void> {
  if (!authorizeCron(req, res)) return;

  const startedAt = Date.now();
  const { connectionId, ownerId } = await getBusinessConnection();

  if (!connectionId || !ownerId) {
    res.json({
      ok: true,
      skipped: true,
      reason: "No business connection saved yet. Connect bot in Telegram Business first.",
    });
    return;
  }
  if (!BOT_TOKEN) {
    res.status(503).json({ error: "TELEGRAM_BOT_TOKEN missing" });
    return;
  }

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getBusinessAccountGifts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_connection_id: connectionId,
        exclude_unsaved: false,
        limit: 100,
      }),
    });
    const data = (await tgRes.json()) as {
      ok?: boolean;
      result?: { gifts?: Array<Record<string, unknown>> };
      description?: string;
    };

    if (!data.ok) {
      res.status(502).json({ error: data.description ?? "getBusinessAccountGifts failed" });
      return;
    }

    let credited = 0;
    let skipped = 0;
    for (const g of data.result?.gifts ?? []) {
      if ((g.type as string) !== "unique") continue;
      const gift = (g.gift as Record<string, unknown>) ?? {};
      const model = gift.model as Record<string, unknown> | undefined;
      const backdrop = gift.backdrop as Record<string, unknown> | undefined;
      const symbol = gift.symbol as Record<string, unknown> | undefined;
      const sender = g.sender_user as { id?: number } | undefined;

      const result = await creditGiftToInventory({
        creditToTelegramId: ownerId,
        baseName: (gift.base_name as string) ?? null,
        name: (gift.name as string) ?? null,
        number: typeof gift.number === "number" ? gift.number : null,
        model: (model?.name as string) ?? null,
        backdrop: (backdrop?.name as string) ?? null,
        symbol: (symbol?.name as string) ?? null,
        ownedGiftId: (g.owned_gift_id as string) ?? null,
        senderId: sender?.id != null ? String(sender.id) : null,
        source: "scan",
      });
      if (result.ok) credited++;
      else skipped++;
    }

    const durationMs = Date.now() - startedAt;
    console.log(`[Cron] scan-gifts credited=${credited} skipped=${skipped} ${durationMs}ms`);
    res.json({ ok: true, credited, skipped, durationMs, ownerId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Cron] scan-gifts error:", msg);
    res.status(500).json({ error: msg });
  }
}

router.get("/scan-deposits", (req, res) => {
  void handleScanDeposits(req, res);
});
router.post("/scan-deposits", (req, res) => {
  void handleScanDeposits(req, res);
});

router.get("/scan-gifts", (req, res) => {
  void handleScanGifts(req, res);
});
router.post("/scan-gifts", (req, res) => {
  void handleScanGifts(req, res);
});

export default router;
