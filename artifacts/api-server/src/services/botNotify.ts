/**
 * Lightweight Telegram notification sender.
 * Uses the same bot token but does NOT start polling —
 * safe to call from any service without conflict.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Send an HTML-formatted message to a Telegram user.
 * Silently swallows errors (e.g. user blocked bot, invalid id).
 */
export async function notifyUser(telegramId: string, html: string): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramId, text: html, parse_mode: "HTML" }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.warn(`[BotNotify] Failed to notify ${telegramId}: ${r.status} ${body.slice(0, 120)}`);
    }
  } catch (e) {
    console.warn(`[BotNotify] Error notifying ${telegramId}:`, (e as Error).message);
  }
}
