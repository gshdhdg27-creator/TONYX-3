import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniInvestmentsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const RATE_PER_DAY = 0.01; // 1% per day
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RATE_PER_MS = RATE_PER_DAY / MS_PER_DAY;

function calcEarned(principal: number, startedAt: Date, totalClaimed: number) {
  const elapsed = Date.now() - startedAt.getTime();
  const earnedTotal = Math.floor(principal * RATE_PER_MS * elapsed);
  const unclaimed = Math.max(0, earnedTotal - totalClaimed);
  return { earnedTotal, unclaimed };
}

/* GET /investments/:telegramId */
router.get("/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  if (!telegramId) { res.status(400).json({ error: "Missing telegramId" }); return; }

  const inv = await db
    .select()
    .from(miniInvestmentsTable)
    .where(eq(miniInvestmentsTable.telegramId, telegramId))
    .then(r => r[0] ?? null);

  if (!inv) {
    res.json({ principal: 0, totalClaimed: 0, earnedTotal: 0, unclaimed: 0, startedAt: null, ratePerDay: RATE_PER_DAY });
    return;
  }

  const { earnedTotal, unclaimed } = calcEarned(inv.principal, inv.startedAt, inv.totalClaimed);
  res.json({
    principal: inv.principal,
    totalClaimed: inv.totalClaimed,
    earnedTotal,
    unclaimed,
    startedAt: inv.startedAt.toISOString(),
    ratePerDay: RATE_PER_DAY,
  });
});

/* POST /investments/invest — deduct coins from balance and start/add to investment */
router.post("/invest", async (req, res) => {
  const { telegramId, amount } = req.body as { telegramId?: string; amount?: number };
  if (!telegramId || !amount || amount <= 0) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then(r => r[0] ?? null);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.isBlocked) { res.status(403).json({ error: "Account is blocked" }); return; }
  if (user.coins < amount) { res.status(400).json({ error: "Недостаточно монет на балансе" }); return; }

  const existing = await db
    .select()
    .from(miniInvestmentsTable)
    .where(eq(miniInvestmentsTable.telegramId, telegramId))
    .then(r => r[0] ?? null);

  if (existing) {
    // Claim any existing unclaimed earnings first, then add to principal
    const { unclaimed } = calcEarned(existing.principal, existing.startedAt, existing.totalClaimed);
    const newPrincipal = existing.principal + amount + unclaimed;
    const newUserCoins = user.coins - amount + unclaimed;

    await Promise.all([
      db.update(miniInvestmentsTable)
        .set({ principal: newPrincipal, totalClaimed: 0, startedAt: new Date(), lastClaimedAt: new Date(), updatedAt: new Date() })
        .where(eq(miniInvestmentsTable.telegramId, telegramId)),
      db.update(usersTable)
        .set({ coins: newUserCoins, updatedAt: new Date() })
        .where(eq(usersTable.telegramId, telegramId)),
    ]);
    res.json({ principal: newPrincipal, newBalance: newUserCoins, message: `Вложено ${amount} pts. Инвестиция обновлена.` });
  } else {
    // New investment
    await Promise.all([
      db.insert(miniInvestmentsTable).values({ telegramId, principal: amount }),
      db.update(usersTable)
        .set({ coins: user.coins - amount, updatedAt: new Date() })
        .where(eq(usersTable.telegramId, telegramId)),
    ]);
    res.json({ principal: amount, newBalance: user.coins - amount, message: `Вложено ${amount} pts. Инвестиция запущена!` });
  }
});

/* POST /investments/claim — withdraw earned coins to balance */
router.post("/claim", async (req, res) => {
  const { telegramId } = req.body as { telegramId?: string };
  if (!telegramId) { res.status(400).json({ error: "Missing telegramId" }); return; }

  const [user, inv] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then(r => r[0] ?? null),
    db.select().from(miniInvestmentsTable).where(eq(miniInvestmentsTable.telegramId, telegramId)).then(r => r[0] ?? null),
  ]);

  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (!inv || inv.principal === 0) { res.status(400).json({ error: "Нет активных инвестиций" }); return; }

  const { unclaimed } = calcEarned(inv.principal, inv.startedAt, inv.totalClaimed);
  if (unclaimed < 1) { res.status(400).json({ error: "Нет доступных к снятию монет (минимум 1 pt)" }); return; }

  const newUserCoins = user.coins + unclaimed;
  const newTotalClaimed = inv.totalClaimed + unclaimed;

  await Promise.all([
    db.update(miniInvestmentsTable)
      .set({ totalClaimed: newTotalClaimed, lastClaimedAt: new Date(), updatedAt: new Date() })
      .where(eq(miniInvestmentsTable.telegramId, telegramId)),
    db.update(usersTable)
      .set({ coins: newUserCoins, updatedAt: new Date() })
      .where(eq(usersTable.telegramId, telegramId)),
  ]);

  res.json({ claimed: unclaimed, newBalance: newUserCoins, message: `Получено ${unclaimed} pts!` });
});

export default router;
