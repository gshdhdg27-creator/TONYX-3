import { createHmac } from "crypto";
import type { Request, Response, NextFunction } from "express";

const BYPASS_IN_DEV = process.env.NODE_ENV !== "production";

function verifyTelegramInitData(initData: string, botToken: string): boolean {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return false;

    params.delete("hash");

    const entries = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
    const expected = createHmac("sha256", secret).update(entries).digest("hex");

    return expected === hash;
  } catch {
    return false;
  }
}

export function requireInitData(req: Request, res: Response, next: NextFunction): void {
  if (BYPASS_IN_DEV) {
    next();
    return;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    next();
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

  if (!verifyTelegramInitData(initData, botToken)) {
    res.status(401).json({ error: "Invalid Telegram initData signature" });
    return;
  }

  next();
}
