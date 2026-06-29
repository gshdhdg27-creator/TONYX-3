/**
 * Background deposit scanner — runs every 15 seconds.
 *
 * Strategy:
 *   1. Try TonAPI v2 (requires TONAPI_KEY, fastest)
 *   2. Fallback to Toncenter v2 (free, no key, slightly slower)
 *
 * For each incoming transaction that has a matching "TONYX-{telegramId}"
 * (or legacy "TOPUP_{telegramId}") comment, it credits the user's TON
 * balance and sends a Telegram bot notification.
 *
 * Idempotency: tx_hash is stored in mini_topup_requests with a UNIQUE
 * constraint, so no double-credits can occur even under concurrent runs.
 */

import { db } from "@workspace/db";
import { usersTable, miniTopupRequestsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { notifyUser } from "./botNotify.js";

const PROJECT_WALLET =
  process.env.PROJECT_WALLET_ADDRESS ??
  "UQBDrAxyWlMMmtSgq5TjQyO1nKacS_nA0_7ZQ88m8eMmU1jO";

const SCAN_INTERVAL_MS = 15_000;  // 15 seconds
const MIN_TON          = 0.05;    // ignore dust / test txs

let _scanLock = false;

/* ──────────────────────────────────────────────
   Normalised transaction shape
────────────────────────────────────────────── */
interface NormTx {
  hash:    string;
  lt:      string;
  utime:   number;
  valueTon: number;   // already converted from nanoTON
  comment: string;
}

/* ──────────────────────────────────────────────
   Memo parser
────────────────────────────────────────────── */
function extractTelegramId(comment: string): string | null {
  const m1 = comment.match(/^TONYX-(\d+)$/);
  if (m1) return m1[1];
  const m2 = comment.match(/^TOPUP_(\d+)$/);
  if (m2) return m2[1];
  return null;
}

/* ──────────────────────────────────────────────
   TonAPI v2 (primary)
────────────────────────────────────────────── */
async function fetchViaTonApi(): Promise<NormTx[] | null> {
  const apiKey = process.env.TONAPI_KEY;
  if (!apiKey) return null;

  const url = `https://tonapi.io/v2/blockchain/accounts/${encodeURIComponent(PROJECT_WALLET)}/transactions?limit=50&sort_order=desc`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12_000);
  try {
    const r = await fetch(url, {
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: ac.signal,
    });
    clearTimeout(timer);

    if (r.status === 401 || r.status === 403) {
      console.warn(`[DepositScanner] TonAPI auth failed (${r.status}) — switching to Toncenter`);
      return null;
    }
    if (!r.ok) {
      console.warn(`[DepositScanner] TonAPI error ${r.status}`);
      return null;
    }

    const data = await r.json() as {
      transactions?: Array<{
        hash: string;
        lt: string | number;
        utime: number;
        in_msg?: {
          value?: string | number;
          decoded_body?: { comment?: string } | null;
        } | null;
      }>;
    };

    return (data.transactions ?? []).map(tx => ({
      hash:     tx.hash,
      lt:       String(tx.lt),
      utime:    tx.utime,
      valueTon: Number(tx.in_msg?.value ?? 0) / 1e9,
      comment:  tx.in_msg?.decoded_body?.comment ?? "",
    }));
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error)?.name !== "AbortError") {
      console.warn("[DepositScanner] TonAPI fetch error:", (e as Error)?.message ?? e);
    }
    return null;
  }
}

