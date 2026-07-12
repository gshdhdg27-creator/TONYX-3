import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  GameState,
  BossLevel,
  OwnedMage,
  ChestReward,
  BossAnimState,
  ViewName,
} from "../types/game";
import { BOSSES, BOSS_REVIVE_COST, BOSS_RESPAWN_MS } from "../constants/bosses";
import { MAGES, getMageDps } from "../constants/mages";
import {
  NFT_CONFIGS,
  NFT_IDS,
  NFT_FRAGMENT_DROP_CHANCE,
  NFT_FULL_DROP_CHANCE,
} from "../constants/nft";

const initialState: GameState = {
  view: "loading",
  balances: { ton: 0, tonyx: 0 },
  selectedBossLevel: 1,
  battleBossLevel: null,
  bossRespawnAt: {},
  reviveAdProgress: {},
  battle: {
    active: false,
    bossHpPercent: 100,
    heroHp: 100,
    totalDps: 0,
    lastRewards: null,
    battleStartedAt: null,
  },
  ownedMages: [],
  activeMageIds: [],
  equippedSlots: [null, null, null, null, null],
  pendingSlotIndex: null,
  nftInventory: {
    fragments: { shadow_dogg: 0, flame_dogg: 0, ice_dogg: 0 },
    assembled: [],
  },
  boost: {
    dpsMultiplier: 1.0,
    adWatchedCount: 0,
    boostExpiresAt: null,
    speedMultiplier: 1,
    tonBoostMultiplier: 1.0,
    tonBoostExpiresAt: null,
  },
  hasInitializedTonFromBackend: false,
};

function calcTotalDps(
  ownedMages: OwnedMage[],
  equippedSlots: (string | null)[],
  dpsMultiplier: number
): number {
  const equipped = equippedSlots
    .filter(Boolean)
    .map((id) => ownedMages.find((m) => m.id === id))
    .filter((m): m is OwnedMage => !!m);
  const raw = equipped.reduce((sum, m) => sum + getMageDps(m), 0);
  return raw * dpsMultiplier;
}

function generateChestRewards(bossLevel: BossLevel): ChestReward[] {
  const boss = BOSSES[bossLevel];
  const rewards: ChestReward[] = [];
  rewards.push({ type: "ton", amount: boss.rewardTon });
  rewards.push({ type: "tonyx", amount: boss.rewardTonyx });
  if (Math.random() < NFT_FULL_DROP_CHANCE) {
    const nftId = NFT_IDS[Math.floor(Math.random() * NFT_IDS.length)];
    rewards.push({ type: "nft_full", nftId });
  } else if (Math.random() < NFT_FRAGMENT_DROP_CHANCE) {
    const nftId = NFT_IDS[Math.floor(Math.random() * NFT_IDS.length)];
    rewards.push({ type: "nft_fragment", fragmentNftId: nftId });
  }
  return rewards;
}

interface GameActions {
  setView: (view: ViewName) => void;
  selectBoss: (level: BossLevel) => void;
  toggleMage: (mageId: string) => void;
  upgradeMage: (mageId: string) => void;
  startBattle: () => void;
  tickBattle: (deltaMs: number) => void;
  finishBoss: () => void;
  finishBossAd: () => void;
  resetBattle: () => void;
  setBossAnimState: (state: BossAnimState) => void;
  claimChestRewards: () => void;
  watchAd: () => Promise<void>;
  buySpeedBoost: () => void;
  /** Purchase a paid DPS boost: multiplier = 1.5 (+50%) or 2.0 (+100%) */
  buyDpsBoost: (multiplier: number, costTon: number) => void;
  init: () => void;
  /** Open hero-shop to pick a card for slot [index] */
  clickSlot: (index: number) => void;
  /** Place a purchased mage into the pending slot, then go back to home */
  equipMageToSlot: (mageId: string) => void;
  /** Add a mage to ownedMages (purchase) */
  buyMage: (mageId: string) => void;
  /** Sync real TON wallet balance from backend profile */
  setTonBalance: (ton: number) => void;
  /** Sync real TONYX balance from backend profile */
  setTonyxBalance: (tonyx: number) => void;
  /** Mark that the initial backend balance has been synced — prevents future overwrites */
  markTonInitialized: () => void;
  /** Revive a dead boss by paying TON */
  reviveBossWithTon: (level: BossLevel) => void;
  /** Record one ad watched toward boss revival; revives boss when threshold reached */
  watchAdForRevive: (level: BossLevel) => void;
}

