import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import {
  GetLeaderboardQueryParams,
  GetLeaderboardResponse,
} from "@workspace/api-zod";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  const query = GetLeaderboardQueryParams.parse(req.query);
  const limit = query.limit ?? 50;

  const users = await db
    .select()
    .from(usersTable)
    .orderBy(desc(usersTable.coins))
    .limit(limit);

  const data = GetLeaderboardResponse.parse({
    entries: users.map((u, i) => ({
      rank: i + 1,
      telegramId: u.telegramId,
      ...(u.username  ? { username:  u.username  } : {}),
      ...(u.firstName ? { firstName: u.firstName } : {}),
      ...(u.photoUrl  ? { photoUrl:  u.photoUrl  } : {}),
      coins: u.coins,
      totalAdsWatched: u.totalAdsWatched,
    })),
  });
  res.json(data);
});

export default router;
