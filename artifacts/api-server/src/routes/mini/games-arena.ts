import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniArenaRoomsTable, miniUserInventoryTable } from "@workspace/db/schema";
import { eq, desc, or, and, gte, inArray } from "drizzle-orm";
import {
  generateServerSeed,
  hashServerSeed,
  computeFairnessHash,
  pickWinnerByHash,
} from "../../lib/fairness.js";
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";
import { getNftCollection } from "../../lib/nft-catalog.js";

const router: IRouter = Router();

const TIMER_SECONDS = 15;
const COMMISSION_RATE = 0.20;
const MIN_STAKE = 0.1;
const MIN_PLAYERS = 2;

type NftStake = {
  inventoryId: number;
  itemId: string;
  valueTon: number;
  nameRu?: string;
  imageUrl?: string | null;
  meta?: Record<string, unknown>;
};

type ArenaPlayer = {
  telegramId: string;
  username: string | null;
  stake: number;
  nftStakes?: NftStake[];
};

/** Pure TON part of a player's stake (stake value minus NFT values). */
function pureTonOf(p: ArenaPlayer): number {
  const nftSum = (p.nftStakes ?? []).reduce((s, n) => s + (Number(n.valueTon) || 0), 0);
  return Math.max(0, Math.round((p.stake - nftSum) * 1000) / 1000);
}

// NOTE: full file continues - this is emergency restore of logic core
export default router;
