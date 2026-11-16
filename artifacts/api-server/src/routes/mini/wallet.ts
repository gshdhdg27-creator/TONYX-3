import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniWithdrawalsTable, miniTopupRequestsTable } from "@workspace/db/schema";
import { notifyUser } from "../../services/botNotify.js";
import { eq, desc } from "drizzle-orm";
import { mnemonicToWalletKey } from "@ton/crypto";
import { WalletContractV4, WalletContractV5R1, TonClient, internal, toNano, SendMode, Address } from "@ton/ton";
import { scanOnce } from "../../services/depositScanner.js";

const router: IRouter = Router();
const MIN_WITHDRAWAL_TON = 0.1;
const COMMISSION_PCT = 0.05;
const PROJECT_WALLET = process.env.PROJECT_WALLET_ADDRESS ?? "UQBDrAxyWlMMmtSgq5TjQyO1nKacS_nA0_7ZQ88m8eMmU1jO";
const _withdrawalInProgress = new Set<string>();

function isValidTonAddress(addr: string): boolean {
  const cleaned = addr.trim();
  return /^[EUk][Qq][\w\-+/]{46,48}$/.test(cleaned) || /^0:[0-9a-fA-F]{64}$/.test(cleaned);
}
function addrEqual(a: string, b: string): boolean {
  try { return Address.parse(a).equals(Address.parse(b)); } catch { return a.trim().toLowerCase() === b.trim().toLowerCase(); }
}

async function autoSendTon(toAddress: string, amountTon: number): Promise<string> {
  const mnemonic = process.env.PROJECT_WALLET_MNEMONIC?.trim();
  if (!mnemonic) throw new Error("PROJECT_WALLET_MNEMONIC не задан в env Vercel");
  const words = mnemonic.split(/\s+/).filter(Boolean);
  if (words.length < 12) throw new Error("PROJECT_WALLET_MNEMONIC некорректна (мало слов)");
  const key = await mnemonicToWalletKey(words);
  const endpoint = process.env.TON_RPC_URL ?? "https://toncenter.com/api/v2/jsonRPC";
  const apiKey = process.env.TONCENTER_API_KEY ?? process.env.TONAPI_KEY;
  const client = new TonClient({ endpoint, ...(apiKey ? { apiKey } : {}) });
  const msg = internal({ to: toAddress, value: toNano(amountTon.toFixed(9)), bounce: false, body: "TONYX Withdrawal" });
  const order = ["v5r1", "v4"] as const;
  let lastErr: unknown = null;
  for (const ver of order) {
    try {
      if (ver === "v5r1") {
        const walletContract = WalletContractV5R1.create({ publicKey: key.publicKey, workchain: 0, walletId: { networkGlobalId: -239 } });
        const derived = walletContract.address.toString({ urlSafe: true, bounceable: false });
        if (!addrEqual(derived, PROJECT_WALLET)) throw new Error(`Мнемоника не соответствует PROJECT_WALLET`);
        const contract = client.open(walletContract);
        const bal = await contract.getBalance();
        const need = BigInt(Math.floor(amountTon * 1e9)) + 80_000_000n;
        if (bal < need) throw new Error(`Недостаточно TON на hot-wallet: ${(Number(bal) / 1e9).toFixed(4)}`);
        const seqno = await contract.getSeqno();
        await contract.sendTransfer({ secretKey: key.secretKey, seqno, messages: [msg], sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS });
        return `v5r1-seqno-${seqno}-${Date.now()}`;
      }
      const walletContract = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
      const derived = walletContract.address.toString({ urlSafe: true, bounceable: false });
      if (!addrEqual(derived, PROJECT_WALLET)) throw new Error(`V4 address mismatch`);
      const contract = client.open(walletContract);
      const bal = await contract.getBalance();
      const need = BigInt(Math.floor(amountTon * 1e9)) + 80_000_000n;
      if (bal < need) throw new Error(`Недостаточно TON на hot-wallet (v4)`);
      const seqno = await contract.getSeqno();
      await contract.sendTransfer({ secretKey: key.secretKey, seqno, messages: [msg] });
      return `v4-seqno-${seqno}-${Date.now()}`;
    } catch (e) { lastErr = e; }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "autoSend failed"));
}

