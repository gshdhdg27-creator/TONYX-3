/** Boss / mage / case constants used by the server-authoritative battle API. */

export type BossLevel = 1 | 2 | 3 | 4 | 5;

export interface BossConfig {
  level: BossLevel;
  name: string;
  hp: number;
  /** Base TONYX reward for a kill */
  rewardTonyx: number;
  /** Key drop chance 0..1 */
  keyDropChance: number;
}

export interface MageConfig {
  id: string;
  nameRu: string;
  nameEn: string;
  baseDps: number;
  baseUpgradeCost: number;
  rarity: "common" | "rare" | "epic" | "legendary";
  imageUrl?: string;
}

export interface ReviveCost {
  ton: number;
  tonyx: number;
}

export const BOSSES: Record<BossLevel, BossConfig> = {
  1: { level: 1, name: "Shadow Pup", hp: 5_000, rewardTonyx: 40, keyDropChance: 0.35 },
  2: { level: 2, name: "Rage Dogg", hp: 25_000, rewardTonyx: 120, keyDropChance: 0.3 },
  3: { level: 3, name: "Inferno Dogg", hp: 120_000, rewardTonyx: 400, keyDropChance: 0.25 },
  4: { level: 4, name: "Storm Dogg", hp: 600_000, rewardTonyx: 1_200, keyDropChance: 0.2 },
  5: { level: 5, name: "Boss Dogg Prime", hp: 3_000_000, rewardTonyx: 4_000, keyDropChance: 0.15 },
};

export const BOSS_REVIVE_COST: Record<BossLevel, ReviveCost> = {
  1: { ton: 0.05, tonyx: 200 },
  2: { ton: 0.15, tonyx: 600 },
  3: { ton: 0.4, tonyx: 1_500 },
  4: { ton: 1, tonyx: 4_000 },
  5: { ton: 2.5, tonyx: 10_000 },
};

/** Global boss respawn after kill */
export const BOSS_RESPAWN_MS = 72 * 60 * 60 * 1000;

/** Max age of a battle session */
export const BATTLE_MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3 hours

/** Allowed client/server kill time drift */
export const KILL_TIME_TOLERANCE = 0.15;

export const MAGES: MageConfig[] = [
  { id: "wind-whisperer", nameRu: "Шёпот Ветра", nameEn: "Wind Whisperer", baseDps: 8, baseUpgradeCost: 50, rarity: "common" },
  { id: "ember-apprentice", nameRu: "Ученик Пламени", nameEn: "Ember Apprentice", baseDps: 14, baseUpgradeCost: 120, rarity: "common" },
  { id: "frost-adept", nameRu: "Адепт Мороза", nameEn: "Frost Adept", baseDps: 28, baseUpgradeCost: 350, rarity: "rare" },
  { id: "storm-caller", nameRu: "Призыватель Бури", nameEn: "Storm Caller", baseDps: 55, baseUpgradeCost: 900, rarity: "rare" },
  { id: "void-seeker", nameRu: "Искатель Пустоты", nameEn: "Void Seeker", baseDps: 110, baseUpgradeCost: 2_200, rarity: "epic" },
  { id: "sun-priest", nameRu: "Жрец Солнца", nameEn: "Sun Priest", baseDps: 220, baseUpgradeCost: 5_500, rarity: "epic" },
  { id: "night-archon", nameRu: "Архонт Ночи", nameEn: "Night Archon", baseDps: 450, baseUpgradeCost: 14_000, rarity: "legendary" },
  { id: "chaos-oracle", nameRu: "Оракул Хаоса", nameEn: "Chaos Oracle", baseDps: 900, baseUpgradeCost: 35_000, rarity: "legendary" },
];

export const MAX_MAGE_LEVEL = 10;

/** Level multiplier for mage DPS (flat for now — level handled by upgrades). */
export function getMageLevelMultiplier(_level: number): number {
  return 1;
}

/** Effective DPS for a mage at a given level. */
export function getMageDps(baseDps: number, _level?: number): number {
  return baseDps;
}

/** Upgrade cost formula. */
export function getUpgradeCost(baseUpgradeCost: number, currentLevel: number): number {
  return Math.floor(baseUpgradeCost * Math.pow(1.45, Math.max(0, currentLevel - 1)));
}

export function getMageById(mageId: string): MageConfig | undefined {
  return MAGES.find((m) => m.id === mageId);
}

export const NFT_IDS = ["shadow_dogg", "flame_dogg", "ice_dogg"] as const;
export type NftId = (typeof NFT_IDS)[number];

export const NFT_FULL_DROP_CHANCE = 0.02;      // 2%
export const NFT_FRAGMENT_DROP_CHANCE = 0.15;  // 15%
export const NFT_FRAGMENTS_NEEDED = 9;

export const AD_BOOST = {
  dpsMultiplier: 2,
  durationMs: 15 * 60 * 1000,
};

export const TON_DPS_BOOSTS = [
  { ton: 0.1, multiplier: 1.25, durationMs: 30 * 60 * 1000 },
  { ton: 0.5, multiplier: 1.75, durationMs: 60 * 60 * 1000 },
];

export const SPEED_BOOST = {
  multiplier: 1.5,
  durationMs: 10 * 60 * 1000,
};

export const STARTER_MAGE_ID = "wind-whisperer";

export type CaseCostType = "key" | "ton" | "tonyx";