interface GameStore extends GameState, GameActions {
  bossAnimState: BossAnimState;
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
  ...initialState,
  bossAnimState: "idle",

  setView: (view) => set({ view }),

  selectBoss: (level) => {
    const { ownedMages, equippedSlots, boost, battle } = get();
    // If a battle is active, only switch the viewed level — don't reset the fight
    if (battle.active) {
      set({ selectedBossLevel: level });
      return;
    }
    const dps = calcTotalDps(ownedMages, equippedSlots, boost.dpsMultiplier);
    set({ selectedBossLevel: level, battle: { ...initialState.battle, totalDps: dps } });
  },

  toggleMage: (_mageId) => {
    // No-op: slot system replaces toggle
  },

  upgradeMage: (mageId) => {
    const { ownedMages, balances, boost, equippedSlots } = get();
    const mage = ownedMages.find((m) => m.id === mageId);
    if (!mage) return;
    const cost = mage.upgradeCost * mage.level;
    if (balances.tonyx < cost) return;
    const updated = ownedMages.map((m) =>
      m.id === mageId ? { ...m, level: m.level + 1 } : m
    );
    const dps = calcTotalDps(updated, equippedSlots, boost.dpsMultiplier);
    set({
      ownedMages: updated,
      balances: { ...balances, tonyx: balances.tonyx - cost },
      battle: { ...get().battle, totalDps: dps },
    });
  },

  startBattle: () => {
    const { ownedMages, equippedSlots, boost, selectedBossLevel } = get();
    const equippedCount = equippedSlots.filter(Boolean).length;
    if (equippedCount === 0) return;
    const tonMult = (boost.tonBoostExpiresAt && Date.now() < boost.tonBoostExpiresAt) ? boost.tonBoostMultiplier : 1;
    const dps = calcTotalDps(ownedMages, equippedSlots, boost.dpsMultiplier * tonMult);
    set({
      battleBossLevel: selectedBossLevel,
      battle: {
        active: true,
        bossHpPercent: 100,
        heroHp: 100,
        totalDps: dps,
        lastRewards: null,
        battleStartedAt: Date.now(),
      },
    });
  },

  tickBattle: (deltaMs) => {
    const { battle, battleBossLevel, boost } = get();
    if (!battle.active || !battleBossLevel) return;
    const boss = BOSSES[battleBossLevel];
    const dmgToBoss = (battle.totalDps * (deltaMs / 1000)) * boost.speedMultiplier;
    const dmgPercent = (dmgToBoss / boss.maxHp) * 100;
    const newBossHp = Math.max(0, battle.bossHpPercent - dmgPercent);
    if (newBossHp <= 0) { get().finishBoss(); return; }
    set({ battle: { ...battle, bossHpPercent: newBossHp } });
  },

  finishBoss: () => {
    const { battleBossLevel, selectedBossLevel, bossRespawnAt } = get();
    const level = battleBossLevel ?? selectedBossLevel;
    const rewards = generateChestRewards(level);
    const newRespawnAt = { ...bossRespawnAt, [level]: Date.now() + BOSS_RESPAWN_MS };
    set({
      battle: { ...get().battle, active: false, bossHpPercent: 0, lastRewards: rewards },
      view: "chest",
      battleBossLevel: null,
      bossRespawnAt: newRespawnAt,
    });
  },

  finishBossAd: () => {
    const { battle } = get();
    if (!battle.active || battle.bossHpPercent > 25) return;
    const newHp = Math.max(0, battle.bossHpPercent - 1);
    if (newHp <= 0) { get().finishBoss(); return; }
    set({ battle: { ...battle, bossHpPercent: newHp } });
  },

  resetBattle: () => {
    const { ownedMages, equippedSlots, boost } = get();
    const dps = calcTotalDps(ownedMages, equippedSlots, boost.dpsMultiplier);
    set({ battle: { ...initialState.battle, totalDps: dps, battleStartedAt: null }, view: "home" });
  },

  setBossAnimState: (state) => set({ bossAnimState: state }),

