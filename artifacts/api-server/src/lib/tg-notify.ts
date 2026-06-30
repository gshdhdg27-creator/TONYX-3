const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null;

export async function sendTgMessage(telegramId: string, text: string): Promise<void> {
  if (!TG_API) {
    console.warn("[TG] Bot token not set — skipping notification to", telegramId);
    return;
  }
  try {
    const res = await fetch(`${TG_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramId,
        text,
        parse_mode: "HTML",
      }),
    });
    const data = await res.json() as { ok: boolean; description?: string };
    if (!data.ok) {
      console.warn(`[TG] sendMessage failed for ${telegramId}:`, data.description);
    } else {
      console.log(`[TG] Notification sent to ${telegramId}`);
    }
  } catch (e) {
    console.error("[TG] sendMessage error:", e);
  }
}

export const TgMsg = {
  topupApproved: (ton: number | string) =>
    `💎 <b>Баланс пополнен!</b>\n\nВаш баланс успешно пополнен на <b>${Number(ton).toFixed(4)} TON</b>!\n\nПриятной игры! 🚀`,

  withdrawApproved: (ton: number | string, txHash?: string | null) => {
    let msg = `💸 <b>Вывод одобрен!</b>\n\nВаша заявка на вывод <b>${Number(ton).toFixed(4)} TON</b> успешно одобрена и выплачена!`;
    if (txHash) msg += `\n\n🔗 Хэш транзакции:\n<code>${txHash}</code>`;
    return msg;
  },

  withdrawRejected: (ton: number | string) =>
    `⚠️ <b>Вывод отклонён</b>\n\nВаша заявка на вывод <b>${Number(ton).toFixed(4)} TON</b> была отклонена администратором.\n\nСредства возвращены на ваш баланс.`,
};
