import { Router, type IRouter } from "express";
import { getRoundState } from "./games-crash.js";
const router: IRouter = Router();
router.get("/settings/crash", async (_req, res) => {
  try { res.json(await getRoundState()); }
  catch (error) { console.error("[admin/crash]", error); res.status(500).json({ error: "Crash diagnostics unavailable" }); }
});
router.post("/settings/crash/force-next", (_req, res) => res.status(410).json({ error: "Manual Crash outcome overrides are permanently disabled" }));
router.post("/settings/crash/reset", (_req, res) => res.status(410).json({ error: "Crash round history cannot be reset" }));
export default router;