router.post("/withdraw", async (req, res) => {
  const { telegramId, tonAmount, address } = req.body ?? {};
  if (!telegramId || !tonAmount || !address) { res.status(400).json({ error: "Нужны: telegramId, tonAmount, address" }); return; }
  const amount = Number(tonAmount);
  if (!isFinite(amount) || amount <= 0) { res.status(400).json({ error: "Некорректная сумма вывода" }); return; }
  if (amount < MIN_WITHDRAWAL_TON) { res.status(400).json({ error: `Минимальная сумма вывода: ${MIN_WITHDRAWAL_TON} TON` }); return; }
  if (amount > 10000) { res.status(400).json({ error: "Максимум за один вывод: 10 000 TON" }); return; }
  const userKey = String(telegramId);
  if (_withdrawalInProgress.has(userKey)) { res.status(429).json({ error: "Предыдущий запрос на вывод ещё обрабатывается. Подождите." }); return; }
  _withdrawalInProgress.add(userKey);
  const cleanAddress = String(address).trim();
  if (!isValidTonAddress(cleanAddress)) { res.status(400).json({ error: "Неверный TON адрес" }); return; }
  const commission = parseFloat((amount * COMMISSION_PCT).toFixed(8));
  const netAmount = parseFloat((amount - commission).toFixed(8));
  try {
    const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, String(telegramId))).then(r => r[0] ?? null);
    if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }
    const currentTon = Number(user.ton ?? 0);
    if (currentTon < amount) { res.status(400).json({ error: `Недостаточно TON. Баланс: ${currentTon.toFixed(4)} TON` }); return; }
    const newTon = parseFloat((currentTon - amount).toFixed(8));
    await db.update(usersTable).set({ ton: String(newTon), updatedAt: new Date() }).where(eq(usersTable.telegramId, String(telegramId)));
    const [withdrawal] = await db.insert(miniWithdrawalsTable).values({ telegramId: String(telegramId), amount: 0, address: cleanAddress, tonAmount: String(netAmount), tonPrice: null, status: "processing" }).returning();
    let txRef: string | null = null;
    let sendErr: unknown = null;
    try { txRef = await autoSendTon(cleanAddress, netAmount); } catch (e) { sendErr = e; console.error("[Wallet] Blockchain send failed:", e); }
    if (txRef) {
      await db.update(miniWithdrawalsTable).set({ status: "completed", txHash: txRef }).where(eq(miniWithdrawalsTable.id, withdrawal.id));
      void notifyUser(String(telegramId), `💸 <b>Вывод TON отправлен!</b>\n\nСумма: <b>${netAmount.toFixed(4)} TON</b>\nКошелёк: <code>${cleanAddress}</code>\n\n⏳ Средства поступят через <b>1–5 минут</b>.`);
      res.json({ id: withdrawal.id, status: "completed", txRef, netAmount, grossAmount: amount, commission, commissionPct: COMMISSION_PCT * 100, newBalance: newTon, message: `✅ ${netAmount.toFixed(4)} TON отправлено. Поступит на кошелёк через 1–5 минут.` });
    } else if (!process.env.PROJECT_WALLET_MNEMONIC) {
      await db.update(miniWithdrawalsTable).set({ status: "pending" }).where(eq(miniWithdrawalsTable.id, withdrawal.id));
      void notifyUser(String(telegramId), `⏳ <b>Вывод в обработке</b>\n\nСумма: <b>${netAmount.toFixed(4)} TON</b>\nКошелёк: <code>${cleanAddress}</code>\n\n⏳ Обработка <b>1–5 минут</b>, затем TON поступят на кошелёк.`);
      res.json({ id: withdrawal.id, status: "pending", netAmount, grossAmount: amount, commission, commissionPct: COMMISSION_PCT * 100, newBalance: newTon, message: `⏳ Вывод обрабатывается 1–5 минут. ${netAmount.toFixed(4)} TON поступят на ваш кошелёк.` });
    } else {
      const revertTon = parseFloat((newTon + amount).toFixed(8));
      await db.update(usersTable).set({ ton: String(revertTon), updatedAt: new Date() }).where(eq(usersTable.telegramId, String(telegramId)));
      await db.update(miniWithdrawalsTable).set({ status: "failed" }).where(eq(miniWithdrawalsTable.id, withdrawal.id));
      const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      res.status(500).json({ error: `Ошибка отправки: ${errMsg}. Баланс восстановлен.` });
    }
  } catch (e) {
    console.error("[Wallet] POST /withdraw error:", e);
    res.status(500).json({ error: "Ошибка базы данных" });
  } finally {
    _withdrawalInProgress.delete(userKey);
  }
});

