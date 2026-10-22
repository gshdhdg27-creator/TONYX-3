import { Router, type IRouter } from "express";
import earnRouter from "./earn.js";
import marketRouter from "./market.js";
import spinRouter from "./games-spin.js";
import minesRouter from "./games-mines.js";
import coinRouter from "./games-coin.js";
import arenaRouter from "./games-arena.js";
import igroRouter from "./games-igro.js";
import tasksRouter from "./tasks.js";
import financeRouter from "./finance.js";
import leaderboardRouter from "./leaderboard.js";
import marketPoolRouter from "./market-pool.js";
import historyRouter from "./history.js";
import adminRouter from "./admin.js";
import investmentsRouter from "./investments.js";
import boostsRouter from "./boosts.js";
import languageRouter from "./language.js";
import walletRouter from "./wallet.js";
import { telegramAuthMiddleware } from "../../middleware/verifyTelegram.js";
import {
  limitJoin,
  limitPlay,
  limitFinance,
  limitAdmin,
} from "../../middleware/rateLimit.js";
import battleRouter from "./battle.js";
import casesRouter from "./cases.js";
import adminCasesRouter from "./admin-cases.js";
import inventoryRouter from "./inventory.js";

const router: IRouter = Router();

router.use(telegramAuthMiddleware);

router.use((req, res, next) => {
  const verifiedId = (res.locals as Record<string, unknown>)["verifiedTelegramId"] as
    | string
    | undefined;
  if (!verifiedId) {
    next();
    return;
  }
  if (req.path.startsWith("/admin")) {
    next();
    return;
  }

  const sources: Array<string | undefined> = [
    req.body?.telegramId as string | undefined,
    req.query.telegramId as string | undefined,
    req.params.telegramId as string | undefined,
  ];

  for (const supplied of sources) {
    if (supplied && String(supplied) !== verifiedId) {
      res.status(403).json({
        error: "Forbidden: supplied telegramId does not match authenticated user",
      });
      return;
    }
  }
  next();
});

router.use("/language", languageRouter);
router.use("/wallet", walletRouter);
router.use("/earn", earnRouter);
router.use("/market", marketRouter);

// Games — play/join rate limits
router.use("/games/spin", limitPlay, spinRouter);
router.use("/games/mines", limitPlay, minesRouter);
router.use("/games/coin", limitPlay, coinRouter);
router.use("/games/arena", limitJoin, arenaRouter);
router.use("/games/igro", limitPlay, igroRouter);

router.use("/tasks", tasksRouter);
router.use("/investments", investmentsRouter);
router.use("/boosts", boostsRouter);
router.use("/", limitFinance, financeRouter);
router.use("/", leaderboardRouter);
router.use("/", marketPoolRouter);
router.use("/battle", battleRouter);
router.use("/", historyRouter);
router.use("/admin", limitAdmin, adminRouter);
router.use("/cases", limitPlay, casesRouter);
router.use("/admin", limitAdmin, adminCasesRouter);
router.use("/inventory", inventoryRouter);

export default router;
