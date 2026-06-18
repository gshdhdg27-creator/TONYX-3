import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniWithdrawalsTable, miniTopupRequestsTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { mnemonicToWalletKey } from "@ton/crypto";
import { WalletContractV4, TonClient, internal, toNano } from "@ton/ton";

const router: IRouter = Router();

const MIN_WITHDRAWAL_TON = 0.1;
const COMMISSION_PCT = 0.05;
const PROJECT_WALLET = process.env.PROJECT_WALLET_ADDRESS ?? "UQA8d39yaqa-CGw6BUCQw6U3LGelzpS3GxFaVwVDY3BnCDwe";

function isValidTonAddress(addr: string): boolean {
  const cleaned = addr.trim();
  return /^[EUk][Qq][\w\-+/]{46,48}$/.test(cleaned) || /^0:[0-9a-fA-F]{64}$/.test(cleaned);
}

/* ─── Auto-send TON from project wallet via @ton/ton ─── */
async function autoSendTon(toAddress: string, amountTon: number): Promise<string | null> {
  const mnemonic = process.env.PROJECT_WALLET_MNEMONIC?.trim();
  if (!mnemonic) return null;

  const words = mnemonic.split(/\s+/);
  const key = await mnemonicToWalletKey(words);
  const walletContract = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });

  const endpoint = process.env.TON_RPC_URL ?? "https://toncenter.com/api/v2/jsonRPC";
  const apiKey   = process.env.TONCENTER_API_KEY;
  const client   = new TonClient({ endpoint, ...(apiKey ? { apiKey } : {}) });

  const contract = client.open(walletContract);
  const seqno    = await contract.getSeqno();

  await contract.sendTransfer({
    secretKey: key.secretKey,
    seqno,
    messages: [
      internal({
        to: toAddress,
        value: toNano(amountTon.toFixed(9)),
        bounce: false,
        body: "TONYX Withdrawal",
      }),
    ],
  });

  return `seqno-${seqno}-${Date.now()}`;
}

/* ─── TonAPI transaction type ─── */
interface TonApiTx {
  hash: string;
  lt: string | number;
  utime: number;
  in_msg?: {
    value?: string | number;
    decoded_body?: { comment?: string } | null;
  } | null;
}

/* ─── Query TonAPI for project wallet transactions ─── */
async function queryProjectWalletTxs(): Promise<TonApiTx[]> {
  const encodedAddr = encodeURIComponent(PROJECT_WALLET);
  const apiKey      = process.env.TONAPI_KEY;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(
      `https://tonapi.io/v2/blockchain/accounts/${encodedAddr}/transactions?limit=100&sort_order=desc`,
      { headers, signal: controller.signal },
    );
    clearTimeout(timer);
    if (!r.ok) return [];
    const data = await r.json() as { transactions?: TonApiTx[] };
    return data.transactions ?? [];
  } catch {
    clearTimeout(timer);
    return [];
  }
}

