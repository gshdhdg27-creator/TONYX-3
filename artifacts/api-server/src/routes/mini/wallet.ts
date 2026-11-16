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
const PROJECT_WALLET =
  process.env.PROJECT_WALLET_ADDRESS ??
  "UQBDrAxyWlMMmtSgq5TjQyO1nKacS_nA0_7ZQ88m8eMmU1jO";

const _withdrawalInProgress = new Set<string>();

const REJECT_OP_CODES = new Set([
  "0x7362d09c", "7362d09c",
  "0xf8a7ea5", "f8a7ea5", "0x0f8a7ea5", "0f8a7ea5",
  "0x178d4519", "178d4519",
  "0x7369676e", "7369676e",
]);

function isValidTonAddress(addr: string): boolean {
  const cleaned = addr.trim();
  return /^[EUk][Qq][\w\-+/]{46,48}$/.test(cleaned) || /^0:[0-9a-fA-F]{64}$/.test(cleaned);
}

function extractComment(decoded: { text?: string; comment?: string } | null | undefined): string {
  if (!decoded) return "";
  return String(decoded.text ?? decoded.comment ?? "").trim();
}

function normalizeOp(op: string | number | null | undefined): string {
  if (op === null || op === undefined || op === "") return "";
  if (typeof op === "number") return `0x${op.toString(16)}`;
  const s = String(op).trim().toLowerCase();
  if (s.startsWith("0x")) return s;
  if (/^\d+$/.test(s)) return `0x${Number(s).toString(16)}`;
  return s.startsWith("0x") ? s : `0x${s.replace(/^0x/, "")}`;
}

