import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, miniSpinRoomsTable, miniUserInventoryTable } from "@workspace/db/schema";
import { eq, desc, or, inArray, and } from "drizzle-orm";
import { getNftCollection } from "../../lib/nft-catalog.js";
import {
  generateServerSeed,
  hashServerSeed,
  computeFairnessHash,
  pickWinnerByHash,
} from "../../lib/fairness.js";
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";

const router: IRouter = Router();

const MIN_STAKE = 0.1;
const TIMER_SECONDS = 20;
const COMMISSION_RATE = 0.20;

/** Deterministic 0..1 offset inside winner sector — same for every client. */
function computeStopFrac(hash: string | null | undefined): number {
  if (!hash || hash.length < 16) return 0.5;
  const n = parseInt(hash.slice(8, 16), 16);
  if (Number.isNaN(n)) return 0.5;
  return n / 0xffffffff;
}

type NftStake = {
  inventoryId: number;
  itemId: string;
  valueTon: number;
  nameRu?: string;
  imageUrl?: string | null;
  meta?: Record<string, unknown>;
};

type SpinPlayer = {
  telegramId: string;
  username: string | null;
  stake: number;
  chance: number;
  nftStakes?: NftStake[];
};

function recalcChances(players: SpinPlayer[]): SpinPlayer[] {
  const total = players.reduce((s, p) => s + p.stake, 0);
  return players.map((p) => ({
    ...p,
    chance: total > 0 ? Math.round((p.stake / total) * 10000) / 100 : 0,
  }));
}

// NOTE: full file continues in next push - temporary restore header
export default router;
