import { Router, type IRouter } from "express";

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
  return normalizeId(
    req.query.adminId ?? req.body?.adminId ?? req.headers["x-admin-id"]
  );
}

/** GET /admin/settings/crash */
router.get("/settings/crash", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) {
    res.status(401).json({ error: "adminId required" });
    return;
  }
  try {
    const { getRoundState, resolveCrash } = await import("./games-crash.js");
    const st = await getRoundState();
    const nextId = st.phase === "betting" ? st.roundId : st.roundId + 1;
    const nextCrash = await resolveCrash(nextId);
    res.json({ ...st, nextRoundId: nextId, nextCrashPreview: nextCrash });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "crash state failed" });
  }
});

/** POST /admin/settings/crash/force-next  body: { mult } */
router.post("/settings/crash/force-next", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) {
    res.status(401).json({ error: "adminId required" });
    return;
  }
  try {
    const mult = Number(req.body?.mult);
    if (!Number.isFinite(mult) || mult < 1 || mult > 100) {
      res.status(400).json({ error: "mult must be 1–100" });
      return;
    }
    const { getRoundState, setCrashOverride } = await import("./games-crash.js");
    const st = await getRoundState();
    const target = st.phase === "betting" ? st.roundId : st.roundId + 1;
    await setCrashOverride(target, mult);
    res.json({
      ok: true,
      message: `Коэффициент ${mult}x для раунда #${target}`,
      targetRoundId: target,
      mult,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "force failed" });
  }
});

/** POST /admin/settings/crash/reset — sequential rounds back to #1 */
router.post("/settings/crash/reset", async (req, res) => {
  const adminId = extractAdminId(req, res);
  if (!adminId) {
    res.status(401).json({ error: "adminId required" });
    return;
  }
  try {
    const { resetCrashRounds, getRoundState } = await import("./games-crash.js");
    await resetCrashRounds();
    const st = await getRoundState();
    res.json({ ok: true, message: "Раунды сброшены — снова с #1", ...st });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "reset failed" });
  }
});

export default router;
