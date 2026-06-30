import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import {
  GetReferralsParams,
  GetReferralsResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const BOT_USERNAME = process.env.BOT_USERNAME ?? "YourBot";

router.get("/:telegramId", async (req, res) => {
  const params = GetReferralsParams.parse(req.params);

  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, params.telegramId))
    .then((rows) => rows[0] ?? null);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const referrals = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.referredBy, params.telegramId));

  const data = GetReferralsResponse.parse({
    referralCode: params.telegramId,
    referralLink: `https://t.me/${BOT_USERNAME}?start=${params.telegramId}`,
    totalReferrals: referrals.length,
    referralEarnings: user.referralEarnings,
    referrals: referrals.map((r) => ({
      ...(r.username ? { username: r.username } : {}),
      ...(r.firstName ? { firstName: r.firstName } : {}),
      joinedAt: r.createdAt,
      coinsEarned: 0,
    })),
  });
  res.json(data);
});

export default router;
