/**
 * Vercel Cron routes — mounted at /api/cron/*
 * These routes bypass telegramAuthMiddleware entirely.
 * Protected by CRON_SECRET environment variable.
 *
 * Vercel Cron sends GET /api/cron/scan-deposits on the schedule
 * defined in vercel.json → crons[].
 * We also accept POST for manual triggers.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { scanOnce } from "../services/depositScanner.js";

const router: IRouter = Router();

async function handleScanDeposits(req: Request, res: Response): Promise<void> {
  const cronSecret = process.env.CRON_SECRET;

  // Prefer explicit CRON_SECRET. Vercel also sends x-vercel-cron: 1 on scheduled runs.
  const authHeader = String(req.headers["authorization"] ?? "");
  const isVercelCron = String(req.headers["x-vercel-cron"] ?? "") === "1";

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}` && !isVercelCron) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  } else if (!isVercelCron) {
    // No secret configured and not a Vercel cron invocation — refuse external calls.
    console.warn("[Cron] /scan-deposits: CRON_SECRET not set and not x-vercel-cron — endpoint disabled");
    res.status(503).json({ error: "Cron not configured (CRON_SECRET missing)" });
    return;
  }

  const startedAt = Date.now();
  console.log("[Cron] scan-deposits triggered", { method: req.method, isVercelCron });

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

/* GET — Vercel Cron default method */
router.get("/scan-deposits", (req, res) => {
  void handleScanDeposits(req, res);
});

/* POST — manual / legacy triggers */
router.post("/scan-deposits", (req, res) => {
  void handleScanDeposits(req, res);
});

export default router;
