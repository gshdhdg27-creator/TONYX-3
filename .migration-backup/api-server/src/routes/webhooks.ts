import { Router, type IRouter } from "express";

const router: IRouter = Router();

const ADMIN_CHAT_ID = "7257793582";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegram(text: string) {
  if (!BOT_TOKEN) {
    console.warn("[webhook] TELEGRAM_BOT_TOKEN not set — cannot send notification");
    return;
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: ADMIN_CHAT_ID,
      text,
      parse_mode: "HTML",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[webhook] Telegram send failed:", err);
  }
}

router.post("/vercel", async (req, res) => {
  try {
    const body = req.body as {
      type?: string;
      payload?: {
        deployment?: {
          url?: string;
          name?: string;
          meta?: { githubCommitMessage?: string; githubCommitRef?: string };
        };
        links?: { deployment?: string };
      };
    };

    const eventType = body?.type ?? "unknown";
    const deployment = body?.payload?.deployment;
    const appName = deployment?.name ?? "TONYX";
    const deployUrl = body?.payload?.links?.deployment ?? (deployment?.url ? `https://${deployment.url}` : null);
    const branch = deployment?.meta?.githubCommitRef ?? "main";
    const commitMsg = deployment?.meta?.githubCommitMessage ?? "";

    let message = "";

    if (eventType === "deployment.succeeded") {
      message =
        `✅ <b>Деплой успешен!</b>\n\n` +
        `📦 <b>${appName}</b>\n` +
        `🌿 Ветка: <code>${branch}</code>\n` +
        (commitMsg ? `💬 Коммит: ${commitMsg}\n` : "") +
        (deployUrl ? `🔗 <a href="${deployUrl}">Открыть деплой</a>` : "");
    } else if (eventType === "deployment.error" || eventType === "deployment.canceled") {
      const icon = eventType === "deployment.canceled" ? "⚠️" : "❌";
      const label = eventType === "deployment.canceled" ? "Деплой отменён" : "Деплой упал!";
      message =
        `${icon} <b>${label}</b>\n\n` +
        `📦 <b>${appName}</b>\n` +
        `🌿 Ветка: <code>${branch}</code>\n` +
        (commitMsg ? `💬 Коммит: ${commitMsg}\n` : "") +
        (deployUrl ? `🔗 <a href="${deployUrl}">Подробности</a>` : "");
    } else {
      // Ignore other event types silently
      res.json({ ok: true, ignored: true });
      return;
    }

    await sendTelegram(message);
    res.json({ ok: true });
  } catch (err) {
    console.error("[webhook] Error handling Vercel webhook:", err);
    res.status(500).json({ error: "internal error" });
  }
});

export default router;
