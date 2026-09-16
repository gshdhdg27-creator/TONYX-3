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

export function getMageDps(baseDps: number, level: number): number {
  return baseDps * Math.pow(1.4, level - 1);
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
