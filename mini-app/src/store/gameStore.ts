import { create } from "zustand";
import type {
  GameState,
  BossLevel,
  OwnedMage,
  ChestReward,
  BossAnimState,
  ViewName,
} from "../types/game";
import { BOSSES } from "../constants/bosses";
import { MAGES, getMageDps } from "../constants/mages";
import {
  NFT_CONFIGS,
  NFT_IDS,
  NFT_FRAGMENT_DROP_CHANCE,
  NFT_FULL_DROP_CHANCE,
} from "../constants/nft";

const initialOwnedMages: OwnedMage[] = MAGES.slice(0, 3).map((m) => ({ ...m }));

const initialState: GameState = {
  view: "loading",
  balances: { ton: 0.05, tonyx: 200 },
  selectedBossLevel: 1,
  battle: {
    active: false,
    bossHpPercent: 100,
    heroHp: 100,
    totalDps: 0,
    lastRewards: null,
  },
  ownedMages: initialOwnedMages,
  activeMageIds: [initialOwnedMages[0].id],
  nftInventory: {
    fragments: { shadow_dogg: 0, flame_dogg: 0, ice_dogg: 0 },
    assembled: [],
  },
  boost: {
    dpsMultiplier: 1.0,
    adWatchedCount: 0,
    boostExpiresAt: null,
    speedMultiplier: 1,
  },
};

function calcTotalDps(
  ownedMages: OwnedMage[],
  activeMageIds: string[],
  dpsMultiplier: number
): number {
  const active = ownedMages.filter((m) => activeMageIds.includes(m.id));
  const raw = active.reduce((sum, m) => sum + getMageDps(m), 0);
  return Math.floor(raw * dpsMultiplier);
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
  init: () => void;
}

interface GameStore extends GameState, GameActions {
  bossAnimState: BossAnimState;
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,
  bossAnimState: "idle",

  setView: (view) => set({ view }),

  selectBoss: (level) => {
    const dps = calcTotalDps(get().ownedMages, get().activeMageIds, get().boost.dpsMultiplier);
    set({ selectedBossLevel: level, battle: { ...initialState.battle, totalDps: dps } });
  },

  toggleMage: (mageId) => {
    const { activeMageIds, ownedMages, boost } = get();
    let next: string[];
    if (activeMageIds.includes(mageId)) {
      next = activeMageIds.filter((id) => id !== mageId);
    } else {
      if (activeMageIds.length >= 5) return;
      next = [...activeMageIds, mageId];
    }
    const dps = calcTotalDps(ownedMages, next, boost.dpsMultiplier);
    set({ activeMageIds: next, battle: { ...get().battle, totalDps: dps } });
  },

  upgradeMage: (mageId) => {
    const { ownedMages, balances, activeMageIds, boost } = get();
    const mage = ownedMages.find((m) => m.id === mageId);
    if (!mage) return;
    const cost = mage.upgradeCost * mage.level;
    if (balances.tonyx < cost) return;
    const updated = ownedMages.map((m) =>
      m.id === mageId ? { ...m, level: m.level + 1 } : m
    );
    const dps = calcTotalDps(updated, activeMageIds, boost.dpsMultiplier);
    set({
      ownedMages: updated,
      balances: { ...balances, tonyx: balances.tonyx - cost },
      battle: { ...get().battle, totalDps: dps },
    });
  },

  startBattle: () => {
    const { ownedMages, activeMageIds, boost } = get();
    if (activeMageIds.length === 0) return;
    const dps = calcTotalDps(ownedMages, activeMageIds, boost.dpsMultiplier);
    set({
      view: "battle",
      battle: { active: true, bossHpPercent: 100, heroHp: 100, totalDps: dps, lastRewards: null },
    });
  },

  tickBattle: (deltaMs) => {
    const { battle, selectedBossLevel, boost } = get();
    if (!battle.active) return;
    const boss = BOSSES[selectedBossLevel];
    const dmgToBoss = (battle.totalDps * (deltaMs / 1000)) * boost.speedMultiplier;
    const dmgPercent = (dmgToBoss / boss.maxHp) * 100;
    const newBossHp = Math.max(0, battle.bossHpPercent - dmgPercent);
    if (newBossHp <= 0) { get().finishBoss(); return; }
    set({ battle: { ...battle, bossHpPercent: newBossHp } });
  },

  finishBoss: () => {
    const rewards = generateChestRewards(get().selectedBossLevel);
    set({ battle: { ...get().battle, active: false, bossHpPercent: 0, lastRewards: rewards }, view: "chest" });
  },

  finishBossAd: () => {
    const { battle } = get();
    if (!battle.active || battle.bossHpPercent > 25) return;
    const newHp = Math.max(0, battle.bossHpPercent - 1);
    if (newHp <= 0) { get().finishBoss(); return; }
    set({ battle: { ...battle, bossHpPercent: newHp } });
  },

  resetBattle: () => {
    const dps = calcTotalDps(get().ownedMages, get().activeMageIds, get().boost.dpsMultiplier);
    set({ battle: { ...initialState.battle, totalDps: dps }, view: "home" });
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
    const { boost } = get();
    const newCount = boost.adWatchedCount + 1;
    let newMultiplier = boost.dpsMultiplier;
    let expiresAt = boost.boostExpiresAt;
    if (newCount >= 10 && boost.dpsMultiplier < 1.2) {
      newMultiplier = 1.2;
      expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    }
    const dps = calcTotalDps(get().ownedMages, get().activeMageIds, newMultiplier);
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

  init: () => {
    const { boost, ownedMages, activeMageIds } = get();
    let dpsMultiplier = boost.dpsMultiplier;
    if (boost.boostExpiresAt && Date.now() > boost.boostExpiresAt) {
      dpsMultiplier = 1.0;
      set({ boost: { ...boost, dpsMultiplier: 1.0, boostExpiresAt: null, adWatchedCount: 0 } });
    }
    const dps = calcTotalDps(ownedMages, activeMageIds, dpsMultiplier);
    set({ view: "home", battle: { ...get().battle, totalDps: dps } });
  },
}));