/* ─────────────────────────────────────────────────────────
   POST /withdraw — deducts balance + auto-sends via blockchain
   Falls back to "pending" if PROJECT_WALLET_MNEMONIC not set
───────────────────────────────────────────────────────── */
router.post("/withdraw", async (req, res) => {
  const { telegramId, tonAmount, address } = req.body ?? {};

  if (!telegramId || !tonAmount || !address) {
    res.status(400).json({ error: "Нужны: telegramId, tonAmount, address" });
    return;
  }

  const amount = Number(tonAmount);
  if (isNaN(amount) || amount < MIN_WITHDRAWAL_TON) {
    res.status(400).json({ error: `Минимальная сумма вывода: ${MIN_WITHDRAWAL_TON} TON` });
    return;
  }
  if (amount > 10000) {
    res.status(400).json({ error: "Максимум за один вывод: 10 000 TON" });
    return;
  }

  const cleanAddress = String(address).trim();
  if (!isValidTonAddress(cleanAddress)) {
    res.status(400).json({ error: "Неверный TON адрес (UQ…/EQ…/0:hex)" });
    return;
  }

  const commission = parseFloat((amount * COMMISSION_PCT).toFixed(8));
  const netAmount  = parseFloat((amount - commission).toFixed(8));

  try {
    const user = await db.select().from(usersTable)
      .where(eq(usersTable.telegramId, String(telegramId))).then(r => r[0] ?? null);
    if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }

    const currentTon = Number(user.ton ?? 0);
    if (currentTon < amount) {
      res.status(400).json({ error: `Недостаточно TON. Баланс: ${currentTon.toFixed(4)} TON` });
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
      tonAmount: String(netAmount),
      tonPrice: null,
      status: "processing",
    }).returning();

    // Attempt blockchain auto-send
    let txRef: string | null = null;
    let sendErr: unknown = null;
    try {
      txRef = await autoSendTon(cleanAddress, netAmount);
    } catch (e) {
      sendErr = e;
      console.error("[Wallet] Blockchain send failed:", e);
    }

    if (txRef) {
      await db.update(miniWithdrawalsTable)
        .set({ status: "completed", txHash: txRef })
        .where(eq(miniWithdrawalsTable.id, withdrawal.id));

      console.log(`[Wallet] Auto-sent ${netAmount} TON → ${cleanAddress}, ref=${txRef}`);
      res.json({
        id: withdrawal.id,
        status: "completed",
        txRef,
        netAmount,
        grossAmount: amount,
        commission,
        commissionPct: COMMISSION_PCT * 100,
        newBalance: newTon,
        message: `✅ ${netAmount.toFixed(4)} TON отправлено на ${cleanAddress.slice(0, 8)}… (комиссия 5%)`,
      });
    } else if (!process.env.PROJECT_WALLET_MNEMONIC) {
      // Mnemonic not configured — leave as pending for admin
      await db.update(miniWithdrawalsTable)
        .set({ status: "pending" })
        .where(eq(miniWithdrawalsTable.id, withdrawal.id));

      res.json({
        id: withdrawal.id,
        status: "pending",
        netAmount,
        grossAmount: amount,
        commission,
        commissionPct: COMMISSION_PCT * 100,
        newBalance: newTon,
        message: `Заявка принята. К выплате: ${netAmount.toFixed(4)} TON (комиссия 5%). Обработка до 24ч.`,
      });
    } else {
      // Mnemonic set but send failed — revert user balance
      const revertTon = parseFloat((newTon + amount).toFixed(8));
      await db.update(usersTable)
        .set({ ton: String(revertTon), updatedAt: new Date() })
        .where(eq(usersTable.telegramId, String(telegramId)));
      await db.update(miniWithdrawalsTable)
        .set({ status: "failed" })
        .where(eq(miniWithdrawalsTable.id, withdrawal.id));

      const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      console.error(`[Wallet] Reverted balance for ${telegramId}: ${errMsg}`);
      res.status(500).json({ error: `Ошибка отправки: ${errMsg}. Баланс восстановлен.` });
    }
  } catch (e) {
    console.error("[Wallet] POST /withdraw error:", e);
    res.status(500).json({ error: "Ошибка базы данных" });
  }
});

