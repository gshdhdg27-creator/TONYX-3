import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniWithdrawalsTable } from "@workspace/db/schema";
import {
  ExchangeMiniCoinsBody,
  ExchangeMiniCoinsResponse,
  RequestMiniWithdrawBody,
  RequestMiniWithdrawResponse,
  GetMiniWithdrawalsParams,
  GetMiniWithdrawalsResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const COINS_TO_TON = 1000;
const MIN_WITHDRAW_COINS = 1000;
const TON_PRICE_FALLBACK = 3.0;

async function fetchTonPrice(): Promise<number> {
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd",
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) }
    );
    if (r.ok) {
      const data = (await r.json()) as Record<string, Record<string, number>>;
      const price = data?.["the-open-network"]?.usd;
      if (typeof price === "number" && price > 0) return price;
    }
  } catch { /* fallback */ }
  return TON_PRICE_FALLBACK;
}

router.post("/exchange", async (req, res) => {
  const body = ExchangeMiniCoinsBody.parse(req.body);

  if (body.coins < COINS_TO_TON) {
    res.status(400).json({ error: `Minimum exchange is ${COINS_TO_TON} coins (= 1 TON)` });
    return;
  }
  if (body.coins % COINS_TO_TON !== 0) {
    res.status(400).json({ error: `Amount must be a multiple of ${COINS_TO_TON}` });
    return;
  }

  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, body.telegramId)).then((r) => r[0] ?? null);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.coins < body.coins) {
    res.status(400).json({ error: `Insufficient coins. You have ${user.coins}` });
    return;
  }

  const ton = body.coins / COINS_TO_TON;
  const tonPrice = await fetchTonPrice();
  const newBalance = user.coins - body.coins;

  await db.update(usersTable).set({ coins: newBalance, updatedAt: new Date() }).where(eq(usersTable.telegramId, body.telegramId));

  console.log(`[Exchange] ${body.telegramId}: ${body.coins} coins → ${ton} TON (price: $${tonPrice})`);

  const data = ExchangeMiniCoinsResponse.parse({ coins: body.coins, ton, newBalance, tonPrice });
  res.json(data);
});

router.post("/withdraw", async (req, res) => {
  const body = RequestMiniWithdrawBody.parse(req.body);

  if (body.amount < MIN_WITHDRAW_COINS) {
    res.status(400).json({ error: `Minimum withdrawal is ${MIN_WITHDRAW_COINS} coins (= 1 TON)` });
    return;
  }

  const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, body.telegramId)).then((r) => r[0] ?? null);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.coins < body.amount) {
    res.status(400).json({ error: `Insufficient coins. You have ${user.coins}` });
    return;
  }

  const tonPrice = await fetchTonPrice();
  const tonAmount = body.amount / COINS_TO_TON;

  await db.update(usersTable).set({ coins: user.coins - body.amount, updatedAt: new Date() }).where(eq(usersTable.telegramId, body.telegramId));

  const [withdrawal] = await db
    .insert(miniWithdrawalsTable)
    .values({ telegramId: body.telegramId, amount: body.amount, address: body.address, tonPrice: String(tonPrice), tonAmount: String(tonAmount) })
    .returning();

  const data = RequestMiniWithdrawResponse.parse({
    id: withdrawal.id,
    status: withdrawal.status,
    amount: withdrawal.amount,
    message: `Withdrawal of ${tonAmount.toFixed(4)} TON to ${body.address} submitted. Admin will process within 24h.`,
  });
  res.json(data);
});

router.get("/withdraw/:telegramId", async (req, res) => {
  const { telegramId } = GetMiniWithdrawalsParams.parse(req.params);

  const withdrawals = await db
    .select()
    .from(miniWithdrawalsTable)
    .where(eq(miniWithdrawalsTable.telegramId, telegramId))
    .orderBy(miniWithdrawalsTable.createdAt);

  const data = GetMiniWithdrawalsResponse.parse({
    withdrawals: withdrawals.map((w) => ({
      id: w.id,
      amount: w.amount,
      address: w.address,
      tonAmount: w.tonAmount ? Number(w.tonAmount) : null,
      tonPrice: w.tonPrice ? Number(w.tonPrice) : null,
      status: w.status,
      createdAt: w.createdAt.toISOString(),
    })),
    minimumAmount: MIN_WITHDRAW_COINS,
  });
  res.json(data);
});

export default router;
