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
const MIN_TON = Number(process.env.MIN_TON_THRESHOLD ?? "0.05"); // ignore dust / test txs (configurable)

let _scanLock = false;

/* ──────────────────────────────────────────────
   Normalised transaction shape
───────────────────────────────────────────── */
interface NormTx {
  hash:    string;
  lt:      string;
  utime:   number;
  valueTon: number;   // already converted from nanoTON
  comment: string;
}

/* ──────────────────────────────────────────────
   Memo parser — extracts deposit code
   Format 1 (new):  "A3K7X9M2P1Q8"      — exactly 12 uppercase alphanumeric
   Format 2 (legacy): "TONYX-{telegramId}" or "TOPUP_{telegramId}"
───────────────────────────────────────────── */
const DEPOSIT_CODE_RE = /^[A-Z2-9]{12}$/;

interface ParsedMemo {
  type: "code" | "telegramId";
  value: string;
}

/**
 * TON wallet comments are sometimes base64-encoded by the sending wallet.
 * If the string looks like base64 (and isn't already a plain deposit-code /
 * legacy memo), try decoding it; otherwise return the original string.
 */
function tryBase64DecodeIfLooksLike(comment: string): string {
  const c = comment.trim();
  if (!c) return c;
  // Already a recognizable plain memo — don't touch it.
  if (DEPOSIT_CODE_RE.test(c) || /^TONYX-\d+$/.test(c) || /^TOPUP_\d+$/.test(c)) {
    return c;
  }
  // Base64 charset only, length multiple of 4, no spaces.
  if (!/^[A-Za-z0-9+/]+=*$/.test(c) || c.length % 4 !== 0) return c;
  try {
    const decoded = atob(c);
    // Only accept the decode if it looks like a real memo.
    if (
      DEPOSIT_CODE_RE.test(decoded) ||
      decoded.startsWith("TONYX") ||
      decoded.startsWith("TOPUP")
    ) {
      return decoded;
    }
  } catch {
    // not valid base64 — fall through
  }
  return c;
}

function parseMemo(comment: string): ParsedMemo | null {
  const c = comment.trim();
  // New format: 12-char deposit code
  if (DEPOSIT_CODE_RE.test(c)) return { type: "code", value: c };
  // Legacy format: TONYX-{id}
  const m1 = c.match(/^TONYX-(\d+)$/);
  if (m1) return { type: "telegramId", value: m1[1] };
  // Legacy format: TOPUP_{id}
  const m2 = c.match(/^TOPUP_(\d+)$/);
  if (m2) return { type: "telegramId", value: m2[1] };
  return null;
}

/* ──────────────────────────────────────────────
   TonAPI v2 (primary)
───────────────────────────────────────────── */
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
───────────────────────────────────────────── */
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
───────────────────────────────────────────── */
async function fetchRecentTxs(): Promise<NormTx[]> {
  const tonApiResult = await fetchViaTonApi();
  if (tonApiResult !== null) {
    console.log(`[DepositScanner] TonAPI returned ${tonApiResult.length} tx(s)`);
    for (const tx of tonApiResult) {
      tx.comment = (tx.comment ?? "").trim();
      if (tx.comment) {
        const decoded = tryBase64DecodeIfLooksLike(tx.comment);
        if (decoded !== tx.comment) {
          console.log(`[DepositScanner] Decoded TonAPI comment base64 -> "${decoded}" for tx ${tx.hash}:${tx.lt}`);
          tx.comment = decoded;
        }
      }
    }
    return tonApiResult;
  }
  const toncenterResult = await fetchViaToncenter();
  console.log(`[DepositScanner] Toncenter returned ${toncenterResult.length} tx(s)`);
  for (const tx of toncenterResult) {
    tx.comment = (tx.comment ?? "").trim();
    if (tx.comment) {
      const decoded = tryBase64DecodeIfLooksLike(tx.comment);
      if (decoded !== tx.comment) {
        console.log(`[DepositScanner] Decoded Toncenter comment base64 -> "${decoded}" for tx ${tx.hash}:${tx.lt}`);
        tx.comment = decoded;
      }
    }
  }
  return toncenterResult;
}

/* ──────────────────────────────────────────────
   Idempotency helpers
───────────────────────────────────────────── */
async function isAlreadyProcessed(txKey: string): Promise<boolean> {
  const rows = await db
    .select({ id: miniTopupRequestsTable.id })
    .from(miniTopupRequestsTable)
    .where(eq(miniTopupRequestsTable.txHash, txKey));
  return rows.length > 0;
}

/* ──────────────────────────────────────────────
   Credit user — looks up by deposit code (new) or telegramId (legacy)
───────────────────────────────────────────── */
async function findUser(parsed: ParsedMemo) {
  if (parsed.type === "code") {
    const code = String(parsed.value ?? "").trim().toUpperCase();
    // Drizzle does not currently expose a generic upper() helper in this repo; use raw SQL fragment
    // We'll attempt a safe raw where using sql`` if available. If not, fallback to equality (case-sensitive).
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { sql } = require("drizzle-orm");
      return db
        .select()
        .from(usersTable)
        .where(sql`upper(${usersTable.depositCode}) = ${code}`)
        .then((r: any[]) => r[0] ?? null);
    } catch (e) {
      // Fallback: case-sensitive search (best effort)
      return db
        .select()
        .from(usersTable)
        .where(eq(usersTable.depositCode, parsed.value))
        .then(r => r[0] ?? null);
    }
  }
  return db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, parsed.value))
    .then(r => r[0] ?? null);
}

