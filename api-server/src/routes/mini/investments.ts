import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniInvestmentsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const BASE_RATE_PER_DAY = 0.01; // 1% per day base
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function calcEarned(principal: number, boostRate: number, startedAt: Date, totalClaimed: number) {
  const ratePerDay = BASE_RATE_PER_DAY + boostRate;
  const ratePerMs = ratePerDay / MS_PER_DAY;
  const elapsed = Date.now() - startedAt.getTime();
  const earnedTotal = principal * ratePerMs * elapsed;
  const unclaimed = Math.max(0, earnedTotal - totalClaimed);
  return { earnedTotal, unclaimed, ratePerDay };
}

/* GET /investments/:telegramId */
router.get("/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  if (!telegramId) { res.status(400).json({ error: "Missing telegramId" }); return; }

  const [inv, user] = await Promise.all([
    db.select().from(miniInvestmentsTable).where(eq(miniInvestmentsTable.telegramId, telegramId)).then(r => r[0] ?? null),
    db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then(r => r[0] ?? null),
  ]);

  const boostRate = Number(user?.boostRate ?? 0);

  if (!inv || Number(inv.principal) === 0) {
    res.json({
      principal: 0,
      totalClaimed: 0,
      earnedTotal: 0,
      unclaimed: 0,
      startedAt: null,
      ratePerDay: BASE_RATE_PER_DAY + boostRate,
      boostRate,
    });
    return;
  }

  const principal = Number(inv.principal);
  const totalClaimed = Number(inv.totalClaimed);
  const { earnedTotal, unclaimed, ratePerDay } = calcEarned(principal, boostRate, inv.startedAt, totalClaimed);

  res.json({
    principal,
    totalClaimed,
    earnedTotal,
    unclaimed,
    startedAt: inv.startedAt.toISOString(),
    ratePerDay,
    boostRate,
  });
});

/* POST /investments/deposit — transfer TON from wallet to mining */
router.post("/deposit", async (req, res) => {
  const { telegramId, amount } = req.body as { telegramId?: string; amount?: number };
  if (!telegramId || !amount || amount <= 0) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then(r => r[0] ?? null);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.isBlocked) { res.status(403).json({ error: "Account is blocked" }); return; }

  const userTon = Number(user.ton);
  if (userTon < amount) {
    res.status(400).json({ error: `Недостаточно TON. У вас ${userTon.toFixed(4)} TON` });
    return;
  }

  const boostRate = Number(user.boostRate);
  const existing = await db.select().from(miniInvestmentsTable).where(eq(miniInvestmentsTable.telegramId, telegramId)).then(r => r[0] ?? null);
  const newUserTon = userTon - amount;

  if (existing && Number(existing.principal) > 0) {
    const principal = Number(existing.principal);
    const totalClaimed = Number(existing.totalClaimed);
    const { unclaimed } = calcEarned(principal, boostRate, existing.startedAt, totalClaimed);
    const newPrincipal = principal + amount + unclaimed;

    await Promise.all([
      db.update(miniInvestmentsTable)
        .set({ principal: String(newPrincipal), totalClaimed: "0", startedAt: new Date(), lastClaimedAt: new Date(), updatedAt: new Date() })
        .where(eq(miniInvestmentsTable.telegramId, telegramId)),
      db.update(usersTable)
        .set({ ton: String(newUserTon), updatedAt: new Date() })
        .where(eq(usersTable.telegramId, telegramId)),
    ]);
    res.json({ principal: newPrincipal, newTon: newUserTon, message: `Пополнено на ${amount} TON` });
  } else if (existing) {
    await Promise.all([
      db.update(miniInvestmentsTable)
        .set({ principal: String(amount), totalClaimed: "0", startedAt: new Date(), lastClaimedAt: new Date(), updatedAt: new Date() })
        .where(eq(miniInvestmentsTable.telegramId, telegramId)),
      db.update(usersTable)
        .set({ ton: String(newUserTon), updatedAt: new Date() })
        .where(eq(usersTable.telegramId, telegramId)),
    ]);
    res.json({ principal: amount, newTon: newUserTon, message: `Майнинг запущен! Вложено ${amount} TON` });
  } else {
    await Promise.all([
      db.insert(miniInvestmentsTable).values({ telegramId, principal: String(amount), totalClaimed: "0" }),
      db.update(usersTable)
        .set({ ton: String(newUserTon), updatedAt: new Date() })
        .where(eq(usersTable.telegramId, telegramId)),
    ]);
    res.json({ principal: amount, newTon: newUserTon, message: `Майнинг запущен! Вложено ${amount} TON` });
  }
});