/* ─────────────────────────────────────────────────────────
   POST /topup — register intent (called after TON Connect tx)
───────────────────────────────────────────────────────── */
router.post("/topup", async (req, res) => {
  try {
    const { telegramId, amount, memo, txBoc, walletAddress } = req.body ?? {};
    if (!telegramId || !amount) {
      res.status(400).json({ error: "Нужны: telegramId, amount" });
      return;
    }
    const tonAmount = Number(amount);
    if (isNaN(tonAmount) || tonAmount <= 0) {
      res.status(400).json({ error: "Неверная сумма" });
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

    console.log(`[Topup] Intent: ${telegramId} → ${tonAmount} TON, wallet=${walletAddress ?? "?"}`);
    res.json({ ok: true, message: "Пополнение зарегистрировано. Проверяем транзакцию..." });
  } catch (e) {
    console.error("[Topup] POST error:", e);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

/* ─────────────────────────────────────────────────────────
   POST /topup/verify — check blockchain, auto-credit if found
───────────────────────────────────────────────────────── */
router.post("/topup/verify", async (req, res) => {
  const { telegramId, expectedAmount } = req.body ?? {};
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  // Support both new TONYX-{id} and legacy TOPUP_{id} memo formats
  const memoNew    = `TONYX-${telegramId}`;
  const memoLegacy = `TOPUP_${telegramId}`;
  const minTon     = expectedAmount ? Number(expectedAmount) * 0.99 : 0.05;

  try {
    const txs = await queryProjectWalletTxs();

    const matchingTx = txs.find(tx => {
      const comment  = tx.in_msg?.decoded_body?.comment ?? "";
      const valueTon = Number(tx.in_msg?.value ?? 0) / 1e9;
      return (comment === memoNew || comment === memoLegacy) && valueTon >= minTon;
    });

    const memo = matchingTx
      ? (matchingTx.in_msg?.decoded_body?.comment ?? memoNew)
      : memoNew;

    if (!matchingTx) {
      res.json({ found: false, message: "Транзакция ещё не найдена. Ожидайте подтверждения..." });
      return;
    }

    const txKey      = `${matchingTx.hash}-${String(matchingTx.lt)}`;
    const receivedTon = Number(matchingTx.in_msg?.value ?? 0) / 1e9;

    // Dedup: check if this txKey was already credited
    const alreadyDone = await db.select().from(miniTopupRequestsTable)
      .where(and(
        eq(miniTopupRequestsTable.telegramId, String(telegramId)),
        eq(miniTopupRequestsTable.status, "completed"),
      )).then(rows => rows.some(r => r.txHash === txKey));

    if (alreadyDone) {
      res.json({ found: true, alreadyCredited: true, message: "Транзакция уже была зачислена ранее" });
      return;
    }

    const user = await db.select().from(usersTable)
      .where(eq(usersTable.telegramId, String(telegramId))).then(r => r[0] ?? null);
    if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }

    const newTon = parseFloat((Number(user.ton ?? 0) + receivedTon).toFixed(8));

    await db.update(usersTable)
      .set({ ton: String(newTon), updatedAt: new Date() })
      .where(eq(usersTable.telegramId, String(telegramId)));

    await db.insert(miniTopupRequestsTable).values({
      telegramId: String(telegramId),
      tonAmount: String(receivedTon),
      memo,
      txBoc: null,
      txHash: txKey,
      walletAddress: null,
      status: "completed",
    });

    console.log(`[Topup] Verified & credited ${receivedTon} TON → ${telegramId}, txKey=${txKey}`);
    res.json({
      found: true,
      credited: true,
      amount: receivedTon,
      newBalance: newTon,
      message: `✅ Зачислено ${receivedTon.toFixed(4)} TON!`,
    });
  } catch (e) {
    console.error("[Topup] /verify error:", e);
    res.status(500).json({ error: "Ошибка проверки транзакции" });
  }
});

/* ─── GET /withdrawals/:telegramId ─── */
router.get("/withdrawals/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  try {
    const rows = await db.select().from(miniWithdrawalsTable)
      .where(eq(miniWithdrawalsTable.telegramId, telegramId))
      .orderBy(desc(miniWithdrawalsTable.createdAt));

    res.json({
      withdrawals: rows.map(w => ({
        id:        w.id,
        amount:    w.amount,
        address:   w.address,
        tonAmount: w.tonAmount ? Number(w.tonAmount) : null,
        tonPrice:  w.tonPrice  ? Number(w.tonPrice)  : null,
        txHash:    w.txHash ?? null,
        status:    w.status,
        createdAt: w.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error("[Wallet] GET /withdrawals error:", e);
    res.status(500).json({ error: "Ошибка базы данных" });
  }
});

export default router;
