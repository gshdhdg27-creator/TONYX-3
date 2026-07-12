// ─── VIEW ──────────────────────────────────────────────
export type ViewName = "loading" | "home" | "battle" | "chest" | "collection" | "hero-shop";

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
export type MageRarity = "rare" | "epic" | "legendary";

export interface MageConfig {
  id: string;
  name: string;
  type: MageType;
  rarity: MageRarity;
  atk: number;
  interval: number; // seconds
  dps: number;
  priceTon: number; // 0 = free
  image: string;
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
  /** Timestamp (ms) when the current battle started, for countdown */
  battleStartedAt: number | null;
}

// ─── BOOST ─────────────────────────────────────────────
export interface BoostState {
  /** Ad-earned multiplier: 1.0 or 1.2 */
  dpsMultiplier: number;
  adWatchedCount: number;
  boostExpiresAt: number | null;
  speedMultiplier: number;
  /** TON-purchased multiplier: 1.0, 1.5 (+50%), or 2.0 (+100%) */
  tonBoostMultiplier: number;
  tonBoostExpiresAt: number | null;
}

// ─── ROOT GAME STATE ───────────────────────────────────
export interface GameState {
  view: ViewName;
  balances: {
    ton: number;
    tonyx: number;
  };
  selectedBossLevel: BossLevel;
  /** Which boss level the currently active battle is fighting — null when no battle */
  battleBossLevel: BossLevel | null;
  battle: BattleState;
  /** Unix timestamp (ms) when each boss respawns after being defeated. Missing = alive */
  bossRespawnAt: Partial<Record<BossLevel, number>>;
  /** Ads watched toward revival per boss level */
  reviveAdProgress: Partial<Record<BossLevel, number>>;
  ownedMages: OwnedMage[];
  activeMageIds: string[];
  /** 5 equipped slots — each holds a mage ID or null */
  equippedSlots: (string | null)[];
  /** index of slot the user tapped (0-4) when navigating to shop to pick a card */
  pendingSlotIndex: number | null;
  nftInventory: NFTInventory;
  boost: BoostState;
  /** Set to true after the first successful backend balance sync — prevents later refetches from overwriting in-game spend */
  hasInitializedTonFromBackend: boolean;
}
