/**
 * Background deposit scanner — runs every 30 seconds.
 * Scans recent incoming transactions to the project wallet,
 * matches comments of the form "TONYX-{telegramId}" (or legacy "TOPUP_{telegramId}"),
 * and auto-credits users who sent TON with the correct memo.
 */

import { db } from "@workspace/db";
import { usersTable, miniTopupRequestsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { notifyUser } from "./botNotify.js";

const PROJECT_WALLET =
  process.env.PROJECT_WALLET_ADDRESS ??
  "UQA8d39yaqa-CGw6BUCQw6U3LGelzpS3GxFaVwVDY3BnCDwe";

const SCAN_INTERVAL_MS = 30_000; // 30 seconds
const MIN_TON = 0.05;            // ignore dust

interface TonApiTx {
  hash: string;
  lt: string | number;
  utime: number;
  in_msg?: {
    value?: string | number;
    decoded_body?: { comment?: string } | null;
  } | null;
}

/** Parse memo → telegramId (supports both TONYX-ID and legacy TOPUP_ID) */
function extractTelegramId(comment: string): string | null {
  const m1 = comment.match(/^TONYX-(\d+)$/);
  if (m1) return m1[1];
  const m2 = comment.match(/^TOPUP_(\d+)$/);
  if (m2) return m2[1];
  return null;
}

/** Fetch up to 100 recent txs for the project wallet via TonAPI */
async function fetchRecentTxs(): Promise<TonApiTx[]> {
  const encodedAddr = encodeURIComponent(PROJECT_WALLET);
  const apiKey      = process.env.TONAPI_KEY;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const r = await fetch(
      `https://tonapi.io/v2/blockchain/accounts/${encodedAddr}/transactions?limit=100&sort_order=desc`,
      { headers, signal: controller.signal },
    );
    clearTimeout(timer);
    if (!r.ok) {
      console.warn(`[DepositScanner] TonAPI returned ${r.status}`);
      return [];
    }
    const data = await r.json() as { transactions?: TonApiTx[] };
    return data.transactions ?? [];
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error)?.name !== "AbortError") {
      console.warn("[DepositScanner] fetch error:", (e as Error)?.message ?? e);
    }
    return [];
  }
}

/** Check if a txKey was already processed */
async function isAlreadyProcessed(txKey: string): Promise<boolean> {
  const rows = await db
    .select({ id: miniTopupRequestsTable.id })
    .from(miniTopupRequestsTable)
    .where(eq(miniTopupRequestsTable.txHash, txKey));
  return rows.length > 0;
}

/** Credit user and record the transaction */
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

  const newTon = parseFloat((Number(user.ton ?? 0) + receivedTon).toFixed(8));

  await db
    .update(usersTable)
    .set({ ton: String(newTon), updatedAt: new Date() })
    .where(eq(usersTable.telegramId, telegramId));

  await db.insert(miniTopupRequestsTable).values({
    telegramId,
    tonAmount: String(receivedTon),
    memo,
    txBoc: null,
    txHash: txKey,
    walletAddress: null,
    status: "completed",
  });

  console.log(
    `[DepositScanner] ✅ Credited ${receivedTon} TON → ${telegramId} (txKey=${txKey})`,
  );

  void notifyUser(
    telegramId,
    `💎 <b>Пополнение TONYX получено!</b>\n\n` +
    `Зачислено: <b>+${receivedTon.toFixed(4)} TON</b>\n` +
    `Комментарий: <code>${memo}</code>\n\n` +
    `Ваш баланс обновлён. Хорошей игры! 🎮`,
  );
}

/** Single scan pass — exported so the cron endpoint can trigger it directly */
export async function scanOnce(): Promise<void> {
  try {
    const txs = await fetchRecentTxs();
    if (!txs.length) return;

    for (const tx of txs) {
      const comment = tx.in_msg?.decoded_body?.comment ?? "";
      if (!comment) continue;

      const telegramId = extractTelegramId(comment);
      if (!telegramId) continue;

      const valueTon = Number(tx.in_msg?.value ?? 0) / 1e9;
      if (valueTon < MIN_TON) continue;

      const txKey = `${tx.hash}-${String(tx.lt)}`;

      const alreadyDone = await isAlreadyProcessed(txKey);
      if (alreadyDone) continue;

      await creditUser(telegramId, valueTon, comment, txKey);
    }
  } catch (e) {
    console.error("[DepositScanner] scanOnce error:", e);
  }
}

/** Start the background scanner (call once at server startup) */
export function startDepositScanner(): void {
  console.log(
    `[DepositScanner] Started — scanning wallet ${PROJECT_WALLET.slice(0, 12)}… every ${SCAN_INTERVAL_MS / 1000}s`,
  );

  // Run immediately on start, then on interval
  void scanOnce();
  setInterval(() => { void scanOnce(); }, SCAN_INTERVAL_MS);
}