export interface CaseRewardPoolItem {
  type: "ton" | "tonyx" | "nft_fragment" | "nft_full";
  weight: number;
  minAmount?: number;
  maxAmount?: number;
  nftId?: string;
  pieceIndex?: number;
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
  {
    id: "boss_1",
    nameRu: "Кейс Shadow Pup",
    nameEn: "Shadow Pup Case",
    costType: "key",
    costValue: 1,
    rewards: [
      { type: "ton", weight: 30, minAmount: 0.01, maxAmount: 0.01 },
      { type: "ton", weight: 20, minAmount: 0.02, maxAmount: 0.02 },
      { type: "tonyx", weight: 35, minAmount: 50, maxAmount: 50 },
      { type: "tonyx", weight: 10, minAmount: 100, maxAmount: 100 },
      { type: "nft_fragment", weight: 5, nftId: "hypno_lollipop" },
    ],
  },
  {
    id: "boss_2",
    nameRu: "Кейс Rage Dogg",
    nameEn: "Rage Dogg Case",
    costType: "key",
    costValue: 2,
    rewards: [
      { type: "ton", weight: 28, minAmount: 0.02, maxAmount: 0.02 },
      { type: "ton", weight: 18, minAmount: 0.05, maxAmount: 0.05 },
      { type: "tonyx", weight: 35, minAmount: 100, maxAmount: 100 },
      { type: "tonyx", weight: 12, minAmount: 250, maxAmount: 250 },
      { type: "nft_fragment", weight: 7, nftId: "snoop_cigar" },
    ],
  },
  {
    id: "boss_3",
    nameRu: "Кейс Inferno Dogg",
    nameEn: "Inferno Dogg Case",
    costType: "key",
    costValue: 3,
    rewards: [
      { type: "ton", weight: 26, minAmount: 0.05, maxAmount: 0.05 },
      { type: "ton", weight: 16, minAmount: 0.1, maxAmount: 0.1 },
      { type: "tonyx", weight: 34, minAmount: 200, maxAmount: 200 },
      { type: "tonyx", weight: 14, minAmount: 500, maxAmount: 500 },
      { type: "nft_fragment", weight: 10, nftId: "electric_skull" },
    ],
  },
  {
    id: "boss_4",
    nameRu: "Кейс Storm Dogg",
    nameEn: "Storm Dogg Case",
    costType: "key",
    costValue: 4,
    rewards: [
      { type: "ton", weight: 24, minAmount: 0.1, maxAmount: 0.1 },
      { type: "ton", weight: 16, minAmount: 0.25, maxAmount: 0.25 },
      { type: "tonyx", weight: 32, minAmount: 500, maxAmount: 500 },
      { type: "tonyx", weight: 14, minAmount: 1000, maxAmount: 1000 },
      { type: "nft_fragment", weight: 14, nftId: "neko_helmet" },
    ],
  },
  {
    id: "boss_5",
    nameRu: "Кейс Boss Dogg Prime",
    nameEn: "Boss Dogg Prime Case",
    costType: "key",
    costValue: 5,
    rewards: [
      { type: "ton", weight: 22, minAmount: 0.25, maxAmount: 0.25 },
      { type: "ton", weight: 14, minAmount: 0.5, maxAmount: 0.5 },
      { type: "tonyx", weight: 30, minAmount: 1000, maxAmount: 1000 },
      { type: "tonyx", weight: 14, minAmount: 2500, maxAmount: 2500 },
      { type: "nft_fragment", weight: 15, nftId: "heroic_helmet" },
      { type: "nft_fragment", weight: 5, nftId: "royal_dogg" },
    ],
  },
  {
    id: "ton_basic",
    nameRu: "TON Кейс",
    nameEn: "TON Case",
    costType: "ton",
    costValue: 0.1,
    rewards: [
      { type: "ton", weight: 50, minAmount: 0.05, maxAmount: 0.05 },
      { type: "tonyx", weight: 40, minAmount: 50, maxAmount: 50 },
      { type: "nft_fragment", weight: 10, nftId: "hypno_lollipop" },
    ],
  },
  {
    id: "ton_premium",
    nameRu: "TON Премиум",
    nameEn: "TON Premium",
    costType: "ton",
    costValue: 0.5,
    rewards: [
      { type: "ton", weight: 40, minAmount: 0.2, maxAmount: 0.2 },
      { type: "tonyx", weight: 40, minAmount: 200, maxAmount: 200 },
      { type: "nft_fragment", weight: 20, nftId: "moon_pendant" },
    ],
  },
  {
    id: "tonyx_basic",
    nameRu: "TONYX Кейс",
    nameEn: "TONYX Case",
    costType: "tonyx",
    costValue: 200,
    rewards: [
      { type: "ton", weight: 30, minAmount: 0.05, maxAmount: 0.05 },
      { type: "tonyx", weight: 55, minAmount: 150, maxAmount: 150 },
      { type: "nft_fragment", weight: 15, nftId: "snoop_cigar" },
    ],
  },
];

export function pickCaseReward(pool: CaseRewardPoolItem[]): {
  type: CaseRewardPoolItem["type"];
  amount?: number;
  nftId?: string;
  pieceIndex?: number;
} {
  if (!pool.length) return { type: "tonyx", amount: 0 };
  const total = pool.reduce((s, r) => s + (r.weight || 0), 0) || 1;
  let roll = Math.random() * total;
  for (const item of pool) {
    roll -= item.weight || 0;
    if (roll <= 0) {
      if (item.type === "nft_fragment" || item.type === "nft_full") {
        return {
          type: item.type,
          nftId: item.nftId,
          pieceIndex: item.pieceIndex ?? Math.floor(Math.random() * 9),
        };
      }
      const min = item.minAmount ?? 0;
      const max = item.maxAmount ?? min;
      const amount = Math.round((min + Math.random() * (max - min)) * 10000) / 10000;
      return { type: item.type, amount };
    }
  }
  const last = pool[pool.length - 1];
  return { type: last.type, amount: last.minAmount ?? 0, nftId: last.nftId };
}
