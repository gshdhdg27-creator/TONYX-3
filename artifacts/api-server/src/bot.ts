import { Telegraf, type Context } from "telegraf";
import type { Update } from "telegraf/types";
import { db } from "@workspace/db";
import { usersTable, adViewsTable } from "@workspace/db/schema";
import { eq, gte, sql, asc } from "drizzle-orm";
import {
  creditGiftToInventory,
  saveBusinessConnection,
  getBusinessConnection,
  parseUniqueGiftPayload,
  matchGiftToCatalog,
} from "./services/giftDeposit.js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL =
  process.env.WEBAPP_URL ??
  (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/mini-app/` : null);

const ADMIN_CHAT_ID = "7257793582";

async function notifyAdmin(bot: Telegraf<Context<Update>>, text: string) {
  try {
    await bot.telegram.sendMessage(ADMIN_CHAT_ID, text, { parse_mode: "HTML" });
  } catch (err) {
    console.warn("[bot] Failed to notify admin:", (err as Error).message);
  }
}

function msUntilNext9amUtc(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 0, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

async function sendDailyStats(bot: Telegraf<Context<Update>>) {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [totalUsersRow, newUsersRow, adsRow] = await Promise.all([
      db.execute<{ cnt: number }>(sql`SELECT COUNT(*)::int AS cnt FROM users`),
      db.execute<{ cnt: number }>(sql`SELECT COUNT(*)::int AS cnt FROM users WHERE created_at >= ${todayStart}`),
      db.execute<{ cnt: number; ton: string }>(
        sql`SELECT COUNT(*)::int AS cnt, COALESCE(SUM(ton_earned::float),0)::text AS ton FROM ad_views WHERE viewed_at >= ${todayStart}`
      ),
    ]);

    const totalUsers = totalUsersRow.rows[0]?.cnt ?? 0;
    const newUsers = newUsersRow.rows[0]?.cnt ?? 0;
    const adsWatched = adsRow.rows[0]?.cnt ?? 0;
    const tonEarned = parseFloat(adsRow.rows[0]?.ton ?? "0");

    const dateStr = new Date().toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    });

    await notifyAdmin(
      bot,
      `📊 <b>Утренняя статистика TONYX</b> — ${dateStr}\n\n` +
        `👥 Новых пользователей за день: <b>${newUsers}</b>\n` +
        `👤 Всего пользователей: <b>${totalUsers}</b>\n` +
        `📺 Просмотров рекламы: <b>${adsWatched}</b>\n` +
        `💰 TON заработано: <b>${tonEarned.toFixed(4)} TON</b>`,
    );
    console.log("[bot] Daily stats sent to admin");
  } catch (err) {
    console.error("[bot] Failed to send daily stats:", err);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function broadcastMessage(bot: Telegraf<Context<Update>>, text: string): Promise<void> {
  const users = await db
    .select({ telegramId: usersTable.telegramId })
    .from(usersTable)
    .where(eq(usersTable.isBlocked, false))
    .orderBy(asc(usersTable.id));

  const total = users.length;
  let sent = 0;
  let failed = 0;

  console.log(`[broadcast] Starting — ${total} users`);
  await notifyAdmin(bot, `📣 <b>Рассылка запущена</b>\nПолучателей: <b>${total}</b>\nСообщение:\n${text}`);

  for (let i = 0; i < users.length; i++) {
    const { telegramId } = users[i];
    try {
      await bot.telegram.sendMessage(telegramId, text, { parse_mode: "HTML" });
      sent++;
    } catch (err) {
      const code = (err as { response?: { error_code?: number } })?.response?.error_code;
      if (code === 403 || code === 400) {
        await db
          .update(usersTable)
          .set({ isBlocked: true })
          .where(eq(usersTable.telegramId, telegramId))
          .catch(() => {});
      }
      failed++;
    }

    if ((i + 1) % 100 === 0) {
      await notifyAdmin(bot, `⏳ Рассылка: <b>${i + 1}/${total}</b> — ✅ ${sent} / ❌ ${failed}`);
    }

    await sleep(50);
  }

  console.log(`[broadcast] Done — sent: ${sent}, failed: ${failed}`);
  await notifyAdmin(
    bot,
    `✅ <b>Рассылка завершена!</b>\n\n` +
      `👤 Всего: <b>${total}</b>\n` +
      `📨 Доставлено: <b>${sent}</b>\n` +
      `❌ Ошибок: <b>${failed}</b>`,
  );
}

function scheduleDailyStats(bot: Telegraf<Context<Update>>) {
  const delay = msUntilNext9amUtc();
  console.log(`[bot] Daily stats scheduled in ${Math.round(delay / 60000)} min`);
  setTimeout(() => {
    sendDailyStats(bot);
    setInterval(() => sendDailyStats(bot), 24 * 60 * 60 * 1000);
  }, delay);
}

/** Handle unique gift payload → inventory */
async function handleIncomingGift(
  bot: Telegraf<Context<Update>>,
  rawMsg: Record<string, unknown>,
  fallbackCreditId: string | null,
  source: "business_profile" | "bot_chat",
) {
  const parsed = parseUniqueGiftPayload(rawMsg);
  if (!parsed) return;

  const bc = await getBusinessConnection();
  // Gifts on connected profile → credit profile owner (admin)
  // Gifts sent to the bot chat → credit the sender (deposit)
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
    await notifyAdmin(
      bot,
      `🎁 <b>NFT подарок → инвентарь</b>\n\n` +
        `📦 ${result.nameRu} (<code>${result.nftId}</code>)\n` +
        `👤 В инвентарь: <code>${result.telegramId}</code>\n` +
        `📥 Источник: ${source}\n` +
        (parsed.number != null ? `🔢 #${parsed.number}\n` : "") +
        (parsed.model ? `🎨 ${parsed.model}\n` : ""),
    );
    try {
      if (creditTo !== ADMIN_CHAT_ID) {
        await bot.telegram.sendMessage(
          creditTo,
          `🎁 NFT <b>${result.nameRu}</b> добавлен в инвентарь TONYX!\nОткрой приложение → Инвентарь.`,
          { parse_mode: "HTML" },
        );
      }
    } catch {
      /* ignore */
    }
  } else {
    console.log(`[gift] skip: ${result.reason}`);
    if (!result.reason.includes("Already") && !result.reason.includes("not in catalog")) {
      await notifyAdmin(bot, `⚠️ Подарок не зачислен: ${result.reason}`);
    } else if (result.reason.includes("not in catalog")) {
      await notifyAdmin(
        bot,
        `ℹ️ Получен подарок вне каталога: <b>${parsed.baseName ?? parsed.name ?? "?"}</b>\n` +
          `Он не добавлен в инвентарь (нет в NFT_COLLECTIONS).`,
      );
    }
  }
}