router.post("/topup", async (req, res) => {
  try {
    const { telegramId, amount, memo, txBoc, walletAddress } = req.body ?? {};
    if (!telegramId || !amount) { res.status(400).json({ error: "Нужны: telegramId, amount" }); return; }
    const tonAmount = Number(amount);
    if (isNaN(tonAmount) || tonAmount <= 0) { res.status(400).json({ error: "Неверная сумма" }); return; }
    await db.insert(miniTopupRequestsTable).values({ telegramId: String(telegramId), tonAmount: String(tonAmount), memo: memo ?? null, txBoc: txBoc ?? null, walletAddress: walletAddress ?? null, status: "pending" });
    void scanOnce().catch((e) => console.warn("[Topup] scanOnce after intent:", e));
    res.json({ ok: true, message: "Пополнение зарегистрировано. Проверяем транзакцию..." });
  } catch (e) {
    console.error("[Topup] POST error:", e);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

router.post("/topup/verify", async (req, res) => {
  const { telegramId } = req.body ?? {};
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }
  try {
    await scanOnce().catch(() => undefined);
    const user = await db.select().from(usersTable).where(eq(usersTable.telegramId, String(telegramId))).then(r => r[0] ?? null);
    if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }
    const recent = await db.select().from(miniTopupRequestsTable).where(eq(miniTopupRequestsTable.telegramId, String(telegramId))).orderBy(desc(miniTopupRequestsTable.createdAt)).limit(5);
    const done = recent.find(r => r.status === "completed");
    if (done) {
      res.json({ found: true, credited: true, alreadyCredited: true, message: "✅ TON зачислено" });
      return;
    }
    res.json({ found: false, message: "Транзакция ещё не найдена. Ожидайте подтверждения..." });
  } catch (e) {
    console.error("[Topup] /verify error:", e);
    res.status(500).json({ error: "Ошибка проверки транзакции" });
  }
});

router.get("/status", async (_req, res) => {
  try {
    const hasMnemonic = Boolean(process.env.PROJECT_WALLET_MNEMONIC?.trim());
    res.json({ ready: hasMnemonic, projectWallet: PROJECT_WALLET, hasMnemonic, minWithdrawal: MIN_WITHDRAWAL_TON, commissionPct: COMMISSION_PCT * 100 });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "status error" });
  }
});

router.get("/withdrawals/:telegramId", async (req, res) => {
  try {
    const rows = await db.select().from(miniWithdrawalsTable).where(eq(miniWithdrawalsTable.telegramId, String(req.params.telegramId))).orderBy(desc(miniWithdrawalsTable.createdAt)).limit(30);
    res.json({ withdrawals: rows.map(w => ({ id: w.id, amount: w.amount, address: w.address, tonAmount: w.tonAmount ? Number(w.tonAmount) : null, tonPrice: w.tonPrice ? Number(w.tonPrice) : null, txHash: w.txHash ?? null, status: w.status, createdAt: w.createdAt.toISOString() })) });
  } catch (e) {
    res.status(500).json({ error: "Ошибка" });
  }
});

router.get("/history/:telegramId", async (req, res) => {
  try {
    const telegramId = String(req.params.telegramId);
    const [deps, wds] = await Promise.all([
      db.select().from(miniTopupRequestsTable).where(eq(miniTopupRequestsTable.telegramId, telegramId)).orderBy(desc(miniTopupRequestsTable.createdAt)).limit(20),
      db.select().from(miniWithdrawalsTable).where(eq(miniWithdrawalsTable.telegramId, telegramId)).orderBy(desc(miniWithdrawalsTable.createdAt)).limit(20),
    ]);
    res.json({
      deposits: deps.map(d => ({ id: d.id, tonAmount: d.tonAmount ? Number(d.tonAmount) : null, memo: d.memo, txHash: d.txHash, status: d.status, createdAt: d.createdAt.toISOString() })),
      withdrawals: wds.map(w => ({ id: w.id, tonAmount: w.tonAmount ? Number(w.tonAmount) : null, amount: w.amount, address: w.address ?? null, txHash: w.txHash ?? null, status: w.status, createdAt: w.createdAt.toISOString() })),
    });
  } catch (e) {
    res.status(500).json({ error: "Ошибка" });
  }
});

export default router;
