// ─── VIEW ──────────────────────────────────────────────
export type ViewName = "loading" | "home" | "battle" | "chest" | "collection";

// ─── BOSS ──────────────────────────────────────────────
export type BossLevel = 1 | 2 | 3 | 4 | 5;

export type BossAnimState =
  | "idle"
  | "rage"
  | "roar"
  | "stomp"
  | "fire_breath";

export interface BossConfig {
  level: BossLevel;
  name: string;
  maxHp: number;
  baseAttack: number;
  attackInterval: [number, number];
  rewardTon: number;
  rewardTonyx: number;
  color: string;
}

// ─── MAGE ──────────────────────────────────────────────
export type MageType = "fire" | "ice" | "lightning" | "wind";

export interface MageConfig {
  id: string;
  name: string;
  type: MageType;
  baseDps: number;
  upgradeCost: number;
  level: number;
  emoji: string;
  attackColor: string;
}

export interface OwnedMage extends MageConfig {
  level: number;
}

// ─── NFT ───────────────────────────────────────────────
export type NftId = "shadow_dogg" | "flame_dogg" | "ice_dogg";

export interface NftConfig {
  id: NftId;
  name: string;
  description: string;
  emoji: string;
  totalFragments: 9;
}

export interface NFTInventory {
  fragments: Record<NftId, number>;
  assembled: NftId[];
}

// ─── CHEST ─────────────────────────────────────────────
export type ChestRewardType = "ton" | "tonyx" | "nft_fragment" | "nft_full";

export interface ChestReward {
  type: ChestRewardType;
  amount?: number;
  nftId?: NftId;
  fragmentNftId?: NftId;
}

// ─── BATTLE ────────────────────────────────────────────
export interface BattleState {
  active: boolean;
  bossHpPercent: number;
  heroHp: number;
  totalDps: number;
  lastRewards: ChestReward[] | null;
}

// ─── BOOST ─────────────────────────────────────────────
export interface BoostState {
  dpsMultiplier: number;
  adWatchedCount: number;
  boostExpiresAt: number | null;
  speedMultiplier: number;
}

// ─── ROOT GAME STATE ───────────────────────────────────
export interface GameState {
  view: ViewName;
  balances: {
    ton: number;
    tonyx: number;
  };
  selectedBossLevel: BossLevel;
  battle: BattleState;
  ownedMages: OwnedMage[];
  activeMageIds: string[];
  nftInventory: NFTInventory;
  boost: BoostState;
}
