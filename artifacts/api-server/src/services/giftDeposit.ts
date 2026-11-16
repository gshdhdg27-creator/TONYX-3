import { db } from "@workspace/db";
import {
  usersTable,
  miniUserInventoryTable,
  systemSettingsTable,
} from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { NFT_COLLECTIONS, getNftCollection } from "../lib/nft-catalog.js";

/** Map Telegram gift display / base_name → catalog id */
const NAME_ALIASES: Record<string, string> = {
  "hypno lollipop": "hypno_lollipop",
  hypnolollipop: "hypno_lollipop",
  "liberty figure": "liberty_figure",
  libertyfigure: "liberty_figure",
  "b-day candle": "bday_candle",
  "bday candle": "bday_candle",
  bdaycandle: "bday_candle",
  "moon pendant": "moon_pendant",
  moonpendant: "moon_pendant",
  "input key": "telegram_premium",
  inputkey: "telegram_premium",
  "telegram premium": "telegram_premium",
  "snoop cigar": "snoop_cigar",
  snoopcigar: "snoop_cigar",
  "royal dogg": "royal_dogg",
  royaldogg: "royal_dogg",
  "snoop dogg": "royal_dogg",
  "electric skull": "electric_skull",
  electricskull: "electric_skull",
  "neko helmet": "neko_helmet",
  nekohelmet: "neko_helmet",
  "heroic helmet": "heroic_helmet",
  heroichelmet: "heroic_helmet",
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function matchGiftToCatalog(opts: {
  baseName?: string | null;
  name?: string | null;
  giftId?: string | null;
}): { id: string; nameRu: string; nameEn: string; valueTon: number; rarity: string; imageUrl: string | null } | null {
  const candidates = [opts.baseName, opts.name, opts.giftId].filter(Boolean) as string[];
  for (const raw of candidates) {
    // strip " #12345" suffix from unique gift names
    const stripped = raw.replace(/\s*#\d+\s*$/, "").trim();
    const n = norm(stripped);
    const compact = n.replace(/\s+/g, "");
    const snake = n.replace(/\s+/g, "_");

    const aliasId = NAME_ALIASES[n] ?? NAME_ALIASES[compact];
    if (aliasId) {
      const c = getNftCollection(aliasId);
      if (c) {
        return {
          id: c.id,
          nameRu: c.nameRu,
          nameEn: c.nameEn,
          valueTon: c.valueTon,
          rarity: c.rarity,
          imageUrl: c.imageUrl ?? null,
        };
      }
    }

    const byId = NFT_COLLECTIONS.find((c) => c.id === snake || c.id === compact);
    if (byId) {
      return {
        id: byId.id,
        nameRu: byId.nameRu,
        nameEn: byId.nameEn,
        valueTon: byId.valueTon,
        rarity: byId.rarity,
        imageUrl: byId.imageUrl ?? null,
      };
    }

    const byName = NFT_COLLECTIONS.find(
      (c) =>
        norm(c.nameEn) === n ||
        norm(c.nameRu) === n ||
        norm(c.nameEn).replace(/\s+/g, "") === compact,
    );
    if (byName) {
      return {
        id: byName.id,
        nameRu: byName.nameRu,
        nameEn: byName.nameEn,
        valueTon: byName.valueTon,
        rarity: byName.rarity,
        imageUrl: byName.imageUrl ?? null,
      };
    }
  }
  return null;
}

async function ensureUser(telegramId: string) {
  let user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .then((r) => r[0] ?? null);
  if (user) return user;
  await db.insert(usersTable).values({
    telegramId,
    ton: "0",
    tonyxCoins: 0,
    coins: 0,
  });
  return db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .then((r) => r[0]!);
}

async function alreadyCredited(ownedGiftId: string | null | undefined): Promise<boolean> {
  if (!ownedGiftId) return false;
  try {
    const rows = await db.execute(
      sql`SELECT id FROM mini_user_inventory WHERE meta->>'ownedGiftId' = ${ownedGiftId} LIMIT 1`,
    );
    const list = (rows as { rows?: unknown[] }).rows ?? (Array.isArray(rows) ? rows : []);
    return list.length > 0;
  } catch {
    return false;
  }
}

export type GiftDepositResult =
  | { ok: true; nftId: string; nameRu: string; inventoryId: number; telegramId: string }
  | { ok: false; reason: string };

export async function creditGiftToInventory(params: {
  creditToTelegramId: string;
  baseName?: string | null;
  name?: string | null;
  giftId?: string | null;
  number?: number | null;
  model?: string | null;
  backdrop?: string | null;
  symbol?: string | null;
  ownedGiftId?: string | null;
  senderId?: string | null;
  source: "business_profile" | "bot_chat" | "scan";
}): Promise<GiftDepositResult> {
  const matched = matchGiftToCatalog({
    baseName: params.baseName,
    name: params.name,
    giftId: params.giftId,
  });

  if (!matched) {
    return {
      ok: false,
      reason: `Gift not in catalog: ${params.baseName ?? params.name ?? params.giftId ?? "?"}`,
    };
  }

  if (await alreadyCredited(params.ownedGiftId)) {
    return { ok: false, reason: "Already credited" };
  }

  await ensureUser(params.creditToTelegramId);

  const [row] = await db
    .insert(miniUserInventoryTable)
    .values({
      telegramId: params.creditToTelegramId,
      itemType: "nft_full",
      itemId: matched.id,
      quantity: 1,
      meta: {
        source: params.source,
        giftName: matched.nameRu,
        imageUrl: matched.imageUrl,
        number: params.number ?? null,
        model: params.model ?? null,
        backdrop: params.backdrop ?? null,
        symbol: params.symbol ?? null,
        ownedGiftId: params.ownedGiftId ?? null,
        tgBaseName: params.baseName ?? null,
        tgName: params.name ?? null,
        senderId: params.senderId ?? null,
        depositedAt: new Date().toISOString(),
      },
    })
    .returning();

  console.log(
    `[giftDeposit] ${params.creditToTelegramId} ← ${matched.id} (#${params.number ?? "?"}) via ${params.source}`,
  );

  return {
    ok: true,
    nftId: matched.id,
    nameRu: matched.nameRu,
    inventoryId: row.id,
    telegramId: params.creditToTelegramId,
  };
}

const BC_KEY = "tg_business_connection_id";
const BC_OWNER_KEY = "tg_business_owner_id";

export async function saveBusinessConnection(connectionId: string, ownerTelegramId: string) {
  const upsert = async (key: string, value: string) => {
    const existing = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, key));
    if (existing.length) {
      await db
        .update(systemSettingsTable)
        .set({ value, updatedAt: new Date() })
        .where(eq(systemSettingsTable.key, key));
    } else {
      await db.insert(systemSettingsTable).values({ key, value });
    }
  };
  await Promise.all([upsert(BC_KEY, connectionId), upsert(BC_OWNER_KEY, ownerTelegramId)]);
}

