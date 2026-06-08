import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniWithdrawalsTable, miniTopupRequestsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

const MIN_WITHDRAWAL_TON = 0.1;

function isValidTonAddress(addr: string): boolean {
  const cleaned = addr.trim();
  return /^[EUk][Qq][\w\-+/]{46,48}$/.test(cleaned) || /^0:[0-9a-fA-F]{64}$/.test(cleaned);
}

router.post("/withdraw", async (req, res) => {
  const { telegramId, tonAmount, address } = req.body ?? {};

  if (!telegramId || !tonAmount || !address) {
    res.status(400).json({ error: "Missing fields: telegramId, tonAmount, address" });
    return;
  }

  const amount = Number(tonAmount);
  if (isNaN(amount) || amount < MIN_WITHDRAWAL_TON) {
    res.status(400).json({ error: `Minimum withdrawal is ${MIN_WITHDRAWAL_TON} TON` });
    return;
  }
  if (amount > 10000) {
    res.status(400).json({ error: "Maximum single withdrawal is 10 000 TON" });
    return;
  }

  const cleanAddress = String(address).trim();
  if (!isValidTonAddress(cleanAddress)) {
    res.status(400).json({ error: "Invalid TON wallet address (expected UQ…/EQ…/0:hex format)" });
    return;
  }

  try {
    const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, String(telegramId))).then((r) => r[0] ?? null);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const currentTon = Number(user.ton ?? 0);
    if (currentTon < amount) {
      res.status(400).json({ error: `Insufficient TON. Your balance: ${currentTon.toFixed(4)} TON` });
      return;
    }

    const newTon = parseFloat((currentTon - amount).toFixed(8));
    await db.update(usersTable)
      .set({ ton: String(newTon), updatedAt: new Date() })
      .where(eq(usersTable.telegramId, String(telegramId)));

    const [withdrawal] = await db.insert(miniWithdrawalsTable).values({
      telegramId: String(telegramId),
      amount: 0,
      address: cleanAddress,
      tonAmount: String(amount),
      tonPrice: null,
      status: "pending",
    }).returning();

    console.log(`[Wallet] Withdrawal created: id=${withdrawal.id} user=${telegramId} amount=${amount} TON to ${cleanAddress}`);

    res.json({
      id: withdrawal.id,
      status: "pending",
      tonAmount: amount,
      address: cleanAddress,
      newBalance: newTon,
      message: `Заявка на вывод ${amount} TON принята. Обработка в течение 24 часов.`,
    });
  } catch (e) {
    console.error("[Wallet] POST withdraw error:", e);
    res.status(500).json({ error: "Database error" });
  }
});

router.get("/withdrawals/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  try {
    const rows = await db.select().from(miniWithdrawalsTable)
      .where(eq(miniWithdrawalsTable.telegramId, telegramId))
      .orderBy(desc(miniWithdrawalsTable.createdAt));

    res.json({
      withdrawals: rows.map((w) => ({
        id: w.id,
        amount: w.amount,
        address: w.address,
        tonAmount: w.tonAmount ? Number(w.tonAmount) : null,
        tonPrice: w.tonPrice ? Number(w.tonPrice) : null,
        txHash: w.txHash ?? null,
        status: w.status,
        createdAt: w.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error("[Wallet] GET withdrawals error:", e);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/topup", async (req, res) => {
  try {
    const { telegramId, amount, memo, txBoc, walletAddress } = req.body ?? {};
    if (!telegramId || !amount) {
      res.status(400).json({ error: "Missing telegramId or amount" });
      return;
    }
    const tonAmount = Number(amount);
    if (isNaN(tonAmount) || tonAmount <= 0) {
      res.status(400).json({ error: "Invalid amount" });
      return;
    }

    await db.insert(miniTopupRequestsTable).values({
      telegramId: String(telegramId),
      tonAmount: String(tonAmount),
      memo: memo ?? null,
      txBoc: txBoc ?? null,
      walletAddress: walletAddress ?? null,
      status: "pending",
    });

    console.log(`[Topup] ${telegramId}: ${tonAmount} TON via TON Connect, wallet=${walletAddress ?? "?"}`);
    res.json({ ok: true, message: "Topup request registered. Admin will verify and credit." });
  } catch (e) {
    console.error("[Topup] error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