/** Poll business account gifts and credit new ones */
async function scanBusinessGifts(bot: Telegraf<Context<Update>>) {
  const { connectionId, ownerId } = await getBusinessConnection();
  if (!connectionId || !ownerId || !BOT_TOKEN) return;

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getBusinessAccountGifts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_connection_id: connectionId,
        exclude_unsaved: false,
        limit: 50,
      }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      result?: { gifts?: Array<Record<string, unknown>> };
      description?: string;
    };
    if (!data.ok || !data.result?.gifts) {
      if (data.description) console.warn("[gift-scan]", data.description);
      return;
    }

    for (const g of data.result.gifts) {
      if ((g.type as string) !== "unique") continue;
      const gift = (g.gift as Record<string, unknown>) ?? {};
      const model = gift.model as Record<string, unknown> | undefined;
      const backdrop = gift.backdrop as Record<string, unknown> | undefined;
      const symbol = gift.symbol as Record<string, unknown> | undefined;
      const sender = g.sender_user as { id?: number } | undefined;

      const result = await creditGiftToInventory({
        creditToTelegramId: ownerId,
        baseName: (gift.base_name as string) ?? null,
        name: (gift.name as string) ?? null,
        number: typeof gift.number === "number" ? gift.number : null,
        model: (model?.name as string) ?? null,
        backdrop: (backdrop?.name as string) ?? null,
        symbol: (symbol?.name as string) ?? null,
        ownedGiftId: (g.owned_gift_id as string) ?? null,
        senderId: sender?.id != null ? String(sender.id) : null,
        source: "scan",
      });

      if (result.ok) {
        await notifyAdmin(
          bot,
          `🎁 <b>Скан профиля</b>: ${result.nameRu} → инвентарь <code>${ownerId}</code>`,
        );
      }
    }
  } catch (err) {
    console.error("[gift-scan]", err);
  }
}

