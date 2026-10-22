import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
/** @deprecated legacy coins/points era — confirm frontend hooks before removal */
import usersRouter from "./users.js";
/** @deprecated */
import adsRouter from "./ads.js";
/** @deprecated */
import leaderboardRouter from "./leaderboard.js";
/** @deprecated — may still be used by referrals UI */
import referralsRouter from "./referrals.js";
/** @deprecated */
import withdrawalsRouter from "./withdrawals.js";
/** @deprecated */
import tasksRouter from "./tasks.js";
/** @deprecated */
import achievementsRouter from "./achievements.js";
/** @deprecated */
import bonusRouter from "./bonus.js";
/** @deprecated prefer /api/mini/admin */
import adminRouter from "./admin.js";
import pricesRouter from "./prices.js";
/** Current product API surface */
import miniRouter from "./mini/index.js";
import webhooksRouter from "./webhooks.js";
import cronRouter from "./cron.js";

const router: IRouter = Router();

// Cron routes have no auth middleware — protected by CRON_SECRET instead.
router.use("/cron", cronRouter);
router.use("/webhooks", webhooksRouter);
router.use(healthRouter);

// ── Legacy tree (do not extend; migrate callers to /mini) ───────────────
router.use("/users", usersRouter);
router.use("/ads", adsRouter);
router.use("/leaderboard", leaderboardRouter);
router.use("/referrals", referralsRouter);
router.use("/withdrawals", withdrawalsRouter);
router.use("/tasks", tasksRouter);
router.use("/achievements", achievementsRouter);
router.use("/bonus", bonusRouter);
router.use("/admin", adminRouter);
router.use("/prices", pricesRouter);

// ── Mini / current product ─────────────────────────────────────────────
router.use("/mini", miniRouter);

export default router;
