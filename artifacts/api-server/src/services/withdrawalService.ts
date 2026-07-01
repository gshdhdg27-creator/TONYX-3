import { eq, sql } from "drizzle-orm";
import { TonClient, WalletContractV4, internal } from "@ton/ton";
import { toNano } from "@ton/core";
import { mnemonicToWalletKey } from "@ton/crypto";
import { db } from "@workspace/db";
import { usersTable, withdrawalsTable } from "@workspace/db/schema";
import { checkTonAddress } from "./tonAddress";

const FEE_PERCENT = 5;
const MIN_WITHDRAWAL_TON = 0.5; // защита от суммы, которую съест комиссия сети

let cachedClient: TonClient | null = null;
function getClient(): TonClient {
  if (!cachedClient) {
    cachedClient = new TonClient({
      endpoint: "https://toncenter.com/api/v2/jsonRPC",
      apiKey: process.env.TONCENTER_API_KEY,
    });
  }
  return cachedClient;
}

export function calculateWithdrawal(amount: number) {
  const fee = +(amount * FEE_PERCENT / 100).toFixed(8);
  const toReceive = +(amount - fee).toFixed(8);
  return { amount, fee, toReceive };
}

export class WithdrawalError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

interface RequestWithdrawalParams {
  telegramId: string;
  address: string;
  amount: number;
  idempotencyKey: string; // сгенерировать на клиенте один раз при нажатии кнопки
}

/**
 * Шаг 1: валидация + резервирование средств в БД (одна транзакция, с блокировкой строки).
 * Деньги с горячего кошелька ЕЩЁ не отправлены — только списаны с внутреннего баланса
 * и зафиксирована заявка со статусом "processing".
 */
async function reserveWithdrawal(params: RequestWithdrawalParams) {
  const { telegramId, address, amount, idempotencyKey } = params;

  if (amount < MIN_WITHDRAWAL_TON) {
    throw new WithdrawalError("amount_too_small", `Минимальная сумма вывода — ${MIN_WITHDRAWAL_TON} TON`);
  }

  const addressCheck = await checkTonAddress(address);
  if (!addressCheck.valid) {
    throw new WithdrawalError("invalid_address", "Некорректный адрес кошелька");
  }

  const { fee, toReceive } = calculateWithdrawal(amount);
  // фиксированные строки с 8 знаками — передаём в SQL как numeric-строку,
  // а не как JS number, чтобы драйвер не терял точность при приведении типов
  const amountStr = amount.toFixed(8);
  const feeStr = fee.toFixed(8);
  const toReceiveStr = toReceive.toFixed(8);

  return db.transaction(async (tx) => {
    const [user] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .for("update");

    if (!user) {
      throw new WithdrawalError("user_not_found", "Пользователь не найден");
    }

    const currentBalance = Number(user.ton);
    if (currentBalance < amount) {
      throw new WithdrawalError("insufficient_balance", "Недостаточно средств на балансе");
    }

    // безопасное списание: используем numeric literal ::numeric
    await tx
      .update(usersTable)
      .set({ ton: sql`${usersTable.ton} - ${amountStr}::numeric` })
      .where(eq(usersTable.telegramId, telegramId));

    let withdrawal;
    try {
      [withdrawal] = await tx
        .insert(withdrawalsTable)
        .values({
          telegramId,
          amount: amountStr,
          fee: feeStr,
          amountToSend: toReceiveStr,
          address: addressCheck.normalized ?? address,
          status: "processing",
          idempotencyKey,
        })
        .returning();
    } catch (err: any) {
      if (err?.code === "23505") {
        // duplicate idempotency key
        throw new WithdrawalError("duplicate_request", "Запрос уже обрабатывается");
      }
      throw err;
    }

    console.log(`[Withdrawal] reserved id=${withdrawal.id} telegramId=${telegramId} amount=${amountStr} idempotencyKey=${idempotencyKey}`);
    return withdrawal;
  });
}

/**
 * Шаг 2: реальная отправка TON с проектного кошелька.
 */
async function sendTon(toAddress: string, amountTon: number, comment: string) {
  const client = getClient();
  const mnemonic = process.env.PROJECT_WALLET_MNEMONIC;
  if (!mnemonic) throw new WithdrawalError("config_error", "PROJECT_WALLET_MNEMONIC не задан");

  const key = await mnemonicToWalletKey(mnemonic.split(" "));
  const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
  const contract = client.open(wallet);

  const amountNano = toNano(amountTon.toFixed(9)); // bigint
  const gasReserveNano = toNano("0.05"); // запас на комиссию сети

  const hotWalletBalance: bigint = await client.getBalance(wallet.address);
  if (hotWalletBalance < amountNano + gasReserveNano) {
    console.error(`[Withdrawal] hot wallet insufficient: balance=${hotWalletBalance} need=${amountNano + gasReserveNano}`);
    throw new WithdrawalError("hot_wallet_insufficient", "Недостаточно средств на горячем кошельке");
  }

  const seqno = await contract.getSeqno();

  await contract.sendTransfer({
    seqno,
    secretKey: key.secretKey,
    messages: [
      internal({
        to: toAddress,
        value: amountNano,
        body: comment,
        bounce: false,
      }),
    ],
  });

  console.log(`[Withdrawal] sent seqno=${seqno} to=${toAddress} amount=${amountTon}`);
  return { seqno };
}

/**
 * Полный флоу: резервирование -> отправка -> финальный статус.
 * При ошибке отправки — возвращаем деньги на баланс пользователя.
 */
export async function processWithdrawal(params: RequestWithdrawalParams) {
  const withdrawal = await reserveWithdrawal(params);

  try {
    const { seqno } = await sendTon(
      withdrawal.address,
      Number(withdrawal.amountToSend),
      `Withdrawal #${withdrawal.id}`
    );

    await db
      .update(withdrawalsTable)
      .set({ status: "completed", txHash: `seqno:${seqno}`, updatedAt: new Date() })
      .where(eq(withdrawalsTable.id, withdrawal.id));

    console.log(`[Withdrawal] completed id=${withdrawal.id}`);
    return { ok: true, withdrawalId: withdrawal.id };
  } catch (err: any) {
    console.error(`[Withdrawal] failed id=${withdrawal.id} reason=${err?.message ?? err}`);

    await db.transaction(async (tx) => {
      // возвращаем пользователю средства (используем numeric add)
      await tx
        .update(usersTable)
        .set({ ton: sql`${usersTable.ton} + ${withdrawal.amount}::numeric` })
        .where(eq(usersTable.telegramId, params.telegramId));

      await tx
        .update(withdrawalsTable)
        .set({
          status: "failed",
          errorMessage: String(err?.message ?? err),
          updatedAt: new Date(),
        })
        .where(eq(withdrawalsTable.id, withdrawal.id));
    });

    console.log(`[Withdrawal] refunded id=${withdrawal.id} amount=${withdrawal.amount}`);
    throw err;
  }
}
