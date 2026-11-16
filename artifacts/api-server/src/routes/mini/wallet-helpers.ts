import { mnemonicToWalletKey } from "@ton/crypto";
import { WalletContractV4, WalletContractV5R1, TonClient, internal, toNano, SendMode, Address } from "@ton/ton";

export const MIN_WITHDRAWAL_TON = 0.1;
export const COMMISSION_PCT = 0.05;
export const PROJECT_WALLET =
  process.env.PROJECT_WALLET_ADDRESS ??
  "UQBDrAxyWlMMmtSgq5TjQyO1nKacS_nA0_7ZQ88m8eMmU1jO";

export const _withdrawalInProgress = new Set<string>();

const REJECT_OP_CODES = new Set([
  "0x7362d09c", "7362d09c",
  "0xf8a7ea5", "f8a7ea5", "0x0f8a7ea5", "0f8a7ea5",
  "0x178d4519", "178d4519",
  "0x7369676e", "7369676e",
]);

export function isValidTonAddress(addr: string): boolean {
  const cleaned = addr.trim();
  return /^[EUk][Qq][\w\-+/]{46,48}$/.test(cleaned) || /^0:[0-9a-fA-F]{64}$/.test(cleaned);
}

export function extractComment(decoded: { text?: string; comment?: string } | null | undefined): string {
  if (!decoded) return "";
  return String(decoded.text ?? decoded.comment ?? "").trim();
}

export function normalizeOp(op: string | number | null | undefined): string {
  if (op === null || op === undefined || op === "") return "";
  if (typeof op === "number") return `0x${op.toString(16)}`;
  const s = String(op).trim().toLowerCase();
  if (s.startsWith("0x")) return s;
  if (/^\d+$/.test(s)) return `0x${Number(s).toString(16)}`;
  return s.startsWith("0x") ? s : `0x${s.replace(/^0x/, "")}`;
}

export function addrEqual(a: string, b: string): boolean {
  try {
    return Address.parse(a).equals(Address.parse(b));
  } catch {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
}

export function isNativeTonTextDeposit(tx: {
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

export async function autoSendTon(toAddress: string, amountTon: number): Promise<string> {
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

export interface TonApiTx {
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

export async function queryProjectWalletTxs(): Promise<TonApiTx[]> {
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
