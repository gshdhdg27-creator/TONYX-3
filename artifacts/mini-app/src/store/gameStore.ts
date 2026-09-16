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
  configVersion: 0,
};

function calcTotalDps(
  ownedMages: OwnedMage[],
  equippedSlots: (string | null)[],
  dpsMultiplier: number,
): number {
  const equipped = equippedSlots
    .filter(Boolean)
    .map((id) => ownedMages.find((m) => m.id === id))
    .filter((m): m is OwnedMage => !!m);
  const raw = equipped.reduce((sum, m) => sum + getMageDps(m), 0);
  return raw * dpsMultiplier;
}

interface GameActions {
  setView: (view: ViewName) => void;
  selectBoss: (level: BossLevel) => void;
  toggleMage: (mageId: string) => void;
  /** Server-authoritative upgrade */
  upgradeMage: (mageId: string) => Promise<void>;
  /** Server-authoritative start */
  startBattle: () => Promise<void>;
  /** Visual-only tick (does NOT grant rewards) */
  tickBattle: (deltaMs: number) => void;
  /** Go to chest screen when HP hits 0 (claim is separate) */
  finishBoss: () => void;
  finishBossAd: () => void;
  resetBattle: () => void;
  setBossAnimState: (state: BossAnimState) => void;
  /** Server-authoritative claim */
  claimChestRewards: () => Promise<void>;
  watchAd: () => Promise<void>;
  buySpeedBoost: () => void;
  buyDpsBoost: (multiplier: number, costTon: number) => void;
  init: () => void;
  /** Load authoritative state from server */
  syncFromServer: () => Promise<void>;
  clickSlot: (index: number) => void;
  equipMageToSlot: (mageId: string) => Promise<void>;
  /** Server-authoritative buy */
  buyMage: (mageId: string) => Promise<void>;
  setTonBalance: (ton: number) => void;
  setTonyxBalance: (tonyx: number) => void;
  markTonInitialized: () => void;
  /** Server-authoritative revive */
  reviveBossWithTon: (level: BossLevel) => Promise<void>;
  watchAdForRevive: (level: BossLevel) => Promise<void>;
  bumpConfigVersion: () => void;
}