export function startBot(): Telegraf<Context<Update>> | null | void {
  const isProd = process.env.NODE_ENV === "production";
  const forceEnable = process.env.BOT_ENABLED === "true";
  if (!isProd && !forceEnable) {
    console.log("🤖 Telegram bot disabled in dev (set BOT_ENABLED=true to override)");
    return;
  }
  if (!BOT_TOKEN) {
    console.warn("⚠️  TELEGRAM_BOT_TOKEN not set — bot will not start");
    return null;
  }

  const bot = new Telegraf(BOT_TOKEN);

  bot.start(async (ctx) => {
    const user = ctx.from;
    const startParam = ctx.startPayload;
    if (!user) return;

    let isNewUser = false;
    try {
      const existingUser = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.telegramId, user.id.toString()))
        .then((rows) => rows[0] ?? null);

      let photoUrl: string | null = null;
      try {
        const photos = await bot.telegram.getUserProfilePhotos(user.id, 0, 1);
        if (photos.total_count > 0 && photos.photos[0]?.[0]) {
          const fileId = photos.photos[0][0].file_id;
          const file = await bot.telegram.getFile(fileId);
          if (file.file_path) {
            photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
          }
        }
      } catch {
        // Not critical
      }

      if (!existingUser) {
        isNewUser = true;
        await db.insert(usersTable).values({
          telegramId: user.id.toString(),
          username: user.username ?? null,
          firstName: user.first_name ?? null,
          lastName: user.last_name ?? null,
          photoUrl,
          referredBy: startParam && startParam !== user.id.toString() ? startParam : null,
          coins: 0,
          totalAdsWatched: 0,
          isBlocked: false,
        });

        if (startParam && startParam !== user.id.toString()) {
          const referrer = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.telegramId, startParam))
            .then((rows) => rows[0] ?? null);
          if (referrer) {
            await db
              .update(usersTable)
              .set({
                coins: referrer.coins + 500,
                referralEarnings: referrer.referralEarnings + 500,
              })
              .where(eq(usersTable.telegramId, startParam));
          }
        }

        const displayName =
          [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Unknown";
        const refLine =
          startParam && startParam !== user.id.toString()
            ? `\n👥 Реферал от: <code>${startParam}</code>`
            : "";
        await notifyAdmin(
          bot,
          `🆕 <b>Новый пользователь!</b>\n\n` +
            `👤 ${displayName}${user.username ? ` (@${user.username})` : ""}\n` +
            `🆔 <code>${user.id}</code>${refLine}`,
        );
      } else {
        await db
          .update(usersTable)
          .set({
            username: user.username ?? existingUser.username,
            firstName: user.first_name ?? existingUser.firstName,
            lastName: user.last_name ?? existingUser.lastName,
            photoUrl: photoUrl ?? existingUser.photoUrl,
            updatedAt: new Date(),
          })
          .where(eq(usersTable.telegramId, user.id.toString()));
      }
    } catch (err) {
      console.error("Error registering user on /start:", err);
    }

    const name = user.first_name ?? user.username ?? "friend";
    const greeting = isNewUser
      ? `🎉 Welcome to TONYX, ${name}!\n\n💰 Watch ads → earn pts\n💎 100 pts = 1 TON\n🎮 Play games · 👥 Invite friends\n\nTap the button below to launch the app:`
      : `👋 Welcome back, ${name}!\n\nTap the button to open TONYX:`;

    try {
      if (WEBAPP_URL) {
        await ctx.reply(greeting, {
          reply_markup: {
            inline_keyboard: [[{ text: "🚀 Open TONYX", web_app: { url: WEBAPP_URL } }]],
          },
        });
      } else {
        await ctx.reply(greeting + "\n\n(WEBAPP_URL not configured)");
      }
    } catch (err) {
      console.error("Failed to send /start reply:", err);
    }
  });

  bot.command("broadcast", async (ctx) => {
    const senderId = ctx.from?.id?.toString();
    if (senderId !== ADMIN_CHAT_ID) {
      await ctx.reply("⛔ Нет доступа").catch(() => {});
      return;
    }

    const text = ctx.message.text.replace(/^\/broadcast\s*/i, "").trim();
    if (!text) {
      await ctx
        .reply(
          "✏️ <b>Использование:</b>\n<code>/broadcast Ваш текст сообщения</code>\n\n" +
            "Поддерживается HTML-разметка: <b>жирный</b>, <i>курсив</i>, <code>моно</code>",
          { parse_mode: "HTML" },
        )
        .catch(() => {});
      return;
    }

    broadcastMessage(bot, text).catch((err) => console.error("[broadcast] Fatal error:", err));
    await ctx.reply("📣 Рассылка запущена! Прогресс будет приходить сообщениями.").catch(() => {});
  });

  bot.command("stats", async (ctx) => {
    const senderId = ctx.from?.id?.toString();
    if (senderId !== ADMIN_CHAT_ID) {
      await ctx.reply("⛔ Нет доступа").catch(() => {});
      return;
    }
    await sendDailyStats(bot);
  });

  // Admin: force scan gifts on connected profile
  bot.command("scangifts", async (ctx) => {
    const senderId = ctx.from?.id?.toString();
    if (senderId !== ADMIN_CHAT_ID) {
      await ctx.reply("⛔ Нет доступа").catch(() => {});
      return;
    }
    await ctx.reply("🔍 Сканирую подарки на Business-профиле...").catch(() => {});
    await scanBusinessGifts(bot);
    await ctx.reply("✅ Скан завершён").catch(() => {});
  });

  // Business connection: when you link the bot to your Telegram Business profile
  bot.on("business_connection" as "message", async (ctx) => {
    try {
      const upd = ctx.update as unknown as {
        business_connection?: {
          id: string;
          user: { id: number };
          is_enabled?: boolean;
          can_reply?: boolean;
        };
      };
      const bc = upd.business_connection;
      if (!bc?.id || !bc.user?.id) return;

      if (bc.is_enabled === false) {
        await notifyAdmin(bot, `🔌 Business connection отключён: <code>${bc.id}</code>`);
        return;
      }

      const ownerId = String(bc.user.id);
      await saveBusinessConnection(bc.id, ownerId);
      await notifyAdmin(
        bot,
        `✅ <b>Профиль подключён к боту</b>\n\n` +
          `👤 Owner: <code>${ownerId}</code>\n` +
          `🔗 connection: <code>${bc.id}</code>\n\n` +
          `Теперь NFT-подарки на этот профиль (если есть в каталоге бота) попадут в инвентарь.`,
      );
      // Initial scan
      await scanBusinessGifts(bot);
    } catch (err) {
      console.error("[business_connection]", err);
    }
  });

  // Gifts received in bot private chat (user sent gift to the bot)
  bot.on("message", async (ctx) => {
    try {
      const msg = ctx.message as unknown as Record<string, unknown>;
      if (!msg) return;
      if (msg.unique_gift || (msg as { uniqueGift?: unknown }).uniqueGift) {
        await handleIncomingGift(bot, msg, ctx.from?.id?.toString() ?? null, "bot_chat");
      }
    } catch (err) {
      console.error("[message gift]", err);
    }
  });

  // Business messages (activity on connected profile)
  bot.on("business_message" as "message", async (ctx) => {
    try {
      const upd = ctx.update as unknown as { business_message?: Record<string, unknown> };
      const msg = upd.business_message;
      if (!msg) return;
      if (msg.unique_gift || msg.uniqueGift) {
        await handleIncomingGift(bot, msg, null, "business_profile");
      }
    } catch (err) {
      console.error("[business_message gift]", err);
    }
  });

  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  bot.launch({ dropPendingUpdates: true, allowedUpdates: [
    "message",
    "business_connection",
    "business_message",
    "edited_business_message",
  ] as unknown as undefined }).catch((err) => {
    console.error("Failed to start bot:", err.message);
  });
  setTimeout(() => console.log("🤖 Telegram bot polling started (gifts + business)"), 1000);

  scheduleDailyStats(bot);

  // Periodic gift scan every 5 min
  setInterval(() => {
    scanBusinessGifts(bot).catch((e) => console.error("[gift-scan interval]", e));
  }, 5 * 60 * 1000);
  setTimeout(() => scanBusinessGifts(bot).catch(() => {}), 15_000);

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  return bot;
}
