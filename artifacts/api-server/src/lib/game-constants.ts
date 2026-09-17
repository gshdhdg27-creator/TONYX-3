/** Server-side source of truth for boss / mage / drop config.
 *  Never trust client values for these numbers.
 */

export type BossLevel = 1 | 2 | 3 | 4 | 5;

export interface BossConfig {
  level: BossLevel;
  name: string;
  maxHp: number;
  rewardTon: number;
  rewardTonyx: number;
}

export interface MageConfig {
  id: string;
  name: string;
  rarity: "rare" | "epic" | "legendary";
  baseDps: number;
  priceTon: number;
  upgradeCost: number; // TONYX per level
}

export interface ReviveCost {
  ton: number;
  ads: number | null; // null = TON only
}

// ── Bosses ──────────────────────────────────────────────────────────────
export const BOSSES: Record<BossLevel, BossConfig> = {
  1: { level: 1, name: "Shadow Pup",      maxHp: 25000,  rewardTon: 0.01, rewardTonyx: 50 },
  2: { level: 2, name: "Rage Dogg",       maxHp: 50000,  rewardTon: 0.03, rewardTonyx: 150 },
  3: { level: 3, name: "Inferno Dogg",    maxHp: 100000, rewardTon: 0.08, rewardTonyx: 400 },
  4: { level: 4, name: "Storm Dogg",      maxHp: 250000, rewardTon: 0.2,  rewardTonyx: 1000 },
  5: { level: 5, name: "Boss Dogg Prime", maxHp: 500000, rewardTon: 0.5,  rewardTonyx: 3000 },
};

export const BOSS_REVIVE_COST: Record<BossLevel, ReviveCost> = {
  1: { ton: 0.10, ads: 10 },
  2: { ton: 0.25, ads: 25 },
  3: { ton: 0.50, ads: 50 },
  4: { ton: 1.00, ads: 100 },
  5: { ton: 2.50, ads: null }, // TON only
};

/** Strict 72 hours respawn */
export const BOSS_RESPAWN_MS = 72 * 60 * 60 * 1000;

/** Battle older than this is considered expired */
export const BATTLE_MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3 hours

/** Tolerance when validating kill time (±15%) */
export const KILL_TIME_TOLERANCE = 0.15;

// ── Mages ───────────────────────────────────────────────────────────────
export const MAGES: MageConfig[] = [
  // Rare
  { id: "wind-whisperer",        name: "Wind Whisperer",           rarity: "rare",      baseDps: 10,  priceTon: 0,    upgradeCost: 0 },
  { id: "storm-weaver",          name: "Storm Weaver",             rarity: "rare",      baseDps: 12,  priceTon: 0.5,  upgradeCost: 50 },
  { id: "frost-weaver",          name: "Frost Weaver",             rarity: "rare",      baseDps: 14,  priceTon: 0.8,  upgradeCost: 80 },
  { id: "pyreclastic-arcanist",  name: "Pyreclastic Arcanist",     rarity: "rare",      baseDps: 16,  priceTon: 1.2,  upgradeCost: 120 },
  { id: "aether-scholar",        name: "Aether Scholar",           rarity: "rare",      baseDps: 20,  priceTon: 1.5,  upgradeCost: 150 },
  // Epic
  { id: "elara-void-weaver",     name: "Elara, Void Weaver",       rarity: "epic",      baseDps: 24,  priceTon: 3.0,  upgradeCost: 300 },
  { id: "aethel-thunderlord",    name: "Aethel, Thunderlord",      rarity: "epic",      baseDps: 28,  priceTon: 3.8,  upgradeCost: 380 },
  { id: "korvin-thunderclap",    name: "Korvin, Thunderclap",      rarity: "epic",      baseDps: 32,  priceTon: 4.5,  upgradeCost: 450 },
  { id: "kaeleda-void-dancer",   name: "Kaeleda, Void Dancer",     rarity: "epic",      baseDps: 36,  priceTon: 5.2,  upgradeCost: 520 },
  { id: "kalen-inferno-blaze",   name: "Kalen, Inferno Blaze",     rarity: "epic",      baseDps: 40,  priceTon: 6.0,  upgradeCost: 600 },
  // Legendary
  { id: "silas-starsinger",      name: "Silas, Starsinger",        rarity: "legendary", baseDps: 50,  priceTon: 12.0, upgradeCost: 1200 },
  { id: "lyra-cosmic-weaver",    name: "Lyra, Cosmic Weaver",      rarity: "legendary", baseDps: 60,  priceTon: 14.0, upgradeCost: 1400 },
  { id: "aethel-abyss-weaver",   name: "Aethel, Abyss Weaver",     rarity: "legendary", baseDps: 70,  priceTon: 16.0, upgradeCost: 1600 },
  { id: "solaris-chronos-shaper",name: "Solaris, Chronos Shaper",  rarity: "legendary", baseDps: 80,  priceTon: 18.0, upgradeCost: 1800 },
  { id: "lyra-emerald-chronomancer", name: "Lyra, Emerald Chronomancer", rarity: "legendary", baseDps: 100, priceTon: 22.0, upgradeCost: 2200 },
];

