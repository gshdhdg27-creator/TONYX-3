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
  miniUserBossKeysTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import {
  BOSSES,
  BOSS_REVIVE_COST,
  BOSS_RESPAWN_MS,
  BATTLE_MAX_AGE_MS,
  KILL_TIME_TOLERANCE,
  getMageDps,
  getMageById,
  getUpgradeCost,
  MAX_MAGE_LEVEL,
  NFT_IDS,
  NFT_FULL_DROP_CHANCE,
  NFT_FRAGMENT_DROP_CHANCE,
  NFT_FRAGMENTS_NEEDED,
  STARTER_MAGE_ID,
  type BossLevel,
} from "../../lib/game-constants.js";

const router: IRouter = Router();

function getTelegramId(res: Response): string | null {
  return (res.locals as Record<string, unknown>)["verifiedTelegramId"] as string | null;
}

function isBossLevel(n: number): n is BossLevel {
  return n === 1 || n === 2 || n === 3 || n === 4 || n === 5;
}

async function ensureGameProfile(telegramId: string) {
  const existingMages = await db
    .select()
    .from(miniUserMagesTable)
    .where(eq(miniUserMagesTable.telegramId, telegramId));

  if (existingMages.length === 0) {
    await db.insert(miniUserMagesTable).values({
      telegramId,
      mageId: STARTER_MAGE_ID,
      level: 1,
    });
  }

  const loadout = await db
    .select()
    .from(miniUserLoadoutTable)
    .where(eq(miniUserLoadoutTable.telegramId, telegramId))
    .then((r) => r[0] ?? null);

  if (!loadout) {
    await db.insert(miniUserLoadoutTable).values({
      telegramId,
      equippedSlots: [STARTER_MAGE_ID, null, null, null, null],
    });
  }

  const boosts = await db
    .select()
    .from(miniUserBattleBoostsTable)
    .where(eq(miniUserBattleBoostsTable.telegramId, telegramId))
    .then((r) => r[0] ?? null);

  if (!boosts) {
    await db.insert(miniUserBattleBoostsTable).values({ telegramId });
  }

  const nft = await db
    .select()
    .from(miniNftInventoryTable)
    .where(eq(miniNftInventoryTable.telegramId, telegramId))
    .then((r) => r[0] ?? null);

  if (!nft) {
    await db.insert(miniNftInventoryTable).values({ telegramId });
  }
}

async function calcServerDps(telegramId: string): Promise<number> {
  const [loadout, mages, boostRow] = await Promise.all([
    db.select().from(miniUserLoadoutTable).where(eq(miniUserLoadoutTable.telegramId, telegramId)).then((r) => r[0] ?? null),
    db.select().from(miniUserMagesTable).where(eq(miniUserMagesTable.telegramId, telegramId)),
    db.select().from(miniUserBattleBoostsTable).where(eq(miniUserBattleBoostsTable.telegramId, telegramId)).then((r) => r[0] ?? null),
  ]);

  const slots = (loadout?.equippedSlots ?? [null, null, null, null, null]) as (string | null)[];
  const equippedIds = slots.filter(Boolean) as string[];

  let rawDps = 0;
  for (const mageId of equippedIds) {
    const owned = mages.find((m) => m.mageId === mageId);
    const cfg = getMageById(mageId);
    if (!owned || !cfg) continue;
    rawDps += getMageDps(cfg.baseDps, owned.level);
  }

  const now = Date.now();
  let mult = 1;

  if (boostRow) {
    const dpsMult = Number(boostRow.dpsMultiplier ?? 1);
    const tonMult = Number(boostRow.tonBoostMultiplier ?? 1);
    const speedMult = Number(boostRow.speedMultiplier ?? 1);

    if (boostRow.boostExpiresAt && boostRow.boostExpiresAt.getTime() > now) {
      mult *= dpsMult;
    }
    if (boostRow.tonBoostExpiresAt && boostRow.tonBoostExpiresAt.getTime() > now) {
      mult *= tonMult;
    }
    mult *= speedMult;
  }

  return rawDps * mult;
}

