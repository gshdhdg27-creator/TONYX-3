import { Router, type IRouter } from "express";
import earnRouter from "./earn.js";
import marketRouter from "./market.js";
import spinRouter from "./games-spin.js";
import minesRouter from "./games-mines.js";
import coinRouter from "./games-coin.js";
import arenaRouter from "./games-arena.js";
import igroRouter from "./games-igro.js";
import crashRouter from "./games-crash.js";
import plinkoRouter from "./games-plinko.js";
import upgradeRouter from "./games-upgrade.js";
import pickaxeRouter from "./games-pickaxe.js";
import diceRouter from "./games-dice.js";
import rouletteRouter from "./games-roulette.js";
import tasksRouter from "./tasks.js";
import financeRouter from "./finance.js";
import leaderboardRouter from "./leaderboard.js";
import marketPoolRouter from "./market-pool.js";
import historyRouter from "./history.js";
import adminRouter, { checkAdmin } from "./admin.js";
import adminCrashRouter from "./admin-crash.js";
import adminExtraRouter from "./admin-extra.js";
import adminPvpRouter from "./admin-pvp.js";
import adminTwinsRouter from "./admin-twins.js";
import adminNftMarketRouter from "./admin-nft-market.js";
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
import usersRouter from "../users.js";
import referralsRouter from "../referrals.js";

const router: IRouter = Router();

// Public diagnostic: no Telegram auth (does not expose secrets)
router.use((req, res, next) => {
  if (req.method === "GET" && (
    req.path === "/wallet/status" ||
    req.path.endsWith("/wallet/status") ||
    req.path === "/admin/settings/games-enabled"
  )) {
    next();
    return;
  }
  return telegramAuthMiddleware(req, res, next);
});

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

router.use("/users", usersRouter);
router.use("/referrals", referralsRouter);

router.use("/language", languageRouter);
router.use("/wallet", walletRouter);
router.use("/earn", earnRouter);
router.use("/market", marketRouter);

router.use("/games/spin", limitPlay, spinRouter);
router.use("/games/mines", limitPlay, minesRouter);
router.use("/games/coin", limitPlay, coinRouter);
router.use("/games/arena", limitJoin, arenaRouter);
router.use("/games/igro", limitPlay, igroRouter);
router.use("/games/crash", limitPlay, crashRouter);
router.use("/games/plinko", limitPlay, plinkoRouter);
router.use("/games/upgrade", limitPlay, upgradeRouter);
router.use("/games/pickaxe", limitPlay, pickaxeRouter);
router.use("/games/dice", limitPlay, diceRouter);
router.use("/games/roulette", limitPlay, rouletteRouter);

router.use("/tasks", tasksRouter);
router.use("/investments", investmentsRouter);
router.use("/boosts", boostsRouter);
router.use("/", limitFinance, financeRouter);
router.use("/", leaderboardRouter);
router.use("/", marketPoolRouter);
router.use("/battle", battleRouter);
router.use("/", historyRouter);
// Enforce server-side administrator authorization for every /admin route.
// Telegram identity is verified by telegramAuthMiddleware above; never trust a client-supplied adminId.
router.use("/admin", async (req, res, next) => {
  // Public read-only switchboard: the Mini App needs to know which games are enabled.
  if (req.method === "GET" && req.path === "/admin/settings/games-enabled") {
    next();
    return;
  }
  const verifiedId = String((res.locals as Record<string, unknown>)["verifiedTelegramId"] ?? "");
  if (!verifiedId) {
    res.status(401).json({ error: "Telegram authentication required" });
    return;
  }
  try {
    if (!(await checkAdmin(verifiedId))) {
      res.status(403).json({ error: "Administrator access required" });
      return;
    }
    next();
  } catch (error) {
    console.error("[Admin] authorization failed", error);
    res.status(500).json({ error: "Unable to verify administrator access" });
  }
});

router.use("/admin", limitAdmin, adminRouter);
router.use("/admin", limitAdmin, adminCrashRouter);
router.use("/admin", limitAdmin, adminExtraRouter);
router.use("/admin", limitAdmin, adminPvpRouter);
router.use("/admin", limitAdmin, adminTwinsRouter);
router.use("/admin", limitAdmin, adminNftMarketRouter);
router.use("/cases", limitPlay, casesRouter);
router.use("/admin", limitAdmin, adminCasesRouter);
router.use("/inventory", inventoryRouter);

export default router;
