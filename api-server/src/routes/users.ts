import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import {
  RegisterUserBody,
  RegisterUserResponse,
  GetUserProfileParams,
  GetUserProfileResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const COINS_PER_REFERRAL = 500;

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

router.post("/register", async (req, res) => {
  const body = RegisterUserBody.parse(req.body);
  const ip = getClientIp(req);

  let user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, body.telegramId))
    .then((rows) => rows[0] ?? null);

  if (!user) {
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
    const [updated] = await db
      .update(usersTable)
      .set({
        username:  body.username  ?? user.username,
        firstName: body.firstName ?? user.firstName,
        lastName:  body.lastName  ?? user.lastName,
        photoUrl:  body.photoUrl  ?? user.photoUrl,
        lastIp: ip ?? user.lastIp,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.telegramId, body.telegramId))
      .returning();
    user = updated;
  }

  const totalReferrals = await getReferralCount(user.telegramId);

  res.json({
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
    createdAt: user.createdAt.toISOString(),
  });
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

  const totalReferrals = await getReferralCount(user.telegramId);

  res.json({
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
    createdAt: user.createdAt.toISOString(),
  });
});

export default router;