function addrEqual(a: string, b: string): boolean {
  try {
    return Address.parse(a).equals(Address.parse(b));
  } catch {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
}

function isNativeTonTextDeposit(tx: {
  success?: boolean;
  in_msg?: {
    msg_type?: string;
    bounced?: boolean;
    value?: string | number;
    op_code?: string | number;
    decoded_op_name?: string;
    decoded_body?: Record<string, unknown> | null;
  } | null;
}): boolean {
  if (tx.success === false) return false;
  const im = tx.in_msg;
  if (!im) return false;
  if (im.bounced === true) return false;
  const msgType = String(im.msg_type ?? "").toLowerCase();
  if (msgType && msgType !== "int_msg" && msgType !== "internal") return false;
  const opName = String(im.decoded_op_name ?? "").toLowerCase();
  if (opName.includes("jetton") || opName.includes("token")) return false;
  if (opName && !["", "text_comment", "comment"].includes(opName)) return false;
  const op = normalizeOp(im.op_code);
  if (op && REJECT_OP_CODES.has(op)) return false;
  if (op && op !== "0x0" && op !== "0x00" && op !== "0x00000000") return false;
  const body = im.decoded_body;
  if (body && typeof body === "object") {
    const keys = Object.keys(body).map(k => k.toLowerCase());
    if (keys.some(k => k.includes("jetton") || k.includes("forward_payload") || k.includes("forward_ton"))) return false;
    if (!("text" in body) && !("comment" in body) && ("amount" in body || "query_id" in body)) return false;
  }
  return Number(im.value ?? 0) / 1e9 > 0;
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

  const msg = internal({
    to: toAddress,
    value: toNano(amountTon.toFixed(9)),
    bounce: false,
    body: "TONYX Withdrawal",
  });

  const preferred = (process.env.PROJECT_WALLET_VERSION ?? "v5r1").toLowerCase();
  const order = preferred === "v4" ? (["v5r1", "v4"] as const) : (["v5r1", "v4"] as const);

  let lastErr: unknown = null;
  for (const ver of order) {
    try {
      if (ver === "v5r1") {
        const walletContract = WalletContractV5R1.create({
          publicKey: key.publicKey,
          workchain: 0,
          walletId: { networkGlobalId: -239 },
        });
        const derived = walletContract.address.toString({ urlSafe: true, bounceable: false });
        console.log(`[Wallet] V5R1 derived=${derived}`);
        if (!addrEqual(derived, PROJECT_WALLET)) {
          console.warn(`[Wallet] V5R1 address mismatch: derived=${derived} expected=${PROJECT_WALLET}`);
          throw new Error(
            `Мнемоника не соответствует PROJECT_WALLET. derived=${derived.slice(0, 12)}… expected=${PROJECT_WALLET.slice(0, 12)}…`,
          );
        }
        const contract = client.open(walletContract);
        const bal = await contract.getBalance();
        const need = BigInt(Math.floor(amountTon * 1e9)) + 80_000_000n;
        if (bal < need) {
          throw new Error(
            `Недостаточно TON на hot-wallet: ${(Number(bal) / 1e9).toFixed(4)} TON, нужно ≥ ${(Number(need) / 1e9).toFixed(4)}. Пополните ${PROJECT_WALLET.slice(0, 10)}…`,
          );
        }
        const seqno = await contract.getSeqno();
        await contract.sendTransfer({
          secretKey: key.secretKey,
          seqno,
          messages: [msg],
          sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
        });
        console.log(`[Wallet] ✅ Auto-send V5R1 seqno=${seqno} amount=${amountTon} → ${toAddress.slice(0, 12)}…`);
        return `v5r1-seqno-${seqno}-${Date.now()}`;
      }

      const walletContract = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
      const derived = walletContract.address.toString({ urlSafe: true, bounceable: false });
      console.log(`[Wallet] V4 derived=${derived}`);
      if (!addrEqual(derived, PROJECT_WALLET)) {
        throw new Error(`V4 address mismatch: ${derived.slice(0, 12)}…`);
      }
      const contract = client.open(walletContract);
      const bal = await contract.getBalance();
      const need = BigInt(Math.floor(amountTon * 1e9)) + 80_000_000n;
      if (bal < need) {
        throw new Error(`Недостаточно TON на hot-wallet (v4): ${(Number(bal) / 1e9).toFixed(4)} TON`);
      }
      const seqno = await contract.getSeqno();
      await contract.sendTransfer({ secretKey: key.secretKey, seqno, messages: [msg] });
      console.log(`[Wallet] ✅ Auto-send V4 seqno=${seqno} amount=${amountTon}`);
      return `v4-seqno-${seqno}-${Date.now()}`;
    } catch (e) {
      lastErr = e;
      console.warn(`[Wallet] autoSend ${ver} failed:`, e instanceof Error ? e.message : e);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "autoSend failed"));
}

interface TonApiTx {
  hash: string;
  lt: string | number;
  utime: number;
  success?: boolean;
  in_msg?: {
    msg_type?: string;
    bounced?: boolean;
    value?: string | number;
    op_code?: string | number;
    decoded_op_name?: string;
    decoded_body?: ({ text?: string; comment?: string } & Record<string, unknown>) | null;
  } | null;
}

async function queryProjectWalletTxs(): Promise<TonApiTx[]> {
  const encodedAddr = encodeURIComponent(PROJECT_WALLET);
  const apiKey = process.env.TONAPI_KEY;
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
    const data = (await r.json()) as { transactions?: TonApiTx[] };
    return data.transactions ?? [];
  } catch {
    clearTimeout(timer);
    return [];
  }
}

router.get("/status", async (_req, res) => {
  try {
    const hasMnemonic = Boolean(process.env.PROJECT_WALLET_MNEMONIC?.trim());
    const version = process.env.PROJECT_WALLET_VERSION ?? "v5r1";
    let hotBalanceTon: number | null = null;
    let derivedMatch: boolean | null = null;
    let derivedAddress: string | null = null;
    let diagError: string | null = null;

    try {
      const r = await fetch(`https://tonapi.io/v2/accounts/${encodeURIComponent(PROJECT_WALLET)}`);
      if (r.ok) {
        const d = (await r.json()) as { balance?: number | string };
        hotBalanceTon = Number(d.balance ?? 0) / 1e9;
      }
    } catch (e) {
      diagError = e instanceof Error ? e.message : String(e);
    }

    if (hasMnemonic) {
      try {
        const words = process.env.PROJECT_WALLET_MNEMONIC!.trim().split(/\s+/).filter(Boolean);
        const key = await mnemonicToWalletKey(words);
        const w = WalletContractV5R1.create({
          publicKey: key.publicKey,
          workchain: 0,
          walletId: { networkGlobalId: -239 },
        });
        derivedAddress = w.address.toString({ urlSafe: true, bounceable: false });
        derivedMatch = addrEqual(derivedAddress, PROJECT_WALLET);
      } catch (e) {
        diagError = e instanceof Error ? e.message : String(e);
      }
    }

    const ready =
      hasMnemonic &&
      derivedMatch === true &&
      hotBalanceTon != null &&
      hotBalanceTon >= MIN_WITHDRAWAL_TON + 0.08;

    res.json({
      ready,
      projectWallet: PROJECT_WALLET,
      hasMnemonic,
      version,
      hotBalanceTon,
      derivedAddress,
      derivedMatch,
      minWithdrawal: MIN_WITHDRAWAL_TON,
      commissionPct: COMMISSION_PCT * 100,
      diagError,
      hint: !hasMnemonic
        ? "Добавь PROJECT_WALLET_MNEMONIC в Vercel env и Redeploy"
        : derivedMatch === false
          ? "Мнемоника не от этого кошелька — проверь seed UQBDrAxy…"
          : (hotBalanceTon ?? 0) < MIN_WITHDRAWAL_TON + 0.08
            ? `Пополни hot-wallet минимум до ~${(MIN_WITHDRAWAL_TON + 0.15).toFixed(2)} TON`
            : "Автовывод готов",
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "status error" });
  }
});

