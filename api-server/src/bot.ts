import { Telegraf, type Context } from "telegraf";
import type { Update } from "telegraf/types";
import { db } from "@workspace/db";
import { usersTable, adViewsTable } from "@workspace/db/schema";
import { eq, gte, sql } from "drizzle-orm";

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
    const newUsers   = newUsersRow.rows[0]?.cnt ?? 0;
    const adsWatched = adsRow.rows[0]?.cnt ?? 0;
    const tonEarned  = parseFloat(adsRow.rows[0]?.ton ?? "0");

    const dateStr = new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

    await notifyAdmin(bot,
      `📊 <b>Утренняя статистика TONYX</b> — ${dateStr}\n\n` +
      `👥 Новых пользователей за день: <b>${newUsers}</b>\n` +
      `👤 Всего пользователей: <b>${totalUsers}</b>\n` +
      `📺 Просмотров рекламы: <b>${adsWatched}</b>\n` +
      `💰 TON заработано: <b>${tonEarned.toFixed(4)} TON</b>`
    );
    console.log("[bot] Daily stats sent to admin");
  } catch (err) {
    console.error("[bot] Failed to send daily stats:", err);
  }
}

function scheduleDailyStats(bot: Telegraf<Context<Update>>) {
  const delay = msUntilNext9amUtc();
  console.log(`[bot] Daily stats scheduled in ${Math.round(delay / 60000)} min`);
  setTimeout(() => {
    sendDailyStats(bot);
    setInterval(() => sendDailyStats(bot), 24 * 60 * 60 * 1000);
  }, delay);
}

export function startBot(): Telegraf<Context<Update>> | null | void {
  // Only run bot polling in production OR when explicitly enabled in dev.
  // Telegram allows only ONE getUpdates consumer per token — if both dev and
  // prod poll, both get 409 Conflict and the bot stops responding.
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

  // /start — registers user, handles referral, sends welcome with WebApp button
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

      // Fetch profile photo (best-effort)
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
        // New user — register and handle referral
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

        // Bonus coins to referrer
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

        // Notify admin about new registration
        const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Unknown";
        const refLine = startParam && startParam !== user.id.toString()
          ? `\n👥 Реферал от: <code>${startParam}</code>`
          : "";
        await notifyAdmin(bot,
          `🆕 <b>Новый пользователь!</b>\n\n` +
          `👤 ${displayName}${user.username ? ` (@${user.username})` : ""}\n` +
          `🆔 <code>${user.id}</code>${refLine}`
        );
      } else {
        // Existing user — update profile info
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

    // Send welcome message with WebApp launch button
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

  // /stats — admin-only on-demand statistics
  bot.command("stats", async (ctx) => {
    const senderId = ctx.from?.id?.toString();
    if (senderId !== ADMIN_CHAT_ID) {
      await ctx.reply("⛔ Нет доступа").catch(() => {});
      return;
    }
    await sendDailyStats(bot);
  });

  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  bot.launch({ dropPendingUpdates: true }).catch((err) => {
    console.error("Failed to start bot:", err.message);
  });
  // Telegraf gotcha: bot.launch() resolves only on stop. Log immediately after polling begins.
  setTimeout(() => console.log("🤖 Telegram bot polling started"), 1000);

  // Schedule daily 9:00 UTC stats report to admin
  scheduleDailyStats(bot);

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  return bot;
}
