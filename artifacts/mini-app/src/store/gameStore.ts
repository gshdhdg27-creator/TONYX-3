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
import { BOSSES } from "../constants/bosses";
import { MAGES, getMageDps } from "../constants/mages";
import { battleApi } from "../lib/battleApi";

let _gameDidInit = false;

const initialState: GameState = {
  view: "home",
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
  configVersion: 0,
};

/** Active boost multiplier (ad + TON + speed), matches server calcServerDps */
function getActiveBoostMult(boost: {
  dpsMultiplier: number;
  boostExpiresAt: number | null;
  tonBoostMultiplier: number;
  tonBoostExpiresAt: number | null;
  speedMultiplier: number;
}): number {
  const now = Date.now();
  let mult = 1;
  if (boost.boostExpiresAt && boost.boostExpiresAt > now) {
    mult *= boost.dpsMultiplier || 1;
  }
  if (boost.tonBoostExpiresAt && boost.tonBoostExpiresAt > now) {
    mult *= boost.tonBoostMultiplier || 1;
  }
  mult *= boost.speedMultiplier || 1;
  return mult;
}

function calcTotalDps(
  ownedMages: OwnedMage[],
  equippedSlots: (string | null)[],
  boostOrMult: number | {
    dpsMultiplier: number;
    boostExpiresAt: number | null;
    tonBoostMultiplier: number;
    tonBoostExpiresAt: number | null;
    speedMultiplier: number;
  },
): number {
  const equipped = equippedSlots
    .filter(Boolean)
    .map((id) => ownedMages.find((m) => m.id === id))
    .filter((m): m is OwnedMage => !!m);
  const raw = equipped.reduce((sum, m) => sum + getMageDps(m), 0);
  if (typeof boostOrMult === "number") {
    return raw * boostOrMult;
  }
  return raw * getActiveBoostMult(boostOrMult);
}

interface GameActions {
  setView: (view: ViewName) => void;
  selectBoss: (level: BossLevel) => void;
  toggleMage: (mageId: string) => void;
  upgradeMage: (mageId: string) => Promise<void>;
  startBattle: () => Promise<void>;
  tickBattle: (deltaMs: number) => void;
  finishBoss: () => void;
  finishBossAd: () => void;
  resetBattle: () => void;
  setBossAnimState: (state: BossAnimState) => void;
  claimChestRewards: () => Promise<void>;
  watchAd: () => Promise<void>;
  buySpeedBoost: () => void;
  buyDpsBoost: (multiplier: number, costTon: number, tier?: 1 | 2 | 3 | 4) => Promise<void>;
  init: () => void;
  syncFromServer: () => Promise<void>;
  clickSlot: (index: number) => void;
  equipMageToSlot: (mageId: string) => Promise<void>;
  buyMage: (mageId: string) => Promise<void>;
  setTonBalance: (ton: number) => void;
  setTonyxBalance: (tonyx: number) => void;
  markTonInitialized: () => void;
  reviveBossWithTon: (level: BossLevel) => Promise<void>;
  watchAdForRevive: (level: BossLevel) => Promise<void>;
  bumpConfigVersion: () => void;
}

interface GameStore extends GameState, GameActions {
  bossAnimState: BossAnimState;
  activeBattleId: number | null;
  isSyncing: boolean;
  lastError: string | null;
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      bossAnimState: "idle" as BossAnimState,
      activeBattleId: null,
      isSyncing: false,
      lastError: null,

      setView: (view) => set({ view }),

      selectBoss: (level) => {
        const { ownedMages, equippedSlots, boost, battle } = get();
        if (battle.active) {
          set({ selectedBossLevel: level });
          return;
        }
        const dps = calcTotalDps(ownedMages, equippedSlots, boost);
        set({ selectedBossLevel: level, battle: { ...initialState.battle, totalDps: dps } });
      },

      toggleMage: (_mageId) => {},

      upgradeMage: async (mageId) => {
        try {
          set({ lastError: null });
          const res = await battleApi.upgradeMage(mageId);
          const { ownedMages, equippedSlots, boost } = get();
          const updated = ownedMages.map((m) =>
            m.id === mageId ? { ...m, level: res.level } : m,
          );
          const dps = calcTotalDps(updated, equippedSlots, boost);
          set({
            ownedMages: updated,
            balances: { ...get().balances, tonyx: res.balances.tonyx },
            battle: { ...get().battle, totalDps: dps },
          });
        } catch (e) {
          set({ lastError: e instanceof Error ? e.message : "Upgrade failed" });
        }
      },

