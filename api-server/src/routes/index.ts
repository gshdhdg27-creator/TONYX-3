import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import adsRouter from "./ads";
import leaderboardRouter from "./leaderboard";
import referralsRouter from "./referrals";
import withdrawalsRouter from "./withdrawals";
import tasksRouter from "./tasks";
import achievementsRouter from "./achievements";
import bonusRouter from "./bonus";
import adminRouter from "./admin";
import pricesRouter from "./prices";
import miniRouter from "./mini/index";

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
