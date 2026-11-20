/** Boss / mage / case constants used by the server-authoritative battle API. */

export type BossLevel = 1 | 2 | 3 | 4 | 5;

export interface BossConfig {
  level: BossLevel;
  name: string;
  hp: number;
  maxHp: number;
  rewardTon: number;
  rewardTonyx: number;
  keyDropChance: number;
}

export interface MageConfig {
  id: string;
  nameRu: string;
  nameEn: string;
  baseDps: number;
  priceTon: number;
  baseUpgradeCost: number;
  rarity: "common" | "rare" | "epic" | "legendary";
  imageUrl?: string;
}

export interface ReviveCost {
  ton: number;
  tonyx: number;
  ads: number | null;
}

export const BOSSES: Record<BossLevel, BossConfig> = {
  1: { level: 1, name: "Shadow Pup", hp: 25_000, maxHp: 25_000, rewardTon: 0.01, rewardTonyx: 50, keyDropChance: 0.35 },
  2: { level: 2, name: "Rage Dog", hp: 50_000, maxHp: 50_000, rewardTon: 0.03, rewardTonyx: 150, keyDropChance: 0.3 },
  3: { level: 3, name: "Inferno Dog", hp: 100_000, maxHp: 100_000, rewardTon: 0.08, rewardTonyx: 400, keyDropChance: 0.25 },
  4: { level: 4, name: "Storm Dog", hp: 250_000, maxHp: 250_000, rewardTon: 0.2, rewardTonyx: 1000, keyDropChance: 0.2 },
  5: { level: 5, name: "Boss Dog Prime", hp: 500_000, maxHp: 500_000, rewardTon: 0.5, rewardTonyx: 3000, keyDropChance: 0.15 },
};

export const BOSS_REVIVE_COST: Record<BossLevel, ReviveCost> = {
  1: { ton: 0.10, tonyx: 200, ads: 10 },
  2: { ton: 0.25, tonyx: 600, ads: 25 },
  3: { ton: 0.50, tonyx: 1500, ads: 50 },
  4: { ton: 1.00, tonyx: 4000, ads: 100 },
  5: { ton: 2.50, tonyx: 10000, ads: null },
};

export const BOSS_RESPAWN_MS = 24 * 60 * 60 * 1000;
export const BATTLE_MAX_AGE_MS = 3 * 60 * 60 * 1000;
export const KILL_TIME_TOLERANCE = 0.15;

