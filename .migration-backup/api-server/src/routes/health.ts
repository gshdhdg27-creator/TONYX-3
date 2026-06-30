import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Debug endpoint — shows env/config status without exposing secret values
// Useful for diagnosing Vercel production issues
router.get("/api-debug", (_req, res) => {
  const hasNeonDb = !!process.env["NEON_DATABASE_URL"];
  const hasDbUrl = !!process.env["DATABASE_URL"];
  const hasBotToken = !!process.env["TELEGRAM_BOT_TOKEN"];
  const nodeEnv = process.env["NODE_ENV"] ?? "not set";

  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: nodeEnv,
      NEON_DATABASE_URL: hasNeonDb ? "✅ set" : "❌ MISSING — set this in Vercel env vars!",
      DATABASE_URL: hasDbUrl ? "✅ set" : "❌ not set",
      TELEGRAM_BOT_TOKEN: hasBotToken ? "✅ set" : "⚠️ not set (auth bypassed)",
      db_connected: hasNeonDb || hasDbUrl ? "postgres (neon)" : "❌ PGlite fallback (empty in-memory)",
    },
    instructions: (!hasNeonDb && !hasDbUrl)
      ? "ACTION REQUIRED: Go to Vercel Dashboard → your project → Settings → Environment Variables → add NEON_DATABASE_URL"
      : "Config looks good",
  });
});

export default router;
