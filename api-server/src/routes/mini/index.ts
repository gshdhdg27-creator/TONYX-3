import { Router, type IRouter } from "express";
import earnRouter from "./earn";
import marketRouter from "./market";
import spinRouter from "./games-spin";
import minesRouter from "./games-mines";
import arenaRouter from "./games-arena";
import tasksRouter from "./tasks";
import financeRouter from "./finance";
import leaderboardRouter from "./leaderboard";
import marketPoolRouter from "./market-pool";
import historyRouter from "./history";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use("/earn", earnRouter);
router.use("/market", marketRouter);
router.use("/games/spin", spinRouter);
router.use("/games/mines", minesRouter);
router.use("/games/arena", arenaRouter);
router.use("/tasks", tasksRouter);
router.use("/", financeRouter);
router.use("/", leaderboardRouter);
router.use("/", marketPoolRouter);
router.use("/", historyRouter);
router.use("/admin", adminRouter);

export default router;