async function creditUser(
  parsed: ParsedMemo,
  receivedTon: number,
  memo: string,
  txKey: string,
): Promise<boolean> {
  const user = await findUser(parsed);

  if (!user) {
    const hint = parsed.type === "code" ? `code=${parsed.value}` : `telegramId=${parsed.value}`;
    console.warn(`[DepositScanner] User not found (${hint})`);
    return false;
  }

  // Double-check inside transaction (guards against concurrent scanner instances)
  const doubleCheck = await isAlreadyProcessed(txKey);
  if (doubleCheck) {
    console.log(`[DepositScanner] Already processed: ${txKey}`);
    return false;
  }

  const newTon = parseFloat((Number(user.ton ?? 0) + receivedTon).toFixed(8));

  try {
    await db.insert(miniTopupRequestsTable).values({
      telegramId:    user.telegramId,
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
      return false;
    }
    throw insertErr;
  }

  await db
    .update(usersTable)
    .set({ ton: String(newTon), updatedAt: new Date() })
    .where(eq(usersTable.telegramId, user.telegramId));

  console.log(
    `[DepositScanner] ✅ +${receivedTon} TON → user ${user.telegramId} ` +
    `(code=${user.depositCode ?? "legacy"}, tx=${txKey.slice(0, 16)}…)`,
  );

  void notifyUser(
    user.telegramId,
    `💎 <b>Пополнение получено!</b>\n\n` +
    `Зачислено: <b>+${receivedTon.toFixed(4)} TON</b>\n` +
    `Ваш баланс обновлён. Хорошей игры! 🎮`,
  );
  return true;
}

/* ──────────────────────────────────────────────
   Single scan pass
───────────────────────────────────────────── */
export async function scanOnce(): Promise<void> {
  if (_scanLock) return;
  _scanLock = true;
  try {
    const txs = await fetchRecentTxs();
    if (!txs.length) {
      console.log("[DepositScanner] No transactions returned");
      return;
    }

    let credited = 0;
    for (const tx of txs) {
      const txKey = `${tx.hash}:${tx.lt}`;
      console.log(`[DepositScanner] TX: ${txKey} value=${tx.valueTon} comment="${tx.comment}"`);

      if (!tx.comment || !tx.comment.trim()) {
        console.log(`[DepositScanner] SKIP ${txKey} reason=no_comment`);
        continue;
      }

      // normalize and attempt base64 decode
      let comment = tx.comment.trim().replace(/\s+/g, " ");
      comment = tryBase64DecodeIfLooksLike(comment);

      let parsed = parseMemo(comment);
      if (!parsed) {
        // try uppercase fallback (some users paste lowercase deposit codes)
        parsed = parseMemo(comment.toUpperCase());
      }
      if (!parsed) {
        console.log(`[DepositScanner] SKIP ${txKey} reason=parse_failed comment="${comment}"`);
        continue;
      }

      if (tx.valueTon < MIN_TON) {
        console.log(`[DepositScanner] SKIP ${txKey} reason=dust value=${tx.valueTon}`);
        continue;
      }

      const alreadyDone = await isAlreadyProcessed(txKey);
      if (alreadyDone) {
        console.log(`[DepositScanner] SKIP ${txKey} reason=already_processed`);
        continue;
      }

      const ok = await creditUser(parsed, tx.valueTon, comment, txKey);
      if (!ok) {
        console.log(`[DepositScanner] SKIP ${txKey} reason=user_not_credited`);
        continue;
      }
      credited++;
    }
    if (credited > 0) {
      console.log(`[DepositScanner] Scan complete — actually credited ${credited} deposit(s)`);
    } else {
      console.log("[DepositScanner] Scan complete — nothing credited");
    }
  } catch (e) {
    console.error("[DepositScanner] scanOnce error:", e);
  } finally {
    _scanLock = false;
  }
}

/* ──────────────────────────────────────────────
   Startup
───────────────────────────────────────────── */
export function startDepositScanner(): void {
  const walletShort = PROJECT_WALLET.slice(0, 16);
  const hasTonApi   = !!process.env.TONAPI_KEY;
  console.log(
    `[DepositScanner] Starting — wallet: ${walletShort}… ` +
    `interval: ${SCAN_INTERVAL_MS / 1000}s ` +
    `API: ${hasTonApi ? "TonAPI+Toncenter" : "Toncenter only"} ` +
    `MIN_TON=${MIN_TON}`,
  );

  void scanOnce();
  setInterval(() => { void scanOnce(); }, SCAN_INTERVAL_MS);
}
