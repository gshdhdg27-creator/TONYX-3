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

/** Ensure user has starter mage + empty loadout/boosts/nft rows */
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

/** Calculate current total DPS from equipped mages + active boosts */
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

// ─────────────────────────────────────────────────────────────
// GET /api/mini/battle/game-state
// ─────────────────────────────────────────────────────────────
router.get("/game-state", async (_req: Request, res: Response) => {
  try {
    const telegramId = getTelegramId(res);
    if (!telegramId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    await ensureGameProfile(telegramId);

    const [user, mages, loadout, bossStates, boosts, nft] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).then((r) => r[0] ?? null),
      db.select().from(miniUserMagesTable).where(eq(miniUserMagesTable.telegramId, telegramId)),
      db.select().from(miniUserLoadoutTable).where(eq(miniUserLoadoutTable.telegramId, telegramId)).then((r) => r[0] ?? null),
      db.select().from(miniUserBossStateTable).where(eq(miniUserBossStateTable.telegramId, telegramId)),
      db.select().from(miniUserBattleBoostsTable).where(eq(miniUserBattleBoostsTable.telegramId, telegramId)).then((r) => r[0] ?? null),
      db.select().from(miniNftInventoryTable).where(eq(miniNftInventoryTable.telegramId, telegramId)).then((r) => r[0] ?? null),
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

// ─────────────────────────────────────────────────────────────
// POST /api/mini/battle/start
// Body: { bossLevel: number }
// ─────────────────────────────────────────────────────────────
router.post("/start", async (req: Request, res: Response) => {
  try {
    const telegramId = getTelegramId(res);
    if (!telegramId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const bossLevel = Number(req.body?.bossLevel);
    if (!isBossLevel(bossLevel)) {
      res.status(400).json({ error: "Invalid bossLevel" });
      return;
    }

    await ensureGameProfile(telegramId);

    const bossState = await db
      .select()
      .from(miniUserBossStateTable)
      .where(and(
        eq(miniUserBossStateTable.telegramId, telegramId),
        eq(miniUserBossStateTable.bossLevel, bossLevel),
      ))
      .then((r) => r[0] ?? null);

    if (bossState?.respawnAt && bossState.respawnAt.getTime() > Date.now()) {
      res.status(400).json({
        error: "Boss is dead",
        respawnAt: bossState.respawnAt.getTime(),
      });
      return;
    }

    await db
      .update(miniBattlesTable)
      .set({ status: "expired", expiredAt: new Date() })
      .where(and(
        eq(miniBattlesTable.telegramId, telegramId),
        eq(miniBattlesTable.status, "active"),
      ));

    const loadout = await db
      .select()
      .from(miniUserLoadoutTable)
      .where(eq(miniUserLoadoutTable.telegramId, telegramId))
      .then((r) => r[0] ?? null);

    const slots = (loadout?.equippedSlots ?? [null, null, null, null, null]) as (string | null)[];
    const equippedMageIds = slots.filter(Boolean) as string[];

    if (equippedMageIds.length === 0) {
      res.status(400).json({ error: "No mages equipped" });
      return;
    }

    const totalDps = await calcServerDps(telegramId);
    if (totalDps <= 0) {
      res.status(400).json({ error: "DPS is zero" });
      return;
    }

    const [battle] = await db
      .insert(miniBattlesTable)
      .values({
        telegramId,
        bossLevel,
        equippedMageIds,
        totalDpsSnapshot: String(totalDps),
        status: "active",
      })
      .returning();

    console.log(`[battle/start] ${telegramId} boss=${bossLevel} dps=${totalDps} battleId=${battle.id}`);

    res.json({
      battleId: battle.id,
      bossLevel,
      totalDps,
      bossMaxHp: BOSSES[bossLevel].maxHp,
      startedAt: battle.startedAt.toISOString(),
    });
  } catch (err) {
    console.error("[battle/start]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/mini/battle/claim
// Body: { battleId: number }
// ─────────────────────────────────────────────────────────────
router.post("/claim", async (req: Request, res: Response) => {
  try {
    const telegramId = getTelegramId(res);
    if (!telegramId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const battleId = Number(req.body?.battleId);
    if (!Number.isFinite(battleId)) {
      res.status(400).json({ error: "Invalid battleId" });
      return;
    }

    const battle = await db
      .select()
      .from(miniBattlesTable)
      .where(and(
        eq(miniBattlesTable.id, battleId),
        eq(miniBattlesTable.telegramId, telegramId),
      ))
      .then((r) => r[0] ?? null);

    if (!battle) {
      res.status(404).json({ error: "Battle not found" });
      return;
    }

    if (battle.status === "claimed") {
      res.status(400).json({ error: "Already claimed", rewards: battle.rewards });
      return;
    }

    if (battle.status === "expired") {
      res.status(400).json({ error: "Battle expired" });
      return;
    }

    const now = Date.now();
    const startedAt = battle.startedAt.getTime();
    const elapsedMs = now - startedAt;

    if (elapsedMs > BATTLE_MAX_AGE_MS) {
      await db
        .update(miniBattlesTable)
        .set({ status: "expired", expiredAt: new Date() })
        .where(eq(miniBattlesTable.id, battleId));
      res.status(400).json({ error: "Battle expired (too old)" });
      return;
    }

    const bossLevel = battle.bossLevel as BossLevel;
    const boss = BOSSES[bossLevel];
    const totalDps = Number(battle.totalDpsSnapshot);

    const requiredSec = boss.maxHp / totalDps;
    const minSec = requiredSec * (1 - KILL_TIME_TOLERANCE);
    const elapsedSec = elapsedMs / 1000;

    if (elapsedSec < minSec) {
      res.status(400).json({
        error: "Too early to claim",
        requiredSec: Math.ceil(minSec),
        elapsedSec: Math.floor(elapsedSec),
      });
      return;
    }

    const rewards: Array<{
      type: "ton" | "tonyx" | "nft_fragment" | "nft_full";
      amount?: number;
      nftId?: string;
      fragmentNftId?: string;
    }> = [];

    rewards.push({ type: "ton", amount: boss.rewardTon });
    rewards.push({ type: "tonyx", amount: boss.rewardTonyx });

    const roll = Math.random();
    if (roll < NFT_FULL_DROP_CHANCE) {
      const nftId = NFT_IDS[Math.floor(Math.random() * NFT_IDS.length)];
      rewards.push({ type: "nft_full", nftId });
    } else if (roll < NFT_FULL_DROP_CHANCE + NFT_FRAGMENT_DROP_CHANCE) {
      const nftId = NFT_IDS[Math.floor(Math.random() * NFT_IDS.length)];
      rewards.push({ type: "nft_fragment", fragmentNftId: nftId });
    }

    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .then((r) => r[0] ?? null);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    let newTon = Number(user.ton);
    let newTonyx = user.tonyxCoins;

    for (const r of rewards) {
      if (r.type === "ton" && r.amount) newTon += r.amount;
      if (r.type === "tonyx" && r.amount) newTonyx += r.amount;
    }

    let nftRow = await db
      .select()
      .from(miniNftInventoryTable)
      .where(eq(miniNftInventoryTable.telegramId, telegramId))
      .then((r) => r[0] ?? null);

    if (!nftRow) {
      await db.insert(miniNftInventoryTable).values({ telegramId });
      nftRow = await db
        .select()
        .from(miniNftInventoryTable)
        .where(eq(miniNftInventoryTable.telegramId, telegramId))
        .then((r) => r[0]!);
    }

    const fragments = { ...(nftRow.fragments as Record<string, number>) };
    const assembled = [...(nftRow.assembled as string[])];

    for (const r of rewards) {
      if (r.type === "nft_fragment" && r.fragmentNftId) {
        const id = r.fragmentNftId;
        fragments[id] = (fragments[id] ?? 0) + 1;
        if (fragments[id] >= NFT_FRAGMENTS_NEEDED && !assembled.includes(id)) {
          assembled.push(id);
          fragments[id] = 0;
        }
      }
      if (r.type === "nft_full" && r.nftId && !assembled.includes(r.nftId)) {
        assembled.push(r.nftId);
      }
    }

    const respawnAt = new Date(now + BOSS_RESPAWN_MS);

    const existingBoss = await db
      .select()
      .from(miniUserBossStateTable)
      .where(and(
        eq(miniUserBossStateTable.telegramId, telegramId),
        eq(miniUserBossStateTable.bossLevel, bossLevel),
      ))
      .then((r) => r[0] ?? null);

    if (existingBoss) {
      await db
        .update(miniUserBossStateTable)
        .set({ respawnAt, reviveAdsWatched: 0, updatedAt: new Date() })
        .where(eq(miniUserBossStateTable.id, existingBoss.id));
    } else {
      await db.insert(miniUserBossStateTable).values({
        telegramId,
        bossLevel,
        respawnAt,
        reviveAdsWatched: 0,
      });
    }

    await Promise.all([
      db.update(usersTable)
        .set({ ton: String(newTon), tonyxCoins: newTonyx, updatedAt: new Date() })
        .where(eq(usersTable.telegramId, telegramId)),
      db.update(miniNftInventoryTable)
        .set({ fragments, assembled, updatedAt: new Date() })
        .where(eq(miniNftInventoryTable.telegramId, telegramId)),
      db.update(miniBattlesTable)
        .set({ status: "claimed", rewards, claimedAt: new Date() })
        .where(eq(miniBattlesTable.id, battleId)),
    ]);

    console.log(`[battle/claim] ${telegramId} boss=${bossLevel} battleId=${battleId} rewards=${JSON.stringify(rewards)}`);

    res.json({
      rewards,
      balances: { ton: newTon, tonyx: newTonyx },
      nftInventory: { fragments, assembled },
      bossRespawnAt: respawnAt.getTime(),
    });
  } catch (err) {
    console.error("[battle/claim]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/mini/battle/revive
// Body: { bossLevel: number, method: "ton" | "ad" }
// ─────────────────────────────────────────────────────────────
router.post("/revive", async (req: Request, res: Response) => {
  try {
    const telegramId = getTelegramId(res);
    if (!telegramId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const bossLevel = Number(req.body?.bossLevel);
    const method = req.body?.method as "ton" | "ad";

    if (!isBossLevel(bossLevel)) {
      res.status(400).json({ error: "Invalid bossLevel" });
      return;
    }
    if (method !== "ton" && method !== "ad") {
      res.status(400).json({ error: "method must be ton or ad" });
      return;
    }

    const cost = BOSS_REVIVE_COST[bossLevel];

    const bossState = await db
      .select()
      .from(miniUserBossStateTable)
      .where(and(
        eq(miniUserBossStateTable.telegramId, telegramId),
        eq(miniUserBossStateTable.bossLevel, bossLevel),
      ))
      .then((r) => r[0] ?? null);

    if (!bossState?.respawnAt || bossState.respawnAt.getTime() <= Date.now()) {
      res.status(400).json({ error: "Boss is already alive" });
      return;
    }

    if (method === "ton") {
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
      if (userTon < cost.ton) {
        res.status(400).json({ error: "Not enough TON", need: cost.ton, have: userTon });
        return;
      }

      const newTon = userTon - cost.ton;

      await Promise.all([
        db.update(usersTable)
          .set({ ton: String(newTon), updatedAt: new Date() })
          .where(eq(usersTable.telegramId, telegramId)),
        db.update(miniUserBossStateTable)
          .set({ respawnAt: null, reviveAdsWatched: 0, updatedAt: new Date() })
          .where(eq(miniUserBossStateTable.id, bossState.id)),
      ]);

      console.log(`[battle/revive] ${telegramId} boss=${bossLevel} method=ton cost=${cost.ton}`);

      res.json({
        ok: true,
        method: "ton",
        balances: { ton: newTon },
        bossRespawnAt: null,
      });
      return;
    }

    // method === "ad"
    if (cost.ads === null) {
      res.status(400).json({ error: "This boss can only be revived with TON" });
      return;
    }

    const newAds = (bossState.reviveAdsWatched ?? 0) + 1;

    if (newAds >= cost.ads) {
      await db
        .update(miniUserBossStateTable)
        .set({ respawnAt: null, reviveAdsWatched: 0, updatedAt: new Date() })
        .where(eq(miniUserBossStateTable.id, bossState.id));

      console.log(`[battle/revive] ${telegramId} boss=${bossLevel} method=ad FULL`);

      res.json({
        ok: true,
        method: "ad",
        revived: true,
        reviveAdsWatched: 0,
        bossRespawnAt: null,
      });
    } else {
      await db
        .update(miniUserBossStateTable)
        .set({ reviveAdsWatched: newAds, updatedAt: new Date() })
        .where(eq(miniUserBossStateTable.id, bossState.id));

      console.log(`[battle/revive] ${telegramId} boss=${bossLevel} method=ad progress=${newAds}/${cost.ads}`);

      res.json({
        ok: true,
        method: "ad",
        revived: false,
        reviveAdsWatched: newAds,
        adsRequired: cost.ads,
        bossRespawnAt: bossState.respawnAt.getTime(),
      });
    }
  } catch (err) {
    console.error("[battle/revive]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/mini/battle/mage/buy
// Body: { mageId: string }
// ─────────────────────────────────────────────────────────────
router.post("/mage/buy", async (req: Request, res: Response) => {
  try {
    const telegramId = getTelegramId(res);
    if (!telegramId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const mageId = String(req.body?.mageId ?? "");
    const cfg = getMageById(mageId);
    if (!cfg) {
      res.status(400).json({ error: "Unknown mage" });
      return;
    }

    const existing = await db
      .select()
      .from(miniUserMagesTable)
      .where(and(
        eq(miniUserMagesTable.telegramId, telegramId),
        eq(miniUserMagesTable.mageId, mageId),
      ))
      .then((r) => r[0] ?? null);

    if (existing) {
      res.status(400).json({ error: "Already owned" });
      return;
    }

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
    if (userTon < cfg.priceTon) {
      res.status(400).json({ error: "Not enough TON", need: cfg.priceTon, have: userTon });
      return;
    }

    const newTon = userTon - cfg.priceTon;

    await Promise.all([
      db.update(usersTable)
        .set({ ton: String(newTon), updatedAt: new Date() })
        .where(eq(usersTable.telegramId, telegramId)),
      db.insert(miniUserMagesTable).values({
        telegramId,
        mageId,
        level: 1,
      }),
    ]);

    console.log(`[battle/mage/buy] ${telegramId} mage=${mageId} cost=${cfg.priceTon}`);

    res.json({
      ok: true,
      mageId,
      level: 1,
      balances: { ton: newTon },
    });
  } catch (err) {
    console.error("[battle/mage/buy]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/mini/battle/mage/upgrade
// Body: { mageId: string }
// ─────────────────────────────────────────────────────────────
router.post("/mage/upgrade", async (req: Request, res: Response) => {
  try {
    const telegramId = getTelegramId(res);
    if (!telegramId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const mageId = String(req.body?.mageId ?? "");
    const cfg = getMageById(mageId);
    if (!cfg) {
      res.status(400).json({ error: "Unknown mage" });
      return;
    }

    const owned = await db
      .select()
      .from(miniUserMagesTable)
      .where(and(
        eq(miniUserMagesTable.telegramId, telegramId),
        eq(miniUserMagesTable.mageId, mageId),
      ))
      .then((r) => r[0] ?? null);

    if (!owned) {
      res.status(400).json({ error: "Mage not owned" });
      return;
    }

    if (owned.level >= MAX_MAGE_LEVEL) {
      res.status(400).json({ error: "Max level reached", level: owned.level });
      return;
    }

    const cost = getUpgradeCost(cfg.upgradeCost, owned.level);

    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .then((r) => r[0] ?? null);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (user.tonyxCoins < cost) {
      res.status(400).json({ error: "Not enough TONYX", need: cost, have: user.tonyxCoins });
      return;
    }

    const newLevel = owned.level + 1;
    const newTonyx = user.tonyxCoins - cost;

    await Promise.all([
      db.update(usersTable)
        .set({ tonyxCoins: newTonyx, updatedAt: new Date() })
        .where(eq(usersTable.telegramId, telegramId)),
      db.update(miniUserMagesTable)
        .set({ level: newLevel, updatedAt: new Date() })
        .where(eq(miniUserMagesTable.id, owned.id)),
    ]);

    console.log(`[battle/mage/upgrade] ${telegramId} mage=${mageId} level=${newLevel} cost=${cost}`);

    res.json({
      ok: true,
      mageId,
      level: newLevel,
      balances: { tonyx: newTonyx },
    });
  } catch (err) {
    console.error("[battle/mage/upgrade]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/mini/battle/loadout
// Body: { equippedSlots: (string | null)[] }
// ─────────────────────────────────────────────────────────────
router.post("/loadout", async (req: Request, res: Response) => {
  try {
    const telegramId = getTelegramId(res);
    if (!telegramId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const slots = req.body?.equippedSlots;
    if (!Array.isArray(slots) || slots.length !== 5) {
      res.status(400).json({ error: "equippedSlots must be array of 5" });
      return;
    }

    const owned = await db
      .select()
      .from(miniUserMagesTable)
      .where(eq(miniUserMagesTable.telegramId, telegramId));

    const ownedIds = new Set(owned.map((m) => m.mageId));
    const cleaned: (string | null)[] = [];

    for (const s of slots) {
      if (s === null || s === undefined) {
        cleaned.push(null);
      } else if (typeof s === "string" && ownedIds.has(s)) {
        cleaned.push(s);
      } else {
        res.status(400).json({ error: `Mage not owned: ${s}` });
        return;
      }
    }

    const nonNull = cleaned.filter(Boolean);
    if (new Set(nonNull).size !== nonNull.length) {
      res.status(400).json({ error: "Duplicate mages in slots" });
      return;
    }

    const existing = await db
      .select()
      .from(miniUserLoadoutTable)
      .where(eq(miniUserLoadoutTable.telegramId, telegramId))
      .then((r) => r[0] ?? null);

    if (existing) {
      await db
        .update(miniUserLoadoutTable)
        .set({ equippedSlots: cleaned, updatedAt: new Date() })
        .where(eq(miniUserLoadoutTable.id, existing.id));
    } else {
      await db.insert(miniUserLoadoutTable).values({
        telegramId,
        equippedSlots: cleaned,
      });
    }

    res.json({ ok: true, equippedSlots: cleaned });
  } catch (err) {
    console.error("[battle/loadout]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
