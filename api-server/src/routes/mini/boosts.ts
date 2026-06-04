import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniBoostsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

/* Available boost packages */
export const BOOST_PACKAGES = [
  { id: 1, boostPct: 0.1,  costTon: 0.5,  label: "+0.1%",  emoji: "⚡" },
  { id: 2, boostPct: 0.5,  costTon: 2.0,  label: "+0.5%",  emoji: "🔥" },
  { id: 3, boostPct: 1.0,  costTon: 3.5,  label: "+1%",    emoji: "🚀" },
  { id: 4, boostPct: 2.0,  costTon: 6.5,  label: "+2%",    emoji: "💥" },
  { id: 5, boostPct: 5.0,  costTon: 15.0, label: "+5%",    emoji: "🌟" },
  { id: 6, boostPct: 10.0, costTon: 25.0, label: "+10%",   emoji: "👑" },
];

/* GET /boosts/packages */
router.get("/packages", (_req, res) => {
  res.json({ packages: BOOST_PACKAGES });
});

/* GET /boosts/:telegramId — user boost history */
router.get("/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  if (!telegramId) { res.status(400).json({ error: "Missing telegramId" }); return; }

  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then(r => r[0] ?? null);
  const boosts = await db.select().from(miniBoostsTable).where(eq(miniBoostsTable.telegramId, telegramId));

  res.json({
    boostRate: Number(user?.boostRate ?? 0),
    boosts: boosts.map(b => ({
      id: b.id,
      boostPct: Number(b.boostPct),
      costTon: Number(b.costTon),
      purchasedAt: b.purchasedAt.toISOString(),
    })),
  });
});

/* POST /boosts/buy — purchase a boost package */
router.post("/buy", async (req, res) => {
  const { telegramId, packageId } = req.body as { telegramId?: string; packageId?: number };
  if (!telegramId || !packageId) {
    res.status(400).json({ error: "telegramId and packageId required" });
    return;
  }

  const pkg = BOOST_PACKAGES.find(p => p.id === packageId);
  if (!pkg) {
    res.status(400).json({ error: "Пакет буста не найден" });
    return;
  }

  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then(r => r[0] ?? null);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.isBlocked) { res.status(403).json({ error: "Account is blocked" }); return; }

  /* Prevent duplicate purchase of same boost tier */
  const existing = await db.select().from(miniBoostsTable).where(eq(miniBoostsTable.telegramId, telegramId));
  const alreadyOwned = existing.some(b => Number(b.boostPct) === pkg.boostPct);
  if (alreadyOwned) {
    res.status(409).json({ error: `Буст ${pkg.label} уже куплен. Каждый буст можно купить только один раз.` });
    return;
  }

  const userTon = Number(user.ton);
  if (userTon < pkg.costTon) {
    res.status(400).json({ error: `Недостаточно TON. Нужно ${pkg.costTon} TON, у вас ${userTon.toFixed(4)} TON` });
    return;
  }

  const boostPctDecimal = pkg.boostPct / 100; // Convert percentage to decimal
  const newBoostRate = Number(user.boostRate) + boostPctDecimal;
  const newTon = userTon - pkg.costTon;

  await Promise.all([
    db.update(usersTable)
      .set({ ton: String(newTon), boostRate: String(newBoostRate), updatedAt: new Date() })
      .where(eq(usersTable.telegramId, telegramId)),
    db.insert(miniBoostsTable).values({
      telegramId,
      boostPct: String(pkg.boostPct),
      costTon: String(pkg.costTon),
    }),
  ]);

  console.log(`[Boost] ${telegramId}: +${pkg.boostPct}% for ${pkg.costTon} TON → total boostRate ${newBoostRate}`);

  res.json({
    boostPct: pkg.boostPct,
    costTon: pkg.costTon,
    newBoostRate,
    newTon,
    message: `Буст ${pkg.label} активирован навсегда! Доходность +${pkg.boostPct}% в день`,
  });
});

export default router;
