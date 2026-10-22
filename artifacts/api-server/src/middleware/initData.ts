import type { Request, Response, NextFunction } from "express";
import { verifyInitData } from "./verifyTelegram.js";

/**
 * @deprecated Prefer `telegramAuthMiddleware` from `./verifyTelegram.js`
 * which also binds verifiedTelegramId and checks auth_date.
 * Kept for any residual imports.
 */
const BYPASS_IN_DEV = process.env.NODE_ENV !== "production";

export function requireInitData(req: Request, res: Response, next: NextFunction): void {
  if (BYPASS_IN_DEV) {
    next();
    return;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    res.status(500).json({ error: "Server misconfiguration" });
    return;
  }

  const initData =
    (req.headers["x-telegram-init-data"] as string | undefined) ??
    (req.query.initData as string | undefined) ??
    (req.body?.initData as string | undefined);

  if (!initData) {
    res.status(401).json({ error: "Missing Telegram initData" });
    return;
  }

  if (!verifyInitData(initData, botToken)) {
    res.status(401).json({ error: "Invalid Telegram initData signature" });
    return;
  }

  next();
}