export const MAX_MAGE_LEVEL = 10;

/**
 * Damage multiplier by level:
 * 1 → 1.0x, 2 → 1.1x, 3 → 1.2x ... 9 → 1.8x, 10 → 2.0x (exactly)
 */
export function getMageLevelMultiplier(level: number): number {
  const lvl = Math.min(Math.max(level, 1), MAX_MAGE_LEVEL);
  if (lvl >= MAX_MAGE_LEVEL) return 2.0;
  return 1 + (lvl - 1) * 0.1;
}

export function getMageDps(baseDps: number, level: number): number {
  return baseDps * getMageLevelMultiplier(level);
}

/** Cost to upgrade from currentLevel → currentLevel+1 (+20% each time) */
export function getUpgradeCost(baseUpgradeCost: number, currentLevel: number): number {
  if (currentLevel >= MAX_MAGE_LEVEL) return 0;
  return Math.floor(baseUpgradeCost * Math.pow(1.2, currentLevel - 1));
}

export function getMageById(mageId: string): MageConfig | undefined {
  return MAGES.find((m) => m.id === mageId);
}

// ── NFT drop ────────────────────────────────────────────────────────────
export const NFT_IDS = ["shadow_dogg", "flame_dogg", "ice_dogg"] as const;
export type NftId = (typeof NFT_IDS)[number];

export const NFT_FULL_DROP_CHANCE = 0.02;      // 2%
export const NFT_FRAGMENT_DROP_CHANCE = 0.15;  // 15%
export const NFT_FRAGMENTS_NEEDED = 9;

// ── Boosts ──────────────────────────────────────────────────────────────
export const AD_BOOST = {
  adsRequired: 10,
  multiplier: 1.2,          // +20%
  durationMs: 24 * 60 * 60 * 1000,
};

export const TON_DPS_BOOSTS = [
  { multiplier: 1.5, costTon: 0.5 }, // +50%
  { multiplier: 2.0, costTon: 1.0 }, // +100%
] as const;

export const SPEED_BOOST = {
  multiplier: 2,
  costTon: 0.1,
};

// ── Free starter mage ───────────────────────────────────────────────────
export const STARTER_MAGE_ID = "wind-whisperer";

// ── Cases ───────────────────────────────────────────────────────────────
export type CaseCostType = "key" | "ton" | "tonyx";

export interface CaseRewardPoolItem {
  type: "ton" | "tonyx" | "nft_fragment";
  weight: number;
  minAmount?: number;
  maxAmount?: number;
  nftId?: string;
}

export interface CaseConfig {
  id: string;
  nameRu: string;
  nameEn: string;
  costType: CaseCostType;
  /** For key cases = boss level 1..5; for paid = price amount */
  costValue: number;
  rewards: CaseRewardPoolItem[];
}