      startBattle: async () => {
        const { selectedBossLevel, battle } = get();
        if (battle.active) return;
        try {
          set({ lastError: null });
          const res = await battleApi.startBattle(selectedBossLevel);
          set({
            battle: {
              active: true,
              bossHpPercent: res.bossHpPercent ?? 100,
              heroHp: 100,
              totalDps: res.totalDps ?? get().battle.totalDps,
              lastRewards: null,
              battleStartedAt: Date.now(),
            },
            battleBossLevel: selectedBossLevel,
            activeBattleId: res.battleId ?? null,
            bossAnimState: "idle",
          });
        } catch (e) {
          set({ lastError: e instanceof Error ? e.message : "Start battle failed" });
        }
      },

      tickBattle: (deltaMs) => {
        const { battle, boost } = get();
        if (!battle.active || battle.totalDps <= 0) return;
        const dps = battle.totalDps;
        const damage = (dps * deltaMs) / 1000;
        const boss = BOSSES[get().battleBossLevel ?? get().selectedBossLevel];
        if (!boss) return;
        const hpLeft = (battle.bossHpPercent / 100) * boss.maxHp - damage;
        const pct = Math.max(0, (hpLeft / boss.maxHp) * 100);
        set({ battle: { ...battle, bossHpPercent: pct } });
      },

      finishBoss: () => {
        const { battle } = get();
        if (!battle.active) return;
        set({
          battle: { ...battle, active: false, lastRewards: battle.lastRewards },
          bossAnimState: "idle",
          view: "chest",
        });
      },

      finishBossAd: () => {},
      resetBattle: () => {
        set({
          battle: { ...initialState.battle, totalDps: get().battle.totalDps },
          battleBossLevel: null,
          activeBattleId: null,
          bossAnimState: "idle",
        });
      },
      setBossAnimState: (state) => set({ bossAnimState: state }),

      claimChestRewards: async () => {
        try {
          set({ lastError: null });
          const res = await battleApi.claimRewards();
          set({
            balances: res.balances
              ? { ton: res.balances.ton, tonyx: res.balances.tonyx }
              : get().balances,
            view: "home",
            battle: { ...initialState.battle, totalDps: get().battle.totalDps },
            battleBossLevel: null,
            activeBattleId: null,
          });
        } catch (e) {
          set({ lastError: e instanceof Error ? e.message : "Claim failed" });
        }
      },

      watchAd: async () => {
        try {
          set({ lastError: null });
          const res = await battleApi.watchAdBoost();
          set({
            boost: {
              ...get().boost,
              dpsMultiplier: res.dpsMultiplier ?? get().boost.dpsMultiplier,
              boostExpiresAt: res.boostExpiresAt ?? get().boost.boostExpiresAt,
              adWatchedCount: res.adWatchedCount ?? get().boost.adWatchedCount,
            },
          });
        } catch (e) {
          set({ lastError: e instanceof Error ? e.message : "Ad boost failed" });
        }
      },

      buySpeedBoost: () => {},

      buyDpsBoost: async (multiplier, costTon, tier) => {
        try {
          set({ lastError: null });
          const res = await battleApi.buyTonBoost(tier ?? 1);
          set({
            boost: {
              ...get().boost,
              tonBoostMultiplier: res.tonBoostMultiplier ?? multiplier,
              tonBoostExpiresAt: res.tonBoostExpiresAt ?? null,
            },
            balances: res.balances
              ? { ...get().balances, ton: res.balances.ton }
              : get().balances,
          });
        } catch (e) {
          set({ lastError: e instanceof Error ? e.message : "TON boost failed" });
        }
      },

      init: () => {
        if (_gameDidInit) {
          if (get().view === "loading") set({ view: "home" });
          return;
        }
        _gameDidInit = true;
        const { boost, ownedMages, equippedSlots } = get();
        let dpsMultiplier = boost.dpsMultiplier;
        let currentBoost = boost;
        if (boost.boostExpiresAt && Date.now() > boost.boostExpiresAt) {
          dpsMultiplier = 1.0;
          currentBoost = {
            ...boost,
            dpsMultiplier: 1.0,
            boostExpiresAt: null,
            adWatchedCount: 0,
          };
          set({ boost: currentBoost });
        }
        if (currentBoost.tonBoostExpiresAt && Date.now() > currentBoost.tonBoostExpiresAt) {
          currentBoost = {
            ...currentBoost,
            tonBoostMultiplier: 1.0,
            tonBoostExpiresAt: null,
          };
          set({ boost: currentBoost });
        }
        const dps = calcTotalDps(ownedMages, equippedSlots, { ...currentBoost, dpsMultiplier });
        set({ view: "home", battle: { ...get().battle, totalDps: dps } });
        void get().syncFromServer();
      },

