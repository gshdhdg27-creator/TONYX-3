import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { desc, sql, eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/leaderboard", async (req: Request, res: Response) => {
  const category = (req.query.category as string) ?? "top_earn";
  const telegramId = req.query.telegramId as string | undefined;

  let rows: { telegramId: string; username: string | null; firstName: string | null; coins: number }[] = [];

  if (category === "top_players") {
    rows = await db
      .select({
        telegramId: usersTable.telegramId,
        username: usersTable.username,
        firstName: usersTable.firstName,
        coins: usersTable.totalAdsWatched,
      })
      .from(usersTable)
      .orderBy(desc(usersTable.totalAdsWatched))
      .limit(50);
  } else if (category === "referrals") {
    const result = await db.execute<{
      telegram_id: string;
      username: string | null;
      first_name: string | null;
      ref_count: number;
    }>(sql`
      SELECT u.telegram_id, u.username, u.first_name,
             COUNT(r.id)::int AS ref_count
      FROM users u
      LEFT JOIN users r ON r.referred_by = u.telegram_id
      GROUP BY u.telegram_id, u.username, u.first_name
      HAVING COUNT(r.id) > 0
      ORDER BY ref_count DESC
      LIMIT 50
    `);
    rows = result.rows.map((r) => ({
      telegramId: r.telegram_id,
      username: r.username,
      firstName: r.first_name,
      coins: r.ref_count,
    }));
  } else {
    rows = await db
      .select({
        telegramId: usersTable.telegramId,
        username: usersTable.username,
        firstName: usersTable.firstName,
        coins: usersTable.coins,
      })
      .from(usersTable)
      .orderBy(desc(usersTable.coins))
      .limit(50);
  }

  const entries = rows.map((r, i) => ({
    rank: i + 1,
    telegramId: r.telegramId,
    username: r.username,
    firstName: r.firstName,
    coins: r.coins,
    ton: r.coins / 1000,
  }));

  let myRank: number | null = null;
  if (telegramId) {
    const idx = entries.findIndex((e) => e.telegramId === telegramId);
    if (idx >= 0) myRank = idx + 1;
    else {
      const [me] = await db
        .select({ coins: usersTable.coins, ads: usersTable.totalAdsWatched })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId));
      if (me) {
        if (category === "top_players") {
          const r = await db.execute<{ c: number }>(
            sql`SELECT COUNT(*)::int AS c FROM users WHERE total_ads_watched > ${me.ads}`,
          );
          myRank = (r.rows[0]?.c ?? 0) + 1;
        } else if (category === "top_earn") {
          const r = await db.execute<{ c: number }>(
            sql`SELECT COUNT(*)::int AS c FROM users WHERE coins > ${me.coins}`,
          );
          myRank = (r.rows[0]?.c ?? 0) + 1;
        } else if (category === "referrals") {
          const r = await db.execute<{ c: number }>(sql`
            SELECT COUNT(*)::int AS c FROM (
              SELECT u.telegram_id, COUNT(r.id)::int AS ref_count
              FROM users u
              LEFT JOIN users r ON r.referred_by = u.telegram_id
              GROUP BY u.telegram_id
              HAVING COUNT(r.id) > (
                SELECT COUNT(*)::int FROM users WHERE referred_by = ${telegramId}
              )
            ) t
          `);
          myRank = (r.rows[0]?.c ?? 0) + 1;
        }
      }
    }
  }

  res.json({ category, entries, myRank });
});

export default router;
