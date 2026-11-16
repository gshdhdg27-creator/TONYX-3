import { Router, type IRouter, type Request, type Response } from "express";
import {
  creditGiftToInventory,
  saveBusinessConnection,
  getBusinessConnection,
  parseUniqueGiftPayload,
  scanBusinessGifts,
} from "../services/giftDeposit.js";

const router: IRouter = Router();

const ADMIN_CHAT_ID = "7257793582";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

async function sendTelegram(chatId: string, text: string) {
  if (!BOT_TOKEN) {
    console.warn("[webhook] TELEGRAM_BOT_TOKEN not set");
    return;
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[webhook] Telegram send failed:", err);
  }
}

async function handleUniqueGiftMsg(
  msg: Record<string, unknown>,
  source: "business_profile" | "bot_chat",
  fallbackCreditId: string | null,
) {
  const parsed = parseUniqueGiftPayload(msg);
  if (!parsed) return;

  const bc = await getBusinessConnection();
  // Gifts on MY profile → my inventory.
  // Gift sent to the bot chat → sender's inventory.
  const creditTo =
    source === "business_profile"
      ? bc.ownerId || ADMIN_CHAT_ID
      : parsed.senderId || fallbackCreditId || ADMIN_CHAT_ID;

  const result = await creditGiftToInventory({
    creditToTelegramId: creditTo,
    baseName: parsed.baseName,
    name: parsed.name,
    number: parsed.number,
    model: parsed.model,
    backdrop: parsed.backdrop,
    symbol: parsed.symbol,
    ownedGiftId: parsed.ownedGiftId,
    senderId: parsed.senderId,
    source,
  });

  if (result.ok) {
    await sendTelegram(
      ADMIN_CHAT_ID,
      `🎁 <b>NFT → инвентарь</b>\n` +
        `📦 ${result.nameRu} (<code>${result.nftId}</code>)\n` +
        `👤 <code>${result.telegramId}</code>\n` +
        `📥 ${source}`,
    );
    if (creditTo !== ADMIN_CHAT_ID) {
      await sendTelegram(
        creditTo,
        `🎁 NFT <b>${result.nameRu}</b> добавлен в инвентарь TONYX!`,
      );
    }
  } else if (result.reason.includes("not in catalog")) {
    await sendTelegram(
      ADMIN_CHAT_ID,
      `ℹ️ Подарок вне каталога: <b>${parsed.baseName ?? parsed.name ?? "?"}</b>`,
    );
  }
}

async function runScanAndNotify(chatId: string) {
  await sendTelegram(chatId, "🔍 Сканирую подарки на профиле…");
  const result = await scanBusinessGifts();
  if (!result.ok) {
    await sendTelegram(chatId, `❌ Скан: ${result.error ?? "ошибка"}`);
    return;
  }
  const unk =
    result.unknown.length > 0
      ? `\nℹ️ Вне каталога: ${[...new Set(result.unknown)].slice(0, 10).join(", ")}`
      : "";
  await sendTelegram(
    chatId,
    `✅ Скан готов\n` +
      `🎁 В инвентарь: <b>${result.credited}</b>\n` +
      `⏭ Пропущено: ${result.skipped}` +
      unk,
  );
}

/** Telegram Bot API webhook */
router.post("/telegram", async (req: Request, res: Response) => {
  try {
    if (WEBHOOK_SECRET) {
      const hdr = String(req.headers["x-telegram-bot-api-secret-token"] ?? "");
      if (hdr !== WEBHOOK_SECRET) {
        res.status(401).json({ error: "bad secret" });
        return;
      }
    }

    const update = req.body as Record<string, unknown>;
    if (!update || typeof update !== "object") {
      res.json({ ok: true });
      return;
    }

    // Business connection
    const bc = update.business_connection as
      | { id?: string; user?: { id?: number }; is_enabled?: boolean }
      | undefined;
    if (bc?.id && bc.user?.id) {
      if (bc.is_enabled === false) {
        await sendTelegram(ADMIN_CHAT_ID, `🔌 Business connection off: <code>${bc.id}</code>`);
      } else {
        const ownerId = String(bc.user.id);
        await saveBusinessConnection(bc.id, ownerId);
        await sendTelegram(
          ADMIN_CHAT_ID,
          `✅ <b>Профиль подключён</b>\n👤 <code>${ownerId}</code>\n🔗 <code>${bc.id}</code>`,
        );
        // Immediately pull existing gifts on profile → owner inventory
        void runScanAndNotify(ADMIN_CHAT_ID);
      }
    }

    // Admin commands from private chat
    const message = update.message as Record<string, unknown> | undefined;
    if (message) {
      const from = message.from as { id?: number } | undefined;
      const text = String(message.text ?? "").trim();
      const fromId = from?.id != null ? String(from.id) : "";

      if (fromId === ADMIN_CHAT_ID && (text === "/scangifts" || text.startsWith("/scangifts@"))) {
        // Answer Telegram quickly, then scan
        res.json({ ok: true });
        void runScanAndNotify(ADMIN_CHAT_ID);
        return;
      }

      if (message.unique_gift || message.uniqueGift) {
        await handleUniqueGiftMsg(message, "bot_chat", fromId || null);
      }
    }

    // Business message with unique gift → profile owner inventory
    const bmsg = update.business_message as Record<string, unknown> | undefined;
    if (bmsg && (bmsg.unique_gift || bmsg.uniqueGift)) {
      await handleUniqueGiftMsg(bmsg, "business_profile", null);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[webhook/telegram]", err);
    res.status(200).json({ ok: true });
  }
});

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
    const deployUrl =
      body?.payload?.links?.deployment ?? (deployment?.url ? `https://${deployment.url}` : null);
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
      res.json({ ok: true, ignored: true });
      return;
    }

    await sendTelegram(ADMIN_CHAT_ID, message);
    res.json({ ok: true });
  } catch (err) {
    console.error("[webhook] Error handling Vercel webhook:", err);
    res.status(500).json({ error: "internal error" });
  }
});

export default router;
