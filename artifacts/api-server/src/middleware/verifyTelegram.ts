import { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";

function verifyInitData(initData: string, botToken: string): boolean {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return false;
    params.delete("hash");

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    const expectedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(hash.padEnd(64, "0"), "hex"),
      Buffer.from(expectedHash, "hex"),
    );
  } catch {
    return false;
  }
}

export function parseVerifiedTelegramId(initData: string): string | null {
  try {
    const params = new URLSearchParams(initData);
    const userStr = params.get("user");
    if (!userStr) return null;
    const user = JSON.parse(userStr) as { id?: number | string };
    return user.id ? String(user.id) : null;
  } catch {
    return null;
  }
}

export function telegramAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const botToken = process.env["TELEGRAM_BOT_TOKEN"];

  if (!botToken) {
    next();
    return;
  }

  const initData = req.headers["x-telegram-init-data"] as string | undefined;

  if (!initData) {
    if (process.env["NODE_ENV"] !== "production") {
      next();
      return;
    }
    console.warn(`[Auth] Missing x-telegram-init-data header on ${req.method} ${req.path}`);
    res.status(401).json({ error: "Missing Telegram auth" });
    return;
  }

  if (!verifyInitData(initData, botToken)) {
    console.warn(`[Auth] Invalid Telegram signature on ${req.method} ${req.path} — initData length: ${initData.length}`);
    res.status(401).json({ error: "Invalid Telegram signature" });
    return;
  }

  const verifiedId = parseVerifiedTelegramId(initData);
  if (verifiedId) {
    res.locals["verifiedTelegramId"] = verifiedId;
  }

  next();
}