/* ──────────────────────────────────────────────
   Toncenter v2 (fallback — free, no key)
────────────────────────────────────────────── */
async function fetchViaToncenter(): Promise<NormTx[]> {
  const apiKey = process.env.TONAPI_KEY ?? "";
  // Toncenter accepts an optional api_key query param
  const qs = new URLSearchParams({
    address: PROJECT_WALLET,
    limit:   "30",
    to_lt:   "0",
  });
  if (apiKey) qs.set("api_key", apiKey);

  const url = `https://toncenter.com/api/v2/getTransactions?${qs.toString()}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15_000);
  try {
    const r = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: ac.signal,
    });
    clearTimeout(timer);

    if (!r.ok) {
      console.warn(`[DepositScanner] Toncenter error ${r.status}`);
      return [];
    }

    const data = await r.json() as {
      ok: boolean;
      result?: Array<{
        transaction_id: { hash: string; lt: string };
        utime:           number;
        in_msg?: {
          value?:   string;
          message?: string;   // plain-text comment (decoded by toncenter)
        } | null;
      }>;
    };

    if (!data.ok || !data.result?.length) return [];

    return data.result.map(tx => {
      const rawMsg = tx.in_msg?.message ?? "";
      // Toncenter sometimes base64-encodes the message — try decode
      let comment = rawMsg;
      if (rawMsg && !rawMsg.includes("-") && rawMsg.length > 0) {
        try {
          const decoded = atob(rawMsg);
          if (decoded.startsWith("TONYX") || decoded.startsWith("TOPUP")) {
            comment = decoded;
          }
        } catch { /* not base64, use as-is */ }
      }
      return {
        hash:     tx.transaction_id.hash,
        lt:       tx.transaction_id.lt,
        utime:    tx.utime,
        valueTon: Number(tx.in_msg?.value ?? 0) / 1e9,
        comment,
      };
    });
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error)?.name !== "AbortError") {
      console.warn("[DepositScanner] Toncenter fetch error:", (e as Error)?.message ?? e);
    }
    return [];
  }
}

/* ──────────────────────────────────────────────
   Combined fetch with fallback
────────────────────────────────────────────── */
async function fetchRecentTxs(): Promise<NormTx[]> {
  const tonApiResult = await fetchViaTonApi();
  if (tonApiResult !== null) return tonApiResult;
  return fetchViaToncenter();
}

/* ──────────────────────────────────────────────
   Idempotency helpers
────────────────────────────────────────────── */
async function isAlreadyProcessed(txKey: string): Promise<boolean> {
  const rows = await db
    .select({ id: miniTopupRequestsTable.id })
    .from(miniTopupRequestsTable)
    .where(eq(miniTopupRequestsTable.txHash, txKey));
  return rows.length > 0;
}

/* ──────────────────────────────────────────────
   Credit user
────────────────────────────────────────────── */
async function creditUser(
  telegramId: string,
  receivedTon: number,
  memo: string,
  txKey: string,
): Promise<void> {
  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .then(r => r[0] ?? null);

  if (!user) {
    console.warn(`[DepositScanner] User not found: ${telegramId}`);
    return;
  }

  // Double-check inside transaction (guards against concurrent scanner instances)
  const doubleCheck = await isAlreadyProcessed(txKey);
  if (doubleCheck) {
    console.log(`[DepositScanner] Already processed: ${txKey}`);
    return;
  }

  const newTon = parseFloat((Number(user.ton ?? 0) + receivedTon).toFixed(8));

  try {
    await db.insert(miniTopupRequestsTable).values({
      telegramId,
      tonAmount:     String(receivedTon),
      memo,
      txBoc:         null,
      txHash:        txKey,
      walletAddress: null,
      status:        "completed",
    });
  } catch (insertErr: unknown) {
    const msg = insertErr instanceof Error ? insertErr.message : String(insertErr);
    if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("23505")) {
      console.log(`[DepositScanner] Concurrent insert — already credited: ${txKey}`);
      return;
    }
    throw insertErr;
  }

  await db
    .update(usersTable)
    .set({ ton: String(newTon), updatedAt: new Date() })
    .where(eq(usersTable.telegramId, telegramId));

  console.log(`[DepositScanner] ✅ +${receivedTon} TON → user ${telegramId} (tx=${txKey.slice(0, 16)}…)`);

  void notifyUser(
    telegramId,
    `💎 <b>Пополнение получено!</b>\n\n` +
    `Зачислено: <b>+${receivedTon.toFixed(4)} TON</b>\n` +
    `Комментарий: <code>${memo}</code>\n\n` +
    `Ваш баланс обновлён. Хорошей игры! 🎮`,
  );
}

/* ──────────────────────────────────────────────
   Single scan pass
────────────────────────────────────────────── */
export async function scanOnce(): Promise<void> {
  if (_scanLock) return;
  _scanLock = true;
  try {
    const txs = await fetchRecentTxs();
    if (!txs.length) return;

    let credited = 0;
    for (const tx of txs) {
      if (!tx.comment) continue;

      const telegramId = extractTelegramId(tx.comment);
      if (!telegramId) continue;

      if (tx.valueTon < MIN_TON) continue;

      const txKey = `${tx.hash}:${tx.lt}`;
      const alreadyDone = await isAlreadyProcessed(txKey);
      if (alreadyDone) continue;

      await creditUser(telegramId, tx.valueTon, tx.comment, txKey);
      credited++;
    }
    if (credited > 0) {
      console.log(`[DepositScanner] Scan complete — credited ${credited} deposit(s)`);
    }
  } catch (e) {
    console.error("[DepositScanner] scanOnce error:", e);
  } finally {
    _scanLock = false;
  }
}

/* ──────────────────────────────────────────────
   Startup
────────────────────────────────────────────── */
export function startDepositScanner(): void {
  const walletShort = PROJECT_WALLET.slice(0, 16);
  const hasTonApi   = !!process.env.TONAPI_KEY;
  console.log(
    `[DepositScanner] Starting — wallet: ${walletShort}… ` +
    `interval: ${SCAN_INTERVAL_MS / 1000}s ` +
    `API: ${hasTonApi ? "TonAPI+Toncenter" : "Toncenter only"}`,
  );

  void scanOnce();
  setInterval(() => { void scanOnce(); }, SCAN_INTERVAL_MS);
}
