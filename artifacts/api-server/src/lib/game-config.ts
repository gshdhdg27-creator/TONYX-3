import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export type GameKey = "spin" | "mines" | "arena" | "igro";

/**
 * Server-side authority for the admin "game enabled" toggles.
 * The frontend already hides/disables cards for a disabled game, but a
 * client could still call the API directly, so every game's start/join
 * route must check this before allowing play.
 */
export async function isGameEnabled(game: GameKey): Promise<boolean> {
  const row = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, `game_enabled_${game}`))
    .then((r) => r[0] ?? null);
  return row?.value !== "false";
}

export const GAME_DISABLED_MESSAGE = "Игра временно недоступна";