/** Must match artifacts/mini-app/src/constants/mages.ts ids & priceTon */
export const MAGES: MageConfig[] = [
  { id: "wind-whisperer", nameRu: "Шёпот Ветра", nameEn: "Wind Whisperer", baseDps: 0.25, priceTon: 0, baseUpgradeCost: 0, rarity: "rare" },
  { id: "storm-weaver", nameRu: "Ткач Бури", nameEn: "Storm Weaver", baseDps: 0.30, priceTon: 0.5, baseUpgradeCost: 50, rarity: "rare" },
  { id: "frost-weaver", nameRu: "Ткач Мороза", nameEn: "Frost Weaver", baseDps: 0.35, priceTon: 0.8, baseUpgradeCost: 80, rarity: "rare" },
  { id: "pyreclastic-arcanist", nameRu: "Пирокластический Арканист", nameEn: "Pyreclastic Arcanist", baseDps: 0.40, priceTon: 1.2, baseUpgradeCost: 120, rarity: "rare" },
  { id: "aether-scholar", nameRu: "Эфирный Учёный", nameEn: "Aether Scholar", baseDps: 0.50, priceTon: 1.5, baseUpgradeCost: 150, rarity: "rare" },
  { id: "elara-void-weaver", nameRu: "Элара, Ткачиха Пустоты", nameEn: "Elara, Void Weaver", baseDps: 0.60, priceTon: 3.0, baseUpgradeCost: 300, rarity: "epic" },
  { id: "aethel-thunderlord", nameRu: "Этель, Повелитель Грома", nameEn: "Aethel, Thunderlord", baseDps: 0.70, priceTon: 3.8, baseUpgradeCost: 380, rarity: "epic" },
  { id: "korvin-thunderclap", nameRu: "Корвин, Громовой Удар", nameEn: "Korvin, Thunderclap", baseDps: 0.80, priceTon: 4.5, baseUpgradeCost: 450, rarity: "epic" },
  { id: "kaeleda-void-dancer", nameRu: "Каэледа, Танцовщица Пустоты", nameEn: "Kaeleda, Void Dancer", baseDps: 0.90, priceTon: 5.2, baseUpgradeCost: 520, rarity: "epic" },
  { id: "kalen-inferno-blaze", nameRu: "Кален, Инферно", nameEn: "Kalen, Inferno Blaze", baseDps: 1.00, priceTon: 6.0, baseUpgradeCost: 600, rarity: "epic" },
  { id: "silas-starsinger", nameRu: "Сайлас, Звёздный Певец", nameEn: "Silas, Starsinger", baseDps: 1.25, priceTon: 12.0, baseUpgradeCost: 1200, rarity: "legendary" },
  { id: "lyra-cosmic-weaver", nameRu: "Лира, Космическая Ткачиха", nameEn: "Lyra, Cosmic Weaver", baseDps: 1.50, priceTon: 14.0, baseUpgradeCost: 1400, rarity: "legendary" },
  { id: "aethel-abyss-weaver", nameRu: "Этель, Ткач Бездны", nameEn: "Aethel, Abyss Weaver", baseDps: 1.75, priceTon: 16.0, baseUpgradeCost: 1600, rarity: "legendary" },
  { id: "solaris-chronos-shaper", nameRu: "Солярис, Ваятель Хроноса", nameEn: "Solaris, Chronos Shaper", baseDps: 2.00, priceTon: 18.0, baseUpgradeCost: 1800, rarity: "legendary" },
  { id: "lyra-emerald-chronomancer", nameRu: "Лира, Изумрудный Хрономант", nameEn: "Lyra, Emerald Chronomancer", baseDps: 2.50, priceTon: 22.0, baseUpgradeCost: 2200, rarity: "legendary" },
];

export const MAX_MAGE_LEVEL = 10;
export function getMageLevelMultiplier(_level: number): number { return 1; }
export function getMageDps(baseDps: number, _level?: number): number { return baseDps; }
export function getUpgradeCost(baseUpgradeCost: number, currentLevel: number): number {
  return Math.floor(baseUpgradeCost * Math.pow(1.45, Math.max(0, currentLevel - 1)));
}
export function getMageById(mageId: string): MageConfig | undefined {
  return MAGES.find((m) => m.id === mageId);
}

export const NFT_IDS = ["shadow_dogg", "flame_dogg", "ice_dogg"] as const;
export type NftId = (typeof NFT_IDS)[number];
export const NFT_FULL_DROP_CHANCE = 0.02;
export const NFT_FRAGMENT_DROP_CHANCE = 0.15;
export const NFT_FRAGMENTS_NEEDED = 9;
export const AD_BOOST = { dpsMultiplier: 2, durationMs: 15 * 60 * 1000 };
export const TON_DPS_BOOSTS = [
  { ton: 0.1, multiplier: 1.25, durationMs: 30 * 60 * 1000 },
  { ton: 0.5, multiplier: 1.75, durationMs: 60 * 60 * 1000 },
];
export const SPEED_BOOST = { multiplier: 1.5, durationMs: 10 * 60 * 1000 };
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
  costValue: number;
  rewards: CaseRewardPoolItem[];
}

