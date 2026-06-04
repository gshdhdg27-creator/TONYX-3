import { Router, type IRouter } from "express";
import earnRouter from "./earn.js";
import marketRouter from "./market.js";
import spinRouter from "./games-spin.js";
import minesRouter from "./games-mines.js";
import arenaRouter from "./games-arena.js";
import tasksRouter from "./tasks.js";
import financeRouter from "./finance.js";
import leaderboardRouter from "./leaderboard.js";
import marketPoolRouter from "./market-pool.js";
import historyRouter from "./history.js";
import adminRouter from "./admin.js";
import investmentsRouter from "./investments.js";
import boostsRouter from "./boosts.js";
import languageRouter from "./language.js";

const router: IRouter = Router();

router.use("/language", languageRouter);
router.use("/earn", earnRouter);
router.use("/market", marketRouter);
router.use("/games/spin", spinRouter);
router.use("/games/mines", minesRouter);
router.use("/games/arena", arenaRouter);
router.use("/tasks", tasksRouter);
router.use("/investments", investmentsRouter);
router.use("/boosts", boostsRouter);
router.use("/", financeRouter);
router.use("/", leaderboardRouter);
router.use("/", marketPoolRouter);
router.use("/", historyRouter);
router.use("/admin", adminRouter);

export default router;