      syncFromServer: async () => {
        try {
          set({ isSyncing: true, lastError: null });
          const data = await battleApi.getState();
          const ownedMages = data.ownedMages ?? get().ownedMages;
          const equippedSlots = data.equippedSlots ?? get().equippedSlots;
          const boost = data.boost ?? get().boost;
          const dps = calcTotalDps(ownedMages, equippedSlots, boost);
          set({
            ownedMages,
            equippedSlots,
            boost,
            balances: data.balances ?? get().balances,
            bossRespawnAt: data.bossRespawnAt ?? get().bossRespawnAt,
            reviveAdProgress: data.reviveAdProgress ?? get().reviveAdProgress,
            battle: { ...get().battle, totalDps: dps },
            hasInitializedTonFromBackend: true,
            isSyncing: false,
          });
        } catch (e) {
          set({
            isSyncing: false,
            lastError: e instanceof Error ? e.message : "Sync failed",
          });
        }
      },

      clickSlot: (index) => {
        set({ pendingSlotIndex: index });
        get().setView("hero-shop");
      },

      equipMageToSlot: async (mageId) => {
        const { pendingSlotIndex, equippedSlots, ownedMages, boost } = get();
        if (pendingSlotIndex === null) return;
        if (pendingSlotIndex < 0 || pendingSlotIndex > 4) return;
        if (!ownedMages.find((m) => m.id === mageId)) return;
        const newSlots = equippedSlots.map((id) =>
          id === mageId ? null : id,
        ) as (string | null)[];
        newSlots[pendingSlotIndex] = mageId;
        try {
          set({ lastError: null });
          await battleApi.setLoadout(newSlots);
          const dps = calcTotalDps(ownedMages, newSlots, boost);
          set({
            equippedSlots: newSlots,
            pendingSlotIndex: null,
            battle: { ...get().battle, totalDps: dps },
          });
          get().setView("home");
        } catch (e) {
          set({ lastError: e instanceof Error ? e.message : "Loadout failed" });
        }
      },

      buyMage: async (mageId) => {
        try {
          set({ lastError: null });
          const res = await battleApi.buyMage(mageId);
          const cfg = MAGES.find((m) => m.id === mageId);
          if (!cfg) return;
          const { ownedMages, equippedSlots, boost } = get();
          if (ownedMages.find((m) => m.id === mageId)) return;
          const newOwned = [...ownedMages, { ...cfg, level: res.level ?? 1 }];
          const dps = calcTotalDps(newOwned, equippedSlots, boost);
          set({
            ownedMages: newOwned,
            balances: { ...get().balances, ton: res.balances.ton },
            battle: { ...get().battle, totalDps: dps },
          });
        } catch (e) {
          set({ lastError: e instanceof Error ? e.message : "Buy failed" });
        }
      },

      setTonBalance: (ton) => set({ balances: { ...get().balances, ton } }),
      setTonyxBalance: (tonyx) => set({ balances: { ...get().balances, tonyx } }),
      markTonInitialized: () => set({ hasInitializedTonFromBackend: true }),

      reviveBossWithTon: async (level) => {
        try {
          set({ lastError: null });
          const res = await battleApi.revive(level, "ton");
          const newRespawnAt = { ...get().bossRespawnAt };
          delete newRespawnAt[level];
          set({
            balances: res.balances
              ? { ...get().balances, ton: res.balances.ton }
              : get().balances,
            bossRespawnAt: newRespawnAt,
          });
        } catch (e) {
          set({ lastError: e instanceof Error ? e.message : "Revive failed" });
        }
      },

      watchAdForRevive: async (level) => {
        try {
          set({ lastError: null });
          const res = await battleApi.revive(level, "ad");
          if (res.revived) {
            const newRespawnAt = { ...get().bossRespawnAt };
            delete newRespawnAt[level];
            const newProgress = { ...get().reviveAdProgress };
            delete newProgress[level];
            set({ bossRespawnAt: newRespawnAt, reviveAdProgress: newProgress });
          } else {
            set({
              reviveAdProgress: {
                ...get().reviveAdProgress,
                [level]: res.reviveAdsWatched ?? 0,
              },
            });
          }
        } catch (e) {
          set({ lastError: e instanceof Error ? e.message : "Revive ad failed" });
        }
      },

      bumpConfigVersion: () => set((s) => ({ configVersion: s.configVersion + 1 })),
    }),
    {
      name: "tonyx-game-state-v3",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedBossLevel: state.selectedBossLevel,
      }),
    },
  ),
);