/* POST /investments/withdraw — move all (principal + unclaimed) back to wallet */
router.post("/withdraw", async (req, res) => {
  const { telegramId } = req.body as { telegramId?: string };
  if (!telegramId) { res.status(400).json({ error: "Missing telegramId" }); return; }

  const [user, inv] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then(r => r[0] ?? null),
    db.select().from(miniInvestmentsTable).where(eq(miniInvestmentsTable.telegramId, telegramId)).then(r => r[0] ?? null),
  ]);

  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (!inv || Number(inv.principal) === 0) { res.status(400).json({ error: "Нет активных вложений" }); return; }

  const boostRate = Number(user.boostRate);
  const principal = Number(inv.principal);
  const totalClaimed = Number(inv.totalClaimed);
  const { unclaimed } = calcEarned(principal, boostRate, inv.startedAt, totalClaimed);
  const totalReturn = principal + unclaimed;
  const newUserTon = Number(user.ton) + totalReturn;

  await Promise.all([
    db.update(miniInvestmentsTable)
      .set({ principal: "0", totalClaimed: "0", startedAt: new Date(), lastClaimedAt: new Date(), updatedAt: new Date() })
      .where(eq(miniInvestmentsTable.telegramId, telegramId)),
    db.update(usersTable)
      .set({ ton: String(newUserTon), updatedAt: new Date() })
      .where(eq(usersTable.telegramId, telegramId)),
  ]);

  res.json({ returned: totalReturn, principal, earned: unclaimed, newTon: newUserTon, message: `Выведено ${totalReturn.toFixed(8)} TON` });
});

/* POST /investments/claim — claim only earnings, keep principal */
router.post("/claim", async (req, res) => {
  const { telegramId } = req.body as { telegramId?: string };
  if (!telegramId) { res.status(400).json({ error: "Missing telegramId" }); return; }

  const [user, inv] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then(r => r[0] ?? null),
    db.select().from(miniInvestmentsTable).where(eq(miniInvestmentsTable.telegramId, telegramId)).then(r => r[0] ?? null),
  ]);

  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (!inv || Number(inv.principal) === 0) { res.status(400).json({ error: "Нет активных вложений" }); return; }

  const boostRate = Number(user.boostRate);
  const principal = Number(inv.principal);
  const totalClaimed = Number(inv.totalClaimed);
  const { unclaimed } = calcEarned(principal, boostRate, inv.startedAt, totalClaimed);

  if (unclaimed < 0.000001) {
    res.status(400).json({ error: "Нет доступных к снятию TON" });
    return;
  }

  const newUserTon = Number(user.ton) + unclaimed;
  const newTotalClaimed = totalClaimed + unclaimed;

  await Promise.all([
    db.update(miniInvestmentsTable)
      .set({ totalClaimed: String(newTotalClaimed), lastClaimedAt: new Date(), updatedAt: new Date() })
      .where(eq(miniInvestmentsTable.telegramId, telegramId)),
    db.update(usersTable)
      .set({ ton: String(newUserTon), updatedAt: new Date() })
      .where(eq(usersTable.telegramId, telegramId)),
  ]);

  res.json({ claimed: unclaimed, newTon: newUserTon, message: `Получено ${unclaimed.toFixed(8)} TON!` });
});

export default router;