router.post("/withdraw", async (req, res) => {
  const { telegramId, tonAmount, address } = req.body ?? {};
  if (!telegramId || !tonAmount || !address) {
    res.status(400).json({ error: "Нужны: telegramId, tonAmount, address" });
    return;
  }
  const amount = Number(tonAmount);
  if (!isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "Некорректная сумма вывода" });
    return;
  }
  if (amount < MIN_WITHDRAWAL_TON) {
    res.status(400).json({ error: `Минимальная сумма вывода: ${MIN_WITHDRAWAL_TON} TON` });
    return;
  }
  if (amount > 10000) {
    res.status(400).json({ error: "Максимум за один вывод: 10 000 TON" });
    return;
  }
  const userKey = String(telegramId);
  if (_withdrawalInProgress.has(userKey)) {
    res.status(429).json({ error: "Предыдущий запрос на вывод ещё обрабатывается. Подождите." });
    return;
  }
  _withdrawalInProgress.add(userKey);
  const cleanAddress = String(address).trim();
  if (!isValidTonAddress(cleanAddress)) {
    res.status(400).json({ error: "Неверный TON адрес (UQ…/EQ…/0:hex)" });
    return;
  }
  const commission = parseFloat((amount * COMMISSION_PCT).toFixed(8));
  const netAmount = parseFloat((amount - commission).toFixed(8));
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
      void notifyUser(
        String(telegramId),
        `💸 <b>Вывод TON отправлен!</b>\n\nОтправлено: <b>${netAmount.toFixed(4)} TON</b>\nНа адрес: <code>${cleanAddress}</code>\nКомиссия: ${commission.toFixed(4)} TON (5%)\n\n⏳ Средства поступят на ваш кошелёк через <b>1–5 минут</b>.`,
      );
      res.json({
        id: withdrawal.id,
        status: "completed",
        txRef,
        netAmount,
        grossAmount: amount,
        commission,
        commissionPct: COMMISSION_PCT * 100,
        newBalance: newTon,
        message: `✅ ${netAmount.toFixed(4)} TON отправлено. Поступит на кошелёк через 1–5 минут.`,
      });
    } else if (!process.env.PROJECT_WALLET_MNEMONIC) {
      await db.update(miniWithdrawalsTable)
        .set({ status: "pending" })
        .where(eq(miniWithdrawalsTable.id, withdrawal.id));
      void notifyUser(
        String(telegramId),
        `⏳ <b>Вывод в обработке</b>\n\nСумма: <b>${netAmount.toFixed(4)} TON</b> (после комиссии 5%)\nКошелёк: <code>${cleanAddress}</code>\n\n⏳ Обработка займёт <b>1–5 минут</b>, после чего TON поступят на ваш кошелёк.`,
      );
      res.json({
        id: withdrawal.id,
        status: "pending",
        netAmount,
        grossAmount: amount,
        commission,
        commissionPct: COMMISSION_PCT * 100,
        newBalance: newTon,
        message: `⏳ Вывод обрабатывается 1–5 минут. ${netAmount.toFixed(4)} TON поступят на ваш кошелёк.`,
      });
    } else {
      const revertTon = parseFloat((newTon + amount).toFixed(8));
      await db.update(usersTable)
        .set({ ton: String(revertTon), updatedAt: new Date() })
        .where(eq(usersTable.telegramId, String(telegramId)));
      await db.update(miniWithdrawalsTable)
        .set({ status: "failed" })
        .where(eq(miniWithdrawalsTable.id, withdrawal.id));
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

export default router;