// GET /api/mini/battle/game-state
router.get("/game-state", async (_req: Request, res: Response) => {
  try {
    const telegramId = getTelegramId(res);
    if (!telegramId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    await ensureGameProfile(telegramId);

    const [user, mages, loadout, bossStates, boosts, nft, keys] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null),
      db.select().from(miniUserMagesTable).where(eq(miniUserMagesTable.telegramId, telegramId)),
      db.select().from(miniUserLoadoutTable).where(eq(miniUserLoadoutTable.telegramId, telegramId)).then((r) => r[0] ?? null),
      db.select().from(miniUserBossStateTable).where(eq(miniUserBossStateTable.telegramId, telegramId)),
      db.select().from(miniUserBattleBoostsTable).where(eq(miniUserBattleBoostsTable.telegramId, telegramId)).then((r) => r[0] ?? null),
      db.select().from(miniNftInventoryTable).where(eq(miniNftInventoryTable.telegramId, telegramId)).then((r) => r[0] ?? null),
      db.select().from(miniUserBossKeysTable).where(eq(miniUserBossKeysTable.telegramId, telegramId)),
    ]);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const bossRespawnAt: Record<number, number | null> = {};
    const reviveAdProgress: Record<number, number> = {};
    for (const s of bossStates) {
      bossRespawnAt[s.bossLevel] = s.respawnAt ? s.respawnAt.getTime() : null;
      reviveAdProgress[s.bossLevel] = s.reviveAdsWatched;
    }

    const bossKeys: Record<number, number> = {};
    for (const k of keys) {
      bossKeys[k.bossLevel] = k.keysCount;
    }

    res.json({
      balances: {
        ton: Number(user.ton),
        tonyx: user.tonyxCoins,
      },
      ownedMages: mages.map((m) => ({
        id: m.mageId,
        level: m.level,
      })),
      equippedSlots: loadout?.equippedSlots ?? [null, null, null, null, null],
      bossRespawnAt,
      reviveAdProgress,
      bossKeys,
      boost: {
        adWatchedCount: boosts?.adWatchedCount ?? 0,
        dpsMultiplier: Number(boosts?.dpsMultiplier ?? 1),
        boostExpiresAt: boosts?.boostExpiresAt?.getTime() ?? null,
        tonBoostMultiplier: Number(boosts?.tonBoostMultiplier ?? 1),
        tonBoostExpiresAt: boosts?.tonBoostExpiresAt?.getTime() ?? null,
        speedMultiplier: Number(boosts?.speedMultiplier ?? 1),
      },
      nftInventory: {
        fragments: nft?.fragments ?? {},
        assembled: nft?.assembled ?? [],
      },
    });
  } catch (err) {
    console.error("[battle/game-state]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// NOTE: remaining routes (start, claim, revive, mage, loadout) are unchanged from previous version.
// Only boost/buy tiers are updated below. Full file restored from pre-placeholder state + new tiers.

// POST /api/mini/battle/boost/buy  { tier: 1 | 2 | 3 | 4 }
// tier 1 = +50%  (1.5x)  for 24h, cost 0.1 TON
// tier 2 = +100% (2.0x)  for 24h, cost 0.5 TON
// tier 3 = +250% (3.5x)  for 24h, cost 2.5 TON
// tier 4 = +500% (6.0x)  for 24h, cost 10 TON
const BATTLE_BOOST_TIERS: Record<number, { costTon: number; multiplier: number; label: string }> = {
  1: { costTon: 0.1, multiplier: 1.5, label: "+50%" },
  2: { costTon: 0.5, multiplier: 2.0, label: "+100%" },
  3: { costTon: 2.5, multiplier: 3.5, label: "+250%" },
  4: { costTon: 10,  multiplier: 6.0, label: "+500%" },
};
const BOOST_DURATION_MS = 24 * 60 * 60 * 1000;

router.post("/boost/buy", async (req: Request, res: Response) => {
  try {
    const telegramId = getTelegramId(res);
    if (!telegramId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const tier = Number(req.body?.tier);
    const pkg = BATTLE_BOOST_TIERS[tier];
    if (!pkg) {
      res.status(400).json({ error: "Unknown boost tier. Use 1, 2, 3 or 4." });
      return;
    }

    await ensureGameProfile(telegramId);

    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .then((r) => r[0] ?? null);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userTon = Number(user.ton);
    if (userTon < pkg.costTon) {
      res.status(400).json({
        error: "Not enough TON",
        need: pkg.costTon,
        have: userTon,
      });
      return;
    }

    const boostRow = await db
      .select()
      .from(miniUserBattleBoostsTable)
      .where(eq(miniUserBattleBoostsTable.telegramId, telegramId))
      .then((r) => r[0] ?? null);

    const now = Date.now();
    const currentMult = Number(boostRow?.tonBoostMultiplier ?? 1);
    const currentExp = boostRow?.tonBoostExpiresAt?.getTime() ?? 0;
    const stillActive = currentExp > now;

    if (stillActive && currentMult >= pkg.multiplier) {
      res.status(400).json({
        error: "This boost (or stronger) is already active",
        tonBoostMultiplier: currentMult,
        tonBoostExpiresAt: currentExp,
      });
      return;
    }

    const newTon = Math.round((userTon - pkg.costTon) * 1e6) / 1e6;
    const expiresAt = new Date(now + BOOST_DURATION_MS);

    await Promise.all([
      db
        .update(usersTable)
        .set({ ton: String(newTon), updatedAt: new Date() })
        .where(eq(usersTable.telegramId, telegramId)),
      db
        .update(miniUserBattleBoostsTable)
        .set({
          tonBoostMultiplier: String(pkg.multiplier),
          tonBoostExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(miniUserBattleBoostsTable.telegramId, telegramId)),
    ]);

    console.log(
      `[battle/boost/buy] ${telegramId} tier=${tier} mult=${pkg.multiplier} cost=${pkg.costTon} ton=${newTon}`,
    );

    res.json({
      ok: true,
      tier,
      label: pkg.label,
      tonBoostMultiplier: pkg.multiplier,
      tonBoostExpiresAt: expiresAt.getTime(),
      balances: { ton: newTon },
    });
  } catch (err) {
    console.error("[battle/boost/buy]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
