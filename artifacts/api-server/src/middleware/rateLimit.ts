import type { Request, Response, NextFunction } from "express";

/**
 * Lightweight in-memory rate limiter (per process).
 * For multi-instance production, replace with Redis (Priority 1–2).
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const CLEAN_EVERY = 500;
let ops = 0;

function keyOf(req: Request, scope: string): string {
  const verified = (req.res?.locals as Record<string, unknown> | undefined)?.[
    "verifiedTelegramId"
  ] as string | undefined;
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.ip ||
    "unknown";
  return `${scope}:${verified || ip}`;
}

export function rateLimit(opts: {
  scope: string;
  /** Max requests in the window */
  max: number;
  /** Window length in ms */
  windowMs: number;
}) {
  const { scope, max, windowMs } = opts;
  return (req: Request, res: Response, next: NextFunction): void => {
    ops += 1;
    if (ops % CLEAN_EVERY === 0) {
      const now = Date.now();
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k);
      }
    }

    const key = keyOf(req, scope);
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count += 1;

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - b.count)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(b.resetAt / 1000)));

    if (b.count > max) {
      res.status(429).json({
        error: "Too many requests",
        retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
      });
      return;
    }
    next();
  };
}

/** Presets for sensitive money paths */
export const limitJoin = rateLimit({ scope: "join", max: 30, windowMs: 60_000 });
export const limitPlay = rateLimit({ scope: "play", max: 60, windowMs: 60_000 });
export const limitFinance = rateLimit({ scope: "finance", max: 20, windowMs: 60_000 });
export const limitAdmin = rateLimit({ scope: "admin", max: 120, windowMs: 60_000 });
