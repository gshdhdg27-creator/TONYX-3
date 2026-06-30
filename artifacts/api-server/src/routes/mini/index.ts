import { Router, type IRouter } from "express";
import earnRouter from "./earn.js";
import marketRouter from "./market.js";
import spinRouter from "./games-spin.js";
import minesRouter from "./games-mines.js";
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

const router: IRouter = Router();

// Step 1: Verify Telegram initData and attach verifiedTelegramId to res.locals.
router.use(telegramAuthMiddleware);

// Step 2: Identity binding — in production, reject requests where any client-supplied
// telegramId doesn't match the cryptographically verified identity.
// This prevents IDOR: one authenticated user acting on another user's account.
// Admin routes are excluded because admins legitimately operate on other users' accounts
// (and admin access is itself verified via res.locals.verifiedTelegramId).
router.use((req, res, next) => {
  const verifiedId = (res.locals as Record<string, unknown>)["verifiedTelegramId"] as string | undefined;
  // Dev mode or no BOT_TOKEN — no verified identity to compare against, skip enforcement.
  if (!verifiedId) { next(); return; }
  // Admin routes have their own identity enforcement.
  if (req.path.startsWith("/admin")) { next(); return; }

  // Check all common sources of telegramId in the request.
  const sources: Array<string | undefined> = [
    req.body?.telegramId as string | undefined,
    req.query.telegramId as string | undefined,
    req.params.telegramId as string | undefined,
  ];

  for (const supplied of sources) {
    if (supplied && String(supplied) !== verifiedId) {
      res.status(403).json({ error: "Forbidden: supplied telegramId does not match authenticated user" });
      return;
    }
  }
  next();
});

router.use("/language", languageRouter);
router.use("/wallet", walletRouter);
router.use("/earn", earnRouter);
router.use("/market", marketRouter);
router.use("/games/spin", spinRouter);
router.use("/games/mines", minesRouter);
router.use("/games/arena", arenaRouter);
router.use("/games/igro", igroRouter);
router.use("/tasks", tasksRouter);
router.use("/investments", investmentsRouter);
router.use("/boosts", boostsRouter);
router.use("/", financeRouter);
router.use("/", leaderboardRouter);
router.use("/", marketPoolRouter);
router.use("/", historyRouter);
router.use("/admin", adminRouter);

export default router;
