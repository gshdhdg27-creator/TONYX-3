/**
 * Background deposit scanner — runs every 15 seconds (long-running)
 * or via Vercel Cron /api/cron/scan-deposits.
 *
 * Strategy:
 *   1. Try TonAPI v2 (with or without TONAPI_KEY)
 *   2. Fallback to Toncenter v2
 *
 * Memo formats:
 *   - 12-char deposit code (users.deposit_code)
 *   - TONYX-{telegramId}
 *   - TOPUP_{telegramId}
 *
 * Idempotency: txHash UNIQUE on mini_topup_requests.
 */

import { db } from "@workspace/db";
import { usersTable, miniTopupRequestsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { notifyUser } from "./botNotify.js";

const PROJECT_WALLET =
  process.env.PROJECT_WALLET_ADDRESS ??
  "UQBDrAxyWlMMmtSgq5TjQyO1nKacS_nA0_7ZQ88m8eMmU1jO";

const SCAN_INTERVAL_MS = 15_000;
const MIN_TON = Number(process.env.MIN_TON_THRESHOLD ?? "0.05");

let _scanLock = false;

interface NormTx {
  hash: string;
  lt: string;
  utime: number;
  valueTon: number;
  comment: string;
}

/** 12-char deposit codes: uppercase alphanumeric (exclude 0/1/I/O ambiguity optional — allow all A-Z2-9) */
const DEPOSIT_CODE_RE = /^[A-Z2-9]{12}$/;

interface ParsedMemo {
  type: "code" | "telegramId";
  value: string;
}

/** Extract text comment from TonAPI decoded_body (field is `text`, not `comment`). */
function extractTonApiComment(decoded: { text?: string; comment?: string } | null | undefined): string {
  if (!decoded) return "";
  const raw = decoded.text ?? decoded.comment ?? "";
  return String(raw).trim();
}

function tryBase64DecodeIfLooksLike(comment: string): string {
  const c = comment.trim();
  if (!c) return c;
  if (DEPOSIT_CODE_RE.test(c) || /^TONYX-\d+$/.test(c) || /^TOPUP_\d+$/.test(c)) {
    return c;
  }
  if (!/^[A-Za-z0-9+/]+=*$/.test(c) || c.length % 4 !== 0) return c;
  try {
    const decoded = atob(c);
    if (
      DEPOSIT_CODE_RE.test(decoded) ||
      decoded.startsWith("TONYX") ||
      decoded.startsWith("TOPUP")
    ) {
      return decoded;
    }
  } catch {
    /* not valid base64 */
  }
  return c;
}

function parseMemo(comment: string): ParsedMemo | null {
  const c = comment.trim();
  if (DEPOSIT_CODE_RE.test(c)) return { type: "code", value: c };
  const m1 = c.match(/^TONYX-(\d+)$/);
  if (m1) return { type: "telegramId", value: m1[1] };
  const m2 = c.match(/^TOPUP_(\d+)$/);
  if (m2) return { type: "telegramId", value: m2[1] };
  return null;
}

async function fetchViaTonApi(): Promise<NormTx[] | null> {
  const apiKey = process.env.TONAPI_KEY;
  const url = `https://tonapi.io/v2/blockchain/accounts/${encodeURIComponent(PROJECT_WALLET)}/transactions?limit=50&sort_order=desc`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12_000);
  try {
    const r = await fetch(url, { headers, signal: ac.signal });
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
          decoded_body?: { text?: string; comment?: string } | null;
        } | null;
      }>;
    };

    return (data.transactions ?? []).map(tx => ({
      hash: tx.hash,
      lt: String(tx.lt),
      utime: tx.utime,
      valueTon: Number(tx.in_msg?.value ?? 0) / 1e9,
      // CRITICAL: TonAPI text_comment uses decoded_body.text (not .comment)
      comment: extractTonApiComment(tx.in_msg?.decoded_body),
    }));
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error)?.name !== "AbortError") {
      console.warn("[DepositScanner] TonAPI fetch error:", (e as Error)?.message ?? e);
    }
    return null;
  }
}

async function fetchViaToncenter(): Promise<NormTx[]> {
  const apiKey = process.env.TONAPI_KEY ?? process.env.TONCENTER_API_KEY ?? "";
  const qs = new URLSearchParams({
    address: PROJECT_WALLET,
    limit: "30",
    to_lt: "0",
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
        utime: number;
        in_msg?: {
          value?: string;
          message?: string;
        } | null;
      }>;
    };

    if (!data.ok || !data.result?.length) return [];

    return data.result.map(tx => {
      const rawMsg = tx.in_msg?.message ?? "";
      let comment = rawMsg;
      if (rawMsg && !rawMsg.includes("-") && rawMsg.length > 0) {
        try {
          const decoded = atob(rawMsg);
          if (
            DEPOSIT_CODE_RE.test(decoded) ||
            decoded.startsWith("TONYX") ||
            decoded.startsWith("TOPUP")
          ) {
            comment = decoded;
          }
        } catch {
          /* use as-is */
        }
      }
      return {
        hash: tx.transaction_id.hash,
        lt: tx.transaction_id.lt,
        utime: tx.utime,
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

async function fetchRecentTxs(): Promise<NormTx[]> {
  // Prefer TonAPI even without key (public rate limits still work for small traffic)
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

async function isAlreadyProcessed(txKey: string): Promise<boolean> {
  const rows = await db
    .select({ id: miniTopupRequestsTable.id })
    .from(miniTopupRequestsTable)
    .where(eq(miniTopupRequestsTable.txHash, txKey));
  return rows.length > 0;
}

async function findUser(parsed: ParsedMemo) {
  if (parsed.type === "code") {
    const code = String(parsed.value ?? "").trim().toUpperCase();
    const byUpper = await db
      .select()
      .from(usersTable)
      .where(sql`upper(${usersTable.depositCode}) = ${code}`)
      .then(r => r[0] ?? null);
    if (byUpper) return byUpper;
    // fallback exact match
    return db
      .select()
      .from(usersTable)
      .where(eq(usersTable.depositCode, parsed.value))
      .then(r => r[0] ?? null);
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

  const doubleCheck = await isAlreadyProcessed(txKey);
  if (doubleCheck) {
    console.log(`[DepositScanner] Already processed: ${txKey}`);
    return false;
  }

  const newTon = parseFloat((Number(user.ton ?? 0) + receivedTon).toFixed(8));

  try {
    await db.insert(miniTopupRequestsTable).values({
      telegramId: user.telegramId,
      tonAmount: String(receivedTon),
      memo,
      txBoc: null,
      txHash: txKey,
      walletAddress: null,
      status: "completed",
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

      let comment = tx.comment.trim().replace(/\s+/g, " ");
      comment = tryBase64DecodeIfLooksLike(comment);

      let parsed = parseMemo(comment);
      if (!parsed) {
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

export function startDepositScanner(): void {
  const walletShort = PROJECT_WALLET.slice(0, 16);
  const hasTonApi = !!process.env.TONAPI_KEY;
  console.log(
    `[DepositScanner] Starting — wallet: ${walletShort}… ` +
    `interval: ${SCAN_INTERVAL_MS / 1000}s ` +
    `API: ${hasTonApi ? "TonAPI(keyed)+Toncenter" : "TonAPI(public)+Toncenter"} ` +
    `MIN_TON=${MIN_TON}`,
  );

  void scanOnce();
  setInterval(() => {
    void scanOnce();
  }, SCAN_INTERVAL_MS);
}