export const CASES: CaseConfig[] = [
  { id: "boss_1", nameRu: "Кейс Shadow Pup", nameEn: "Shadow Pup Case", costType: "key", costValue: 1, rewards: [
    { type: "ton", weight: 30, minAmount: 0.01, maxAmount: 0.01 },
    { type: "ton", weight: 20, minAmount: 0.02, maxAmount: 0.02 },
    { type: "tonyx", weight: 35, minAmount: 50, maxAmount: 50 },
    { type: "tonyx", weight: 10, minAmount: 100, maxAmount: 100 },
    { type: "nft_fragment", weight: 5, nftId: "hypno_lollipop" },
  ]},
  { id: "boss_2", nameRu: "Кейс Rage Dog", nameEn: "Rage Dog Case", costType: "key", costValue: 2, rewards: [
    { type: "ton", weight: 28, minAmount: 0.02, maxAmount: 0.02 },
    { type: "ton", weight: 18, minAmount: 0.05, maxAmount: 0.05 },
    { type: "tonyx", weight: 35, minAmount: 100, maxAmount: 100 },
    { type: "tonyx", weight: 12, minAmount: 250, maxAmount: 250 },
    { type: "nft_fragment", weight: 7, nftId: "snoop_cigar" },
  ]},
  { id: "boss_3", nameRu: "Кейс Inferno Dog", nameEn: "Inferno Dog Case", costType: "key", costValue: 3, rewards: [
    { type: "ton", weight: 26, minAmount: 0.05, maxAmount: 0.05 },
    { type: "ton", weight: 16, minAmount: 0.1, maxAmount: 0.1 },
    { type: "tonyx", weight: 34, minAmount: 200, maxAmount: 200 },
    { type: "tonyx", weight: 14, minAmount: 500, maxAmount: 500 },
    { type: "nft_fragment", weight: 10, nftId: "electric_skull" },
  ]},
  { id: "boss_4", nameRu: "Кейс Storm Dog", nameEn: "Storm Dog Case", costType: "key", costValue: 4, rewards: [
    { type: "ton", weight: 24, minAmount: 0.1, maxAmount: 0.1 },
    { type: "ton", weight: 16, minAmount: 0.25, maxAmount: 0.25 },
    { type: "tonyx", weight: 32, minAmount: 500, maxAmount: 500 },
    { type: "tonyx", weight: 14, minAmount: 1000, maxAmount: 1000 },
    { type: "nft_fragment", weight: 14, nftId: "neko_helmet" },
  ]},
  { id: "boss_5", nameRu: "Кейс Boss Dog Prime", nameEn: "Boss Dog Prime Case", costType: "key", costValue: 5, rewards: [
    { type: "ton", weight: 22, minAmount: 0.25, maxAmount: 0.25 },
    { type: "ton", weight: 14, minAmount: 0.5, maxAmount: 0.5 },
    { type: "tonyx", weight: 30, minAmount: 1000, maxAmount: 1000 },
    { type: "tonyx", weight: 14, minAmount: 2500, maxAmount: 2500 },
    { type: "nft_fragment", weight: 15, nftId: "heroic_helmet" },
    { type: "nft_fragment", weight: 5, nftId: "royal_dogg" },
  ]},
  { id: "ton_basic", nameRu: "TON Кейс", nameEn: "TON Case", costType: "ton", costValue: 0.1, rewards: [
    { type: "ton", weight: 50, minAmount: 0.05, maxAmount: 0.05 },
    { type: "tonyx", weight: 40, minAmount: 50, maxAmount: 50 },
    { type: "nft_fragment", weight: 10, nftId: "hypno_lollipop" },
  ]},
  { id: "ton_premium", nameRu: "TON Премиум", nameEn: "TON Premium", costType: "ton", costValue: 0.5, rewards: [
    { type: "ton", weight: 40, minAmount: 0.2, maxAmount: 0.2 },
    { type: "tonyx", weight: 40, minAmount: 200, maxAmount: 200 },
    { type: "nft_fragment", weight: 20, nftId: "moon_pendant" },
  ]},
  { id: "tonyx_basic", nameRu: "TONYX Кейс", nameEn: "TONYX Case", costType: "tonyx", costValue: 200, rewards: [
    { type: "ton", weight: 30, minAmount: 0.05, maxAmount: 0.05 },
    { type: "tonyx", weight: 55, minAmount: 150, maxAmount: 150 },
    { type: "nft_fragment", weight: 15, nftId: "snoop_cigar" },
  ]},
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
        return { type: item.type, nftId: item.nftId, pieceIndex: item.pieceIndex ?? Math.floor(Math.random() * 9) };
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