  claimChestRewards: () => {
    const { battle, balances, nftInventory } = get();
    if (!battle.lastRewards) return;
    let newTon = balances.ton;
    let newTonyx = balances.tonyx;
    let newFragments = { ...nftInventory.fragments };
    const newAssembled = [...nftInventory.assembled];
    for (const reward of battle.lastRewards) {
      if (reward.type === "ton" && reward.amount) newTon += reward.amount;
      if (reward.type === "tonyx" && reward.amount) newTonyx += reward.amount;
      if (reward.type === "nft_fragment" && reward.fragmentNftId) {
        const id = reward.fragmentNftId;
        newFragments[id] = (newFragments[id] ?? 0) + 1;
        if (newFragments[id] >= NFT_CONFIGS[id].totalFragments && !newAssembled.includes(id)) {
          newAssembled.push(id);
          newFragments[id] = 0;
        }
      }
      if (reward.type === "nft_full" && reward.nftId && !newAssembled.includes(reward.nftId)) {
        newAssembled.push(reward.nftId);
      }
    }
    set({
      balances: { ton: newTon, tonyx: newTonyx },
      nftInventory: { fragments: newFragments, assembled: newAssembled },
      battle: { ...get().battle, lastRewards: null },
      view: "home",
    });
  },

  watchAd: async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    const { boost, ownedMages, equippedSlots } = get();
    const newCount = boost.adWatchedCount + 1;
    let newMultiplier = boost.dpsMultiplier;
    let expiresAt = boost.boostExpiresAt;
    if (newCount >= 10 && boost.dpsMultiplier < 1.2) {
      newMultiplier = 1.2;
      expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    }
    const dps = calcTotalDps(ownedMages, equippedSlots, newMultiplier);
    set({
      boost: { ...boost, adWatchedCount: newCount, dpsMultiplier: newMultiplier, boostExpiresAt: expiresAt },
      battle: { ...get().battle, totalDps: dps },
    });
  },

  buySpeedBoost: () => {
    const { boost, balances } = get();
    if (balances.ton < 0.1) return;
    set({ boost: { ...boost, speedMultiplier: 2 }, balances: { ...balances, ton: balances.ton - 0.1 } });
  },

  buyDpsBoost: (multiplier, costTon) => {
    const { boost, balances, ownedMages, equippedSlots, battle } = get();
    if (balances.ton < costTon) return;
    const newBoost = {
      ...boost,
      tonBoostMultiplier: multiplier,
      tonBoostExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    const dps = calcTotalDps(ownedMages, equippedSlots, newBoost.dpsMultiplier * multiplier);
    set({
      balances: { ...balances, ton: balances.ton - costTon },
      boost: newBoost,
      battle: { ...battle, totalDps: dps },
    });
  },

  init: () => {
    const { boost, ownedMages, equippedSlots, battle, battleBossLevel, selectedBossLevel } = get();

    // Expire ad boost if needed
    let dpsMultiplier = boost.dpsMultiplier;
    let currentBoost = boost;
    if (boost.boostExpiresAt && Date.now() > boost.boostExpiresAt) {
      dpsMultiplier = 1.0;
      currentBoost = { ...boost, dpsMultiplier: 1.0, boostExpiresAt: null, adWatchedCount: 0 };
      set({ boost: currentBoost });
    }
    // Expire paid TON boost if needed
    let tonMult = currentBoost.tonBoostMultiplier ?? 1;
    if (currentBoost.tonBoostExpiresAt && Date.now() > currentBoost.tonBoostExpiresAt) {
      tonMult = 1.0;
      currentBoost = { ...currentBoost, tonBoostMultiplier: 1.0, tonBoostExpiresAt: null };
      set({ boost: currentBoost });
    }
    const dps = calcTotalDps(ownedMages, equippedSlots, dpsMultiplier * tonMult);

    // ── Offline progress ──────────────────────────────────────────────
    const fightLevel = battleBossLevel ?? selectedBossLevel;
    if (battle.active && battle.battleStartedAt) {
      const boss = BOSSES[fightLevel];
      const offlineSec = (Date.now() - battle.battleStartedAt) / 1000;
      const offlineDmg = battle.totalDps * offlineSec * boost.speedMultiplier;
      const offlineDmgPct = (offlineDmg / boss.maxHp) * 100;
      const newHpPct = Math.max(0, battle.bossHpPercent - offlineDmgPct);

      if (newHpPct <= 0) {
        // finishBoss handles rewards + respawnAt + battleBossLevel reset
        get().finishBoss();
      } else {
        set({
          view: "home",
          battle: { ...battle, bossHpPercent: newHpPct, totalDps: dps, battleStartedAt: Date.now() },
        });
      }
      return;
    }
    // ──────────────────────────────────────────────────────────────────

    set({ view: "home", battle: { ...get().battle, totalDps: dps } });
  },

  clickSlot: (index) => {
    set({ pendingSlotIndex: index });
    get().setView("hero-shop");
  },

  equipMageToSlot: (mageId) => {
    const { pendingSlotIndex, equippedSlots, ownedMages, boost } = get();
    if (pendingSlotIndex === null) return;
    if (pendingSlotIndex < 0 || pendingSlotIndex > 4) return;
    // Only allow equipping owned mages
    if (!ownedMages.find((m) => m.id === mageId)) return;
    // Remove this mage from any other slot first
    const newSlots = equippedSlots.map((id) =>
      id === mageId ? null : id
    ) as (string | null)[];
    // Place in the target slot
    newSlots[pendingSlotIndex] = mageId;
    const dps = calcTotalDps(ownedMages, newSlots, boost.dpsMultiplier);
    set({
      equippedSlots: newSlots,
      pendingSlotIndex: null,
      battle: { ...get().battle, totalDps: dps },
    });
    get().setView("home");
  },

  buyMage: (mageId) => {
    const { ownedMages, equippedSlots, boost, balances } = get();
    if (ownedMages.find((m) => m.id === mageId)) return;
    const mage = MAGES.find((m) => m.id === mageId);
    if (!mage) return;
    // Check TON balance (free mages have priceTon === 0)
    if (mage.priceTon > 0 && balances.ton < mage.priceTon) return;
    const newOwned = [...ownedMages, { ...mage }];
    const newTon = mage.priceTon > 0 ? balances.ton - mage.priceTon : balances.ton;
    const dps = calcTotalDps(newOwned, equippedSlots, boost.dpsMultiplier);
    set({
      ownedMages: newOwned,
      balances: { ...balances, ton: newTon },
      battle: { ...get().battle, totalDps: dps },
    });
  },

  setTonBalance: (ton) => {
    set({ balances: { ...get().balances, ton } });
  },

  setTonyxBalance: (tonyx) => {
    set({ balances: { ...get().balances, tonyx } });
  },

  markTonInitialized: () => {
    set({ hasInitializedTonFromBackend: true });
  },

  reviveBossWithTon: (level) => {
    const { balances, bossRespawnAt } = get();
    const cost = BOSS_REVIVE_COST[level].ton;
    if (balances.ton < cost) return;
    const newRespawnAt = { ...bossRespawnAt };
    delete newRespawnAt[level];
    set({ balances: { ...balances, ton: balances.ton - cost }, bossRespawnAt: newRespawnAt });
  },

  watchAdForRevive: (level) => {
    const { reviveAdProgress, bossRespawnAt } = get();
    const reviveCost = BOSS_REVIVE_COST[level];
    if (reviveCost.ads === null) return;
    const current = reviveAdProgress[level] ?? 0;
    const newProgress = current + 1;
    if (newProgress >= reviveCost.ads) {
      const newRespawnAt = { ...bossRespawnAt };
      delete newRespawnAt[level];
      const newProgress2 = { ...reviveAdProgress };
      delete newProgress2[level];
      set({ bossRespawnAt: newRespawnAt, reviveAdProgress: newProgress2 });
    } else {
      set({ reviveAdProgress: { ...reviveAdProgress, [level]: newProgress } });
    }
  },
    }),
    {
      name: "tonyx-game-state-v2",
      storage: createJSONStorage(() => localStorage),
      // Persist game progress; balances come exclusively from the server on every load
      partialize: (state) => ({
        ownedMages: state.ownedMages,
        equippedSlots: state.equippedSlots,
        activeMageIds: state.activeMageIds,
        nftInventory: state.nftInventory,
        boost: state.boost,
        selectedBossLevel: state.selectedBossLevel,
        battle: state.battle,
        battleBossLevel: state.battleBossLevel,
        bossRespawnAt: state.bossRespawnAt,
        reviveAdProgress: state.reviveAdProgress,
      }),
    }
  )
);
