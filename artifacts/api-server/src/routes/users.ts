import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import {
  RegisterUserBody,
  GetUserProfileParams,
} from "@workspace/api-zod";
import { eq, isNull, or, and, ne } from "drizzle-orm";
import { notifyUser } from "../services/botNotify.js";

const router: IRouter = Router();

const COINS_PER_REFERRAL = 500;

/** Number of detected twink attempts before the main account is auto-banned too. */
const MAX_WARNINGS_BEFORE_MAIN_BAN = 3;

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

/**
 * Multi-account ("twink") detection.
 *
 * Runs right after a brand-new account is created. Looks for an existing,
 * different account sharing the same device (persisted client-side ID) or
 * IP address. If one is found, the earliest-created account in that group is
 * treated as the "main" account:
 *  - the brand-new account is immediately blocked (a Telegram identity can't
 *    be swapped by the web app, so we can't literally "log the user into"
 *    their main account — instead we block the twink and tell them to use
 *    their main account)
 *  - the main account receives a warning strike; after
 *    MAX_WARNINGS_BEFORE_MAIN_BAN strikes the main account is banned too.
 */
async function checkAndHandleTwinkAccount(
  newUser: typeof usersTable.$inferSelect,
  ip: string | null,
  deviceId: string | null,
): Promise<typeof usersTable.$inferSelect> {
  if (!ip && !deviceId) return newUser;

  const matchConditions = [];
  if (deviceId) matchConditions.push(eq(usersTable.deviceId, deviceId));
  if (ip) matchConditions.push(eq(usersTable.lastIp, ip));

  const candidates = await db
    .select()
    .from(usersTable)
    .where(and(ne(usersTable.telegramId, newUser.telegramId), or(...matchConditions)))
    .orderBy(usersTable.createdAt);

  if (!candidates.length) return newUser;

  const main = candidates[0];

  const [bannedTwink] = await db
    .update(usersTable)
    .set({
      isBlocked: true,
      userStatus: "banned",
      bannedReason: "Твинк-аккаунт (мульти-аккаунт)",
      updatedAt: new Date(),
    })
    .where(eq(usersTable.telegramId, newUser.telegramId))
    .returning();

  const newWarningCount = main.warningCount + 1;
  const mainShouldBeBanned = newWarningCount >= MAX_WARNINGS_BEFORE_MAIN_BAN;

  await db
    .update(usersTable)
    .set({
      warningCount: newWarningCount,
      ...(mainShouldBeBanned
        ? { isBlocked: true, userStatus: "banned" as const, bannedReason: "Множественные аккаунты (3 предупреждения)" }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(usersTable.telegramId, main.telegramId));

  void notifyUser(
    newUser.telegramId,
    `🔴 <b>Регистрация заблокирована</b>\n\n` +
      `Мы обнаружили, что вы уже используете основной аккаунт TONYX на этом устройстве/сети.\n` +
      `Использование нескольких аккаунтов запрещено правилами проекта — пожалуйста, продолжайте играть со своего основного аккаунта.`,
  );
  void notifyUser(
    main.telegramId,
    mainShouldBeBanned
      ? `🔴 <b>Ваш аккаунт TONYX заблокирован</b>\n\n` +
          `Причина: множественные аккаунты (получено 3 предупреждения о попытках регистрации твинк-аккаунтов с вашего устройства/IP).`
      : `⚠️ <b>Предупреждение TONYX</b>\n\n` +
          `С вашего устройства/сети была обнаружена попытка регистрации ещё одного аккаунта — это запрещено правилами проекта.\n` +
          `Предупреждение ${newWarningCount}/${MAX_WARNINGS_BEFORE_MAIN_BAN}. После ${MAX_WARNINGS_BEFORE_MAIN_BAN}-го предупреждения ваш основной аккаунт будет заблокирован.`,
  );

  return bannedTwink;
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
    warningCount: user.warningCount,
    createdAt: user.createdAt.toISOString(),
  };
}

router.post("/register", async (req, res) => {
  const body = RegisterUserBody.parse(req.body);
  const ip = getClientIp(req);
  const deviceId = body.deviceId?.trim() || null;

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
        deviceId,
        coins: 0,
        totalAdsWatched: 0,
        isBlocked: false,
        depositCode,
      })
      .returning();
    user = created;

    // Multi-account ("twink") detection — only relevant for brand-new accounts.
    user = await checkAndHandleTwinkAccount(user, ip, deviceId);

    if (!user.isBlocked && body.referredBy && body.referredBy !== body.telegramId) {
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
      deviceId:    deviceId ?? user.deviceId ?? undefined,
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
