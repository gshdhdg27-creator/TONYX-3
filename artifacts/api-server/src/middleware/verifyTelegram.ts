import { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60; // 24 hours

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

function getAuthDate(initData: string): number | null {
  try {
    const params = new URLSearchParams(initData);
    const authDate = params.get("auth_date");
    if (!authDate) return null;
    const ts = Number(authDate);
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
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
  const isProduction = process.env["NODE_ENV"] === "production";

  // In production we ALWAYS require a valid bot token
  if (!botToken) {
    if (isProduction) {
      console.error("[Auth] TELEGRAM_BOT_TOKEN is missing in production");
      res.status(500).json({ error: "Server misconfiguration" });
      return;
    }
    // Dev without token — allow (for local testing)
    next();
    return;
  }

  const initData = req.headers["x-telegram-init-data"] as string | undefined;

  if (!initData) {
    if (!isProduction) {
      // Dev mode: allow missing initData
      next();
      return;
    }
    console.warn(`[Auth] Missing x-telegram-init-data on ${req.method} ${req.path}`);
    res.status(401).json({ error: "Missing Telegram auth" });
    return;
  }

  // 1. Verify signature
  if (!verifyInitData(initData, botToken)) {
    console.warn(`[Auth] Invalid Telegram signature on ${req.method} ${req.path}`);
    res.status(401).json({ error: "Invalid Telegram signature" });
    return;
  }

  // 2. Check auth_date (not older than 24 hours)
  const authDate = getAuthDate(initData);
  if (authDate === null) {
    console.warn(`[Auth] Missing auth_date on ${req.method} ${req.path}`);
    res.status(401).json({ error: "Invalid Telegram auth_date" });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > MAX_AUTH_AGE_SECONDS) {
    console.warn(
      `[Auth] Expired auth_date on ${req.method} ${req.path} (age: ${now - authDate}s)`,
    );
    res.status(401).json({ error: "Telegram auth expired" });
    return;
  }

  // 3. Extract and attach verified telegramId
  const verifiedId = parseVerifiedTelegramId(initData);
  if (!verifiedId) {
    console.warn(`[Auth] Could not parse user id on ${req.method} ${req.path}`);
    res.status(401).json({ error: "Invalid Telegram user data" });
    return;
  }

  (res.locals as Record<string, unknown>)["verifiedTelegramId"] = verifiedId;
  next();
}
