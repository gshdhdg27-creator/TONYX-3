import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import {
  GetDailyBonusStatusParams,
  GetDailyBonusStatusResponse,
  ClaimDailyBonusBody,
  ClaimDailyBonusResponse,
  LuckySpinBonusBody,
  LuckySpinBonusResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const MIN_DAILY_BONUS = 20;
const MAX_DAILY_BONUS = 50;
const SPIN_PRIZES = [10, 10, 20, 20, 20, 50, 50, 100];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function nextMidnight(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

router.get("/daily/:telegramId", async (req, res) => {
  const params = GetDailyBonusStatusParams.parse(req.params);

  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, params.telegramId))
    .then((rows) => rows[0] ?? null);

  const now = new Date();
  const canClaim = !user?.lastDailyBonusAt || !isSameDay(user.lastDailyBonusAt, now);
  const canSpin = !user?.lastLuckySpinAt || !isSameDay(user.lastLuckySpinAt, now);

  const data = GetDailyBonusStatusResponse.parse({
    canClaim,
    ...(canClaim ? {} : { nextClaimAt: nextMidnight() }),
    minBonus: MIN_DAILY_BONUS,
    maxBonus: MAX_DAILY_BONUS,
    canSpin,
    ...(canSpin ? {} : { nextSpinAt: nextMidnight() }),
  });
  res.json(data);
});

router.post("/daily/claim", async (req, res) => {
  const body = ClaimDailyBonusBody.parse(req.body);

  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, body.telegramId))
    .then((rows) => rows[0] ?? null);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const now = new Date();
  if (user.lastDailyBonusAt && isSameDay(user.lastDailyBonusAt, now)) {
    res.status(400).json({ error: "Daily bonus already claimed. Come back tomorrow!" });
    return;
  }

  const coinsEarned = randomInt(MIN_DAILY_BONUS, MAX_DAILY_BONUS);
  const newBalance = user.coins + coinsEarned;

  await db
    .update(usersTable)
    .set({
      coins: newBalance,
      lastDailyBonusAt: now,
      updatedAt: now,
    })
    .where(eq(usersTable.telegramId, body.telegramId));

  const data = ClaimDailyBonusResponse.parse({
    coinsEarned,
    newBalance,
    message: `🎁 You received ${coinsEarned} coins as your daily bonus!`,
  });
  res.json(data);
});

router.post("/spin", async (req, res) => {
  const body = LuckySpinBonusBody.parse(req.body);

  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, body.telegramId))
    .then((rows) => rows[0] ?? null);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const now = new Date();
  if (user.lastLuckySpinAt && isSameDay(user.lastLuckySpinAt, now)) {
    res.status(400).json({ error: "Lucky spin already used today. Come back tomorrow!" });
    return;
  }

  const spinIndex = Math.floor(Math.random() * SPIN_PRIZES.length);
  const coinsEarned = SPIN_PRIZES[spinIndex];
  const newBalance = user.coins + coinsEarned;

  await db
    .update(usersTable)
    .set({
      coins: newBalance,
      lastLuckySpinAt: now,
      updatedAt: now,
    })
    .where(eq(usersTable.telegramId, body.telegramId));

  const data = LuckySpinBonusResponse.parse({
    coinsEarned,
    newBalance,
    prize: `${coinsEarned} coins`,
    spinIndex,
  });
  res.json(data);
});

export default router;