export async function getBusinessConnection(): Promise<{
  connectionId: string | null;
  ownerId: string | null;
}> {
  const rows = await db.select().from(systemSettingsTable);
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;
  return {
    connectionId: s[BC_KEY] ?? null,
    ownerId: s[BC_OWNER_KEY] ?? null,
  };
}

export function parseUniqueGiftPayload(msg: Record<string, unknown>): {
  baseName?: string;
  name?: string;
  number?: number;
  model?: string;
  backdrop?: string;
  symbol?: string;
  ownedGiftId?: string;
  senderId?: string;
} | null {
  const ug =
    (msg.unique_gift as Record<string, unknown> | undefined) ??
    (msg.uniqueGift as Record<string, unknown> | undefined);
  if (!ug) return null;

  const gift = (ug.gift as Record<string, unknown>) ?? ug;
  const model = gift.model as Record<string, unknown> | undefined;
  const backdrop = gift.backdrop as Record<string, unknown> | undefined;
  const symbol = gift.symbol as Record<string, unknown> | undefined;
  const sender = ug.sender_user as { id?: number } | undefined;

  return {
    baseName: (gift.base_name as string) ?? (gift.baseName as string) ?? undefined,
    name: (gift.name as string) ?? undefined,
    number: typeof gift.number === "number" ? gift.number : undefined,
    model: (model?.name as string) ?? undefined,
    backdrop: (backdrop?.name as string) ?? undefined,
    symbol: (symbol?.name as string) ?? undefined,
    ownedGiftId: (ug.owned_gift_id as string) ?? (ug.ownedGiftId as string) ?? undefined,
    senderId: sender?.id != null ? String(sender.id) : undefined,
  };
}

/**
 * Scan gifts on the connected Business profile.
 * Everything currently owned on THAT profile → owner's inventory.
 * If gift was transferred away, it no longer appears here.
 */
export async function scanBusinessGifts(): Promise<{
  ok: boolean;
  credited: number;
  skipped: number;
  unknown: string[];
  error?: string;
  ownerId?: string | null;
}> {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const { connectionId, ownerId } = await getBusinessConnection();

  if (!connectionId || !ownerId) {
    return {
      ok: false,
      credited: 0,
      skipped: 0,
      unknown: [],
      error: "No business connection — reconnect bot in Telegram Business",
    };
  }
  if (!BOT_TOKEN) {
    return { ok: false, credited: 0, skipped: 0, unknown: [], error: "TELEGRAM_BOT_TOKEN missing" };
  }

  const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getBusinessAccountGifts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business_connection_id: connectionId,
      exclude_unsaved: false,
      limit: 100,
    }),
  });
  const data = (await tgRes.json()) as {
    ok?: boolean;
    result?: { gifts?: Array<Record<string, unknown>> };
    description?: string;
  };

  if (!data.ok) {
    return {
      ok: false,
      credited: 0,
      skipped: 0,
      unknown: [],
      error: data.description ?? "getBusinessAccountGifts failed",
      ownerId,
    };
  }

  let credited = 0;
  let skipped = 0;
  const unknown: string[] = [];

  for (const g of data.result?.gifts ?? []) {
    if ((g.type as string) !== "unique") {
      skipped++;
      continue;
    }
    const gift = (g.gift as Record<string, unknown>) ?? {};
    const model = gift.model as Record<string, unknown> | undefined;
    const backdrop = gift.backdrop as Record<string, unknown> | undefined;
    const symbol = gift.symbol as Record<string, unknown> | undefined;
    const sender = g.sender_user as { id?: number } | undefined;

    const baseName = (gift.base_name as string) ?? null;
    const name = (gift.name as string) ?? null;

    const result = await creditGiftToInventory({
      // Owner of the profile owns the gift in-app
      creditToTelegramId: ownerId,
      baseName,
      name,
      number: typeof gift.number === "number" ? gift.number : null,
      model: (model?.name as string) ?? null,
      backdrop: (backdrop?.name as string) ?? null,
      symbol: (symbol?.name as string) ?? null,
      ownedGiftId: (g.owned_gift_id as string) ?? null,
      senderId: sender?.id != null ? String(sender.id) : null,
      source: "scan",
    });

    if (result.ok) {
      credited++;
    } else if (result.reason.startsWith("Gift not in catalog")) {
      unknown.push(baseName ?? name ?? "?");
      skipped++;
    } else {
      skipped++;
    }
  }

  return { ok: true, credited, skipped, unknown, ownerId };
}