interface GameStore extends GameState, GameActions {
  bossAnimState: BossAnimState;
  /** Server battle id for claim */
  activeBattleId: number | null;
  isSyncing: boolean;
  lastError: string | null;
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      bossAnimState: "idle",
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
        const dps = calcTotalDps(ownedMages, equippedSlots, boost.dpsMultiplier);
        set({ selectedBossLevel: level, battle: { ...initialState.battle, totalDps: dps } });
      },

      toggleMage: (_mageId) => {
        // No-op: slot system
      },

      upgradeMage: async (mageId) => {
        try {
          set({ lastError: null });
          const res = await battleApi.upgradeMage(mageId);
          const { ownedMages, equippedSlots, boost } = get();
          const updated = ownedMages.map((m) =>
            m.id === mageId ? { ...m, level: res.level } : m,
          );
          const dps = calcTotalDps(updated, equippedSlots, boost.dpsMultiplier);
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
        const { selectedBossLevel, equippedSlots } = get();
        if (!equippedSlots.some(Boolean)) return;

        try {
          set({ lastError: null });
          const res = await battleApi.start(selectedBossLevel);
          set({
            battleBossLevel: selectedBossLevel,
            activeBattleId: res.battleId,
            battle: {
              active: true,
              bossHpPercent: 100,
              heroHp: 100,
              totalDps: res.totalDps,
              lastRewards: null,
              battleStartedAt: Date.now(),
            },
          });
        } catch (e) {
          set({ lastError: e instanceof Error ? e.message : "Start battle failed" });
        }
      },

      tickBattle: (deltaMs) => {
        const { battle, battleBossLevel, boost } = get();
        if (!battle.active || !battleBossLevel) return;
        const boss = BOSSES[battleBossLevel];
        const dmgToBoss = battle.totalDps * (deltaMs / 1000) * boost.speedMultiplier;
        const dmgPercent = (dmgToBoss / boss.maxHp) * 100;
        const newBossHp = Math.max(0, battle.bossHpPercent - dmgPercent);
        if (newBossHp <= 0) {
          get().finishBoss();
          return;
        }
        set({ battle: { ...battle, bossHpPercent: newBossHp } });
      },

      finishBoss: () => {
        // Visual only — rewards come from server on claim
        set({
          battle: { ...get().battle, active: false, bossHpPercent: 0 },
          view: "chest",
          battleBossLevel: null,
        });
      },

      finishBossAd: () => {
        const { battle } = get();
        if (!battle.active || battle.bossHpPercent > 25) return;
        const newHp = Math.max(0, battle.bossHpPercent - 1);
        if (newHp <= 0) {
          get().finishBoss();
          return;
        }
        set({ battle: { ...battle, bossHpPercent: newHp } });
      },

      resetBattle: () => {
        const { ownedMages, equippedSlots, boost } = get();
        const dps = calcTotalDps(ownedMages, equippedSlots, boost.dpsMultiplier);
        set({
          battle: { ...initialState.battle, totalDps: dps, battleStartedAt: null },
          activeBattleId: null,
          view: "home",
        });
      },

      setBossAnimState: (state) => set({ bossAnimState: state }),

      claimChestRewards: async () => {
        const { activeBattleId } = get();
        if (!activeBattleId) {
          // Fallback: just go home if no server battle
          set({
            battle: { ...get().battle, lastRewards: null },
            view: "home",
          });
          return;
        }

        try {
          set({ lastError: null });
          const res = await battleApi.claim(activeBattleId);
          const level = get().selectedBossLevel;

          set({
            balances: res.balances,
            nftInventory: {
              fragments: {
                shadow_dogg: res.nftInventory.fragments.shadow_dogg ?? 0,
                flame_dogg: res.nftInventory.fragments.flame_dogg ?? 0,
                ice_dogg: res.nftInventory.fragments.ice_dogg ?? 0,
              },
              assembled: res.nftInventory.assembled as ("shadow_dogg" | "flame_dogg" | "ice_dogg")[],
            },
            bossRespawnAt: {
              ...get().bossRespawnAt,
              [level]: res.bossRespawnAt,
            },
            battle: {
              ...get().battle,
              lastRewards: res.rewards as ChestReward[],
              active: false,
            },
            activeBattleId: null,
            view: "home",
          });
        } catch (e) {
          set({ lastError: e instanceof Error ? e.message : "Claim failed" });
        }
      },

      watchAd: async () => {
        // Keep local visual progress for now; server ad-boost endpoint can be added later
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
          boost: {
            ...boost,
            adWatchedCount: newCount,
            dpsMultiplier: newMultiplier,
            boostExpiresAt: expiresAt,
          },
          battle: { ...get().battle, totalDps: dps },
        });
      },

      buySpeedBoost: () => {
        // TODO: server endpoint later
      },

      buyDpsBoost: (_multiplier, _costTon) => {
        // TODO: server endpoint later
      },

      syncFromServer: async () => {
        try {
          set({ isSyncing: true, lastError: null });
          const data = await battleApi.getGameState();

          const ownedMages: OwnedMage[] = data.ownedMages.map((m) => {
            const cfg = MAGES.find((c) => c.id === m.id);
            return {
              ...(cfg ?? {
                id: m.id,
                name: m.id,
                type: "wind" as const,
                rarity: "rare" as const,
                atk: 1,
                interval: 4,
                dps: 0.25,
                priceTon: 0,
                image: "",
                baseDps: 10,
                upgradeCost: 0,
                level: 1,
                emoji: "🌀",
                attackColor: "#34d399",
              }),
              level: m.level,
            };
          });

          const slots = data.equippedSlots as (string | null)[];
          const dpsMult = data.boost.dpsMultiplier;
          const dps = calcTotalDps(ownedMages, slots, dpsMult);

          const bossRespawnAt: Partial<Record<BossLevel, number>> = {};
          for (const [k, v] of Object.entries(data.bossRespawnAt)) {
            if (v != null) bossRespawnAt[Number(k) as BossLevel] = v;
          }

          set({
            balances: data.balances,
            ownedMages,
            equippedSlots: slots,
            bossRespawnAt,
            reviveAdProgress: data.reviveAdProgress as Partial<Record<BossLevel, number>>,
            boost: {
              adWatchedCount: data.boost.adWatchedCount,
              dpsMultiplier: data.boost.dpsMultiplier,
              boostExpiresAt: data.boost.boostExpiresAt,
              speedMultiplier: data.boost.speedMultiplier,
              tonBoostMultiplier: data.boost.tonBoostMultiplier,
              tonBoostExpiresAt: data.boost.tonBoostExpiresAt,
            },
            nftInventory: {
              fragments: {
                shadow_dogg: data.nftInventory.fragments.shadow_dogg ?? 0,
                flame_dogg: data.nftInventory.fragments.flame_dogg ?? 0,
                ice_dogg: data.nftInventory.fragments.ice_dogg ?? 0,
              },
              assembled: data.nftInventory.assembled as ("shadow_dogg" | "flame_dogg" | "ice_dogg")[],
            },
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

      init: () => {
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

        const dps = calcTotalDps(ownedMages, equippedSlots, dpsMultiplier);
        set({ view: "home", battle: { ...get().battle, totalDps: dps } });

        // Pull server truth
        void get().syncFromServer();
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
          const dps = calcTotalDps(ownedMages, newSlots, boost.dpsMultiplier);
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

          const newOwned = [...ownedMages, { ...cfg, level: res.level }];
          const dps = calcTotalDps(newOwned, equippedSlots, boost.dpsMultiplier);
          set({
            ownedMages: newOwned,
            balances: { ...get().balances, ton: res.balances.ton },
            battle: { ...get().battle, totalDps: dps },
          });
        } catch (e) {
          set({ lastError: e instanceof Error ? e.message : "Buy failed" });
        }
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
      // Persist only UI prefs; economy comes from server
      partialize: (state) => ({
        selectedBossLevel: state.selectedBossLevel,
      }),
    },
  ),
);
