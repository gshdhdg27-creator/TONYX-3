/**
 * Vercel Cron routes — mounted at /api/cron/*
 * Protected by CRON_SECRET / x-vercel-cron.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { scanOnce } from "../services/depositScanner.js";
import { scanBusinessGifts } from "../services/giftDeposit.js";

const router: IRouter = Router();

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
  try {
    await scanOnce();
    res.json({ ok: true, durationMs: Date.now() - startedAt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Cron] scan-deposits error:", msg);
    res.status(500).json({ error: msg });
  }
}

async function handleScanGifts(req: Request, res: Response): Promise<void> {
  if (!authorizeCron(req, res)) return;

  const startedAt = Date.now();
  try {
    const result = await scanBusinessGifts();
    res.json({ ...result, durationMs: Date.now() - startedAt });
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
