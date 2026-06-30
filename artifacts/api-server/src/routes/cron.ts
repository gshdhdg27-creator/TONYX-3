/**
 * Vercel Cron routes — mounted at /api/cron/*
 * These routes bypass telegramAuthMiddleware entirely.
 * Protected by CRON_SECRET environment variable.
 *
 * Vercel calls POST /api/cron/scan-deposits on the schedule
 * defined in vercel.json → crons[].
 */

import { Router, type IRouter } from "express";
import { scanOnce } from "../services/depositScanner.js";

const router: IRouter = Router();

/* ─────────────────────────────────────────────────────────────────
   POST /cron/scan-deposits
   Triggered by Vercel Cron every minute (see vercel.json).
   Runs one deposit-scan pass: fetches recent TON blockchain txs,
   deduplicates by txHash, and credits matching user balances.

   Security: Bearer token from CRON_SECRET env var.
   Vercel automatically sends the secret as:
     Authorization: Bearer <CRON_SECRET>
   when CRON_SECRET is set in Project → Settings → Environment Variables.
──────────────────────────────────────────────────────────────────── */
router.post("/scan-deposits", async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn("[Cron] /scan-deposits: CRON_SECRET not set — endpoint disabled");
    res.status(503).json({ error: "Cron not configured (CRON_SECRET missing)" });
    return;
  }

  const authHeader = String(req.headers["authorization"] ?? "");
  if (authHeader !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const startedAt = Date.now();
  console.log("[Cron] scan-deposits triggered");

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
});

export default router;
