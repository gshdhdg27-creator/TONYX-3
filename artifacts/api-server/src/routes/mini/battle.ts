import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  miniUserMagesTable,
  miniUserLoadoutTable,
  miniUserBossStateTable,
  miniBattlesTable,
  miniNftInventoryTable,
  miniUserBattleBoostsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import {
  BOSSES,
  BOSS_REVIVE_COST,
  BOSS_RESPAWN_MS,
  BATTLE_MAX_AGE_MS,
  KILL_TIME_TOLERANCE,
  MAGES,
  getMageDps,
  getMageById,
  NFT_IDS,
  NFT_FULL_DROP_CHANCE,
  NFT_FRAGMENT_DROP_CHANCE,
  NFT_FRAGMENTS_NEEDED,
  AD_BOOST,
  STARTER_MAGE_ID,
  type BossLevel,
  type NftId,
} from "../../lib/game-constants.js";

const router: IRouter = Router();

/** Helper: get verified telegramId from middleware */
function getTelegramId(res: Response): string | null {
  return (res.locals as Record<string, unknown>)["verifiedTelegramId"] as string | null;
}

// TODO: endpoints will be added here

export default router;