export const CASES: CaseConfig[] = [
  // Boss key cases
  {
    id: "boss_1",
    nameRu: "Кейс Shadow Pup",
    nameEn: "Shadow Pup Case",
    costType: "key",
    costValue: 1,
    rewards: [
      { type: "ton", weight: 40, minAmount: 0.005, maxAmount: 0.02 },
      { type: "tonyx", weight: 50, minAmount: 20, maxAmount: 80 },
      { type: "nft_fragment", weight: 10, nftId: "shadow_dogg" },
    ],
  },
  {
    id: "boss_2",
    nameRu: "Кейс Rage Dogg",
    nameEn: "Rage Dogg Case",
    costType: "key",
    costValue: 2,
    rewards: [
      { type: "ton", weight: 35, minAmount: 0.01, maxAmount: 0.04 },
      { type: "tonyx", weight: 50, minAmount: 50, maxAmount: 150 },
      { type: "nft_fragment", weight: 15, nftId: "flame_dogg" },
    ],
  },
  {
    id: "boss_3",
    nameRu: "Кейс Inferno Dogg",
    nameEn: "Inferno Dogg Case",
    costType: "key",
    costValue: 3,
    rewards: [
      { type: "ton", weight: 30, minAmount: 0.03, maxAmount: 0.1 },
      { type: "tonyx", weight: 50, minAmount: 100, maxAmount: 400 },
      { type: "nft_fragment", weight: 20, nftId: "ice_dogg" },
    ],
  },
  {
    id: "boss_4",
    nameRu: "Кейс Storm Dogg",
    nameEn: "Storm Dogg Case",
    costType: "key",
    costValue: 4,
    rewards: [
      { type: "ton", weight: 30, minAmount: 0.08, maxAmount: 0.25 },
      { type: "tonyx", weight: 45, minAmount: 300, maxAmount: 1000 },
      { type: "nft_fragment", weight: 25, nftId: "shadow_dogg" },
    ],
  },
  {
    id: "boss_5",
    nameRu: "Кейс Boss Dogg Prime",
    nameEn: "Boss Dogg Prime Case",
    costType: "key",
    costValue: 5,
    rewards: [
      { type: "ton", weight: 25, minAmount: 0.2, maxAmount: 0.6 },
      { type: "tonyx", weight: 45, minAmount: 800, maxAmount: 2500 },
      { type: "nft_fragment", weight: 30, nftId: "flame_dogg" },
    ],
  },
  // Paid cases
  {
    id: "ton_basic",
    nameRu: "TON Кейс",
    nameEn: "TON Case",
    costType: "ton",
    costValue: 0.1,
    rewards: [
      { type: "ton", weight: 50, minAmount: 0.05, maxAmount: 0.25 },
      { type: "tonyx", weight: 40, minAmount: 50, maxAmount: 200 },
      { type: "nft_fragment", weight: 10, nftId: "ice_dogg" },
    ],
  },
  {
    id: "ton_premium",
    nameRu: "TON Премиум",
    nameEn: "TON Premium",
    costType: "ton",
    costValue: 0.5,
    rewards: [
      { type: "ton", weight: 40, minAmount: 0.2, maxAmount: 1.0 },
      { type: "tonyx", weight: 40, minAmount: 200, maxAmount: 800 },
      { type: "nft_fragment", weight: 20, nftId: "shadow_dogg" },
    ],
  },
  {
    id: "tonyx_basic",
    nameRu: "TONYX Кейс",
    nameEn: "TONYX Case",
    costType: "tonyx",
    costValue: 200,
    rewards: [
      { type: "ton", weight: 30, minAmount: 0.02, maxAmount: 0.1 },
      { type: "tonyx", weight: 55, minAmount: 100, maxAmount: 500 },
      { type: "nft_fragment", weight: 15, nftId: "flame_dogg" },
    ],
  },
];

export function pickCaseReward(pool: CaseRewardPoolItem[]): {
  type: "ton" | "tonyx" | "nft_fragment";
  amount?: number;
  nftId?: string;
} {
  const total = pool.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const item of pool) {
    roll -= item.weight;
    if (roll <= 0) {
      if (item.type === "nft_fragment") {
        return { type: "nft_fragment", nftId: item.nftId };
      }
      const min = item.minAmount ?? 0;
      const max = item.maxAmount ?? min;
      const amount = Math.round((min + Math.random() * (max - min)) * 1000) / 1000;
      return { type: item.type, amount };
    }
  }
  const last = pool[pool.length - 1];
  return { type: last.type, amount: last.minAmount ?? 0, nftId: last.nftId };
}
