import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import usersRouter from "./users.js";
import adsRouter from "./ads.js";
import leaderboardRouter from "./leaderboard.js";
import referralsRouter from "./referrals.js";
import withdrawalsRouter from "./withdrawals.js";
import tasksRouter from "./tasks.js";
import achievementsRouter from "./achievements.js";
import bonusRouter from "./bonus.js";
import adminRouter from "./admin.js";
import pricesRouter from "./prices.js";
import miniRouter from "./mini/index.js";

const router: IRouter = Router();

router.use(healthRouter);
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
router.use("/mini", miniRouter);

export default router;
