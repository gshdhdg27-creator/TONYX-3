import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import {
  RegisterUserBody,
  GetUserProfileParams,
} from "@workspace/api-zod";
import { eq, isNull } from "drizzle-orm";

const router: IRouter = Router();

const COINS_PER_REFERRAL = 500;

/* ─── Deposit code generator ────────────────────────────────────────────────
   12 uppercase alphanumeric chars, no ambiguous chars (0/O, 1/I).
   Collision probability ≈ 1 in 3.5 trillion — effectively zero.
──────────────────────────────────────────────────────────────────────────── */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateDepositCode(): string {
  const bytes = crypto.randomBytes(12);
  let code = "";
  for (let i = 0; i < 12; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

/** Generates a code that doesn't already exist in the DB (retries on collision). */
async function makeUniqueDepositCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateDepositCode();
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.depositCode, code));
    if (!existing.length) return code;
  }
  // Fallback: longer code to guarantee uniqueness
  return generateDepositCode() + generateDepositCode().slice(0, 4);
}

function getClientIp(req: import("express").Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return (Array.isArray(fwd) ? fwd[0] : fwd).split(",")[0].trim();
  return req.socket?.remoteAddress ?? null;
}

async function getReferralCount(telegramId: string): Promise<number> {
  const referrals = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.referredBy, telegramId));
  return referrals.length;
}

function userResponse(user: typeof usersTable.$inferSelect, totalReferrals: number) {
  return {
    id: user.id,
    telegramId: user.telegramId,
    username: user.username ?? undefined,
    firstName: user.firstName ?? undefined,
    photoUrl: user.photoUrl ?? undefined,
    coins: user.coins,
    ton: Number(user.ton),
    tonyxCoins: user.tonyxCoins,
    boostRate: Number(user.boostRate ?? 0),
    totalAdsWatched: user.totalAdsWatched,
    totalReferrals,
    isBlocked: user.isBlocked,
    isAdmin: user.isAdmin,
    depositCode: user.depositCode ?? undefined,
    createdAt: user.createdAt.toISOString(),
  };
}

router.post("/register", async (req, res) => {
  const body = RegisterUserBody.parse(req.body);
  const ip = getClientIp(req);

  let user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, body.telegramId))
    .then((rows) => rows[0] ?? null);

  if (!user) {
    const depositCode = await makeUniqueDepositCode();
    const [created] = await db
      .insert(usersTable)
      .values({
        telegramId: body.telegramId,
        username: body.username ?? null,
        firstName: body.firstName ?? null,
        lastName: body.lastName ?? null,
        photoUrl: body.photoUrl ?? null,
        referredBy: body.referredBy ?? null,
        lastIp: ip,
        coins: 0,
        totalAdsWatched: 0,
        isBlocked: false,
        depositCode,
      })
      .returning();
    user = created;

    if (body.referredBy && body.referredBy !== body.telegramId) {
      const referrer = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.telegramId, body.referredBy))
        .then((rows) => rows[0] ?? null);
      if (referrer) {
        await db
          .update(usersTable)
          .set({
            coins: referrer.coins + COINS_PER_REFERRAL,
            referralEarnings: referrer.referralEarnings + COINS_PER_REFERRAL,
          })
          .where(eq(usersTable.telegramId, body.referredBy));
      }
    }
  } else {
    // Update profile fields + IP + lastLoginAt on every login
    // Also backfill depositCode if user registered before this feature
    const updates: Partial<typeof usersTable.$inferInsert> = {
      username:    body.username  ?? user.username  ?? undefined,
      firstName:   body.firstName ?? user.firstName ?? undefined,
      lastName:    body.lastName  ?? user.lastName  ?? undefined,
      photoUrl:    body.photoUrl  ?? user.photoUrl  ?? undefined,
      lastIp:      ip ?? user.lastIp ?? undefined,
      lastLoginAt: new Date(),
      updatedAt:   new Date(),
    };

    if (!user.depositCode) {
      updates.depositCode = await makeUniqueDepositCode();
    }

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.telegramId, body.telegramId))
      .returning();
    user = updated;
  }

  const totalReferrals = await getReferralCount(user.telegramId);
  res.json(userResponse(user, totalReferrals));
});

router.get("/:telegramId", async (req, res) => {
  const params = GetUserProfileParams.parse(req.params);
  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, params.telegramId))
    .then((rows) => rows[0] ?? null);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Backfill depositCode if missing (users registered before the feature)
  if (!user.depositCode) {
    const depositCode = await makeUniqueDepositCode();
    const [updated] = await db
      .update(usersTable)
      .set({ depositCode, updatedAt: new Date() })
      .where(eq(usersTable.telegramId, params.telegramId))
      .returning();
    const totalReferrals = await getReferralCount(updated.telegramId);
    res.json(userResponse(updated, totalReferrals));
    return;
  }

  const totalReferrals = await getReferralCount(user.telegramId);
  res.json(userResponse(user, totalReferrals));
});

export default router;
