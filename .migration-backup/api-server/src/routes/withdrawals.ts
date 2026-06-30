import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, withdrawalsTable } from "@workspace/db/schema";
import {
  RequestWithdrawalBody,
  RequestWithdrawalResponse,
  GetWithdrawalsParams,
  GetWithdrawalsResponse,
} from "@workspace/api-zod";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

const MINIMUM_WITHDRAWAL = 1000;
const COINS_TO_USD = 1 / 1000;
const COINS_TO_STARS = 50 / 1000;
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
  } catch {
    // fallback
  }
  return TON_PRICE_FALLBACK;
}

router.post("/", async (req, res) => {
  const body = RequestWithdrawalBody.parse(req.body);

  if (body.amount < MINIMUM_WITHDRAWAL) {
    res.status(400).json({ error: `Minimum withdrawal is ${MINIMUM_WITHDRAWAL} coins ($${(MINIMUM_WITHDRAWAL * COINS_TO_USD).toFixed(2)})` });
    return;
  }

  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, body.telegramId))
    .then((rows) => rows[0] ?? null);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.coins < body.amount) {
    res.status(400).json({ error: `Insufficient balance. You have ${user.coins} coins.` });
    return;
  }

  const usdValue = (body.amount * COINS_TO_USD).toFixed(2);
  let payout = "";
  if (body.method === "Stars") {
    const stars = Math.floor(body.amount * COINS_TO_STARS);
    payout = `~${stars} Telegram Stars`;
  } else {
    const tonPrice = await fetchTonPrice();
    const ton = (body.amount * COINS_TO_USD / tonPrice).toFixed(4);
    payout = `~${ton} TON (@$${tonPrice.toFixed(2)}/TON)`;
  }

  const [withdrawal] = await db
    .insert(withdrawalsTable)
    .values({
      telegramId: body.telegramId,
      amount: body.amount,
      method: body.method,
      address: body.address,
      status: "pending",
    })
    .returning();

  await db
    .update(usersTable)
    .set({
      coins: user.coins - body.amount,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.telegramId, body.telegramId));

  const data = RequestWithdrawalResponse.parse({
    id: withdrawal.id,
    status: withdrawal.status,
    amount: withdrawal.amount,
    method: withdrawal.method,
    message: `Вывод ${withdrawal.amount} монет (≈$${usdValue} / ${payout}) через ${withdrawal.method} принят. Обработка: 1-3 рабочих дня.`,
  });
  res.json(data);
});

router.get("/:telegramId", async (req, res) => {
  const params = GetWithdrawalsParams.parse(req.params);

  const withdrawals = await db
    .select()
    .from(withdrawalsTable)
    .where(eq(withdrawalsTable.telegramId, params.telegramId))
    .orderBy(desc(withdrawalsTable.createdAt));

  const data = GetWithdrawalsResponse.parse({
    withdrawals: withdrawals.map((w) => ({
      id: w.id,
      amount: w.amount,
      method: w.method,
      address: w.address,
      status: w.status,
      createdAt: w.createdAt,
    })),
    minimumWithdrawal: MINIMUM_WITHDRAWAL,
  });
  res.json(data);
});

export default router;
