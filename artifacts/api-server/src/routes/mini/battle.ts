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
  getUpgradeCost,
  MAX_MAGE_LEVEL,
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

function isBossLevel(n: number): n is BossLevel {
  return n === 1 || n === 2 || n === 3 || n === 4 || n === 5;
}

/** Ensure user has starter mage + empty loadout/boosts/nft rows */
async function ensureGameProfile(telegramId: string) {
  // Starter mage
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

  // Loadout
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

  // Battle boosts
  const boosts = await db
    .select()
    .from(miniUserBattleBoostsTable)
    .where(eq(miniUserBattleBoostsTable.telegramId, telegramId))
    .then((r) => r[0] ?? null);

  if (!boosts) {
    await db.insert(miniUserBattleBoostsTable).values({ telegramId });
  }

  // NFT inventory
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
    mult *= speedMult; // speed affects effective DPS for kill-time calc
  }

  return rawDps * mult;
}

// ─────────────────────────────────────────────────────────────
// GET /api/mini/battle/game-state
// ─────────────────────────────────────────────────────────────
router.get("/game-state", async (req: Request, res: Response) => {
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

    // Check boss is alive
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

    // Cancel any previous active battle
    await db
      .update(miniBattlesTable)
      .set({ status: "expired", expiredAt: new Date() })
      .where(and(
        eq(miniBattlesTable.telegramId, telegramId),
        eq(miniBattlesTable.status, "active"),
      ));

    // Read loadout from DB (client does NOT send slots)
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

    // Expire if older than 3 hours
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

    // Required time to kill (seconds)
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

    // ── Generate rewards (server-side random only) ──
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

    // ── Apply rewards in DB ──
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

    // NFT inventory
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

    // Boss respawn 72h
    const respawnAt = new Date(now + BOSS_RESPAWN_MS);

    // Upsert boss state
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

    // Update user balances + nft + battle
    await Promise.all([
      db
        .update(usersTable)
        .set({
          ton: String(newTon),
          tonyxCoins: newTonyx,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.telegramId, telegramId)),
      db
        .update(miniNftInventoryTable)
        .set({ fragments, assembled, updatedAt: new Date() })
        .where(eq(miniNftInventoryTable.telegramId, telegramId)),
      db
        .update(miniBattlesTable)
        .set({
          status: "claimed",
          rewards,
          claimedAt: new Date(),
        })
        .where(eq(miniBattlesTable.id, battleId)),
    ]);

    console.log(
      `[battle/claim] ${telegramId} boss=${bossLevel} battleId=${battleId} rewards=${JSON.stringify(rewards)}`,
    );

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

export default router;
