/** Server-authoritative battle API. All economy mutations go through here. */

export type ChestReward = {
  type: "ton" | "tonyx" | "nft_fragment" | "nft_full";
  amount?: number;
  nftId?: string;
  fragmentNftId?: string;
};

export type GameStateResponse = {
  balances: { ton: number; tonyx: number };
  ownedMages: { id: string; level: number }[];
  equippedSlots: (string | null)[];
  bossRespawnAt: Record<number, number | null>;
  reviveAdProgress: Record<number, number>;
  boost: {
    adWatchedCount: number;
    dpsMultiplier: number;
    boostExpiresAt: number | null;
    tonBoostMultiplier: number;
    tonBoostExpiresAt: number | null;
    speedMultiplier: number;
  };
  nftInventory: {
    fragments: Record<string, number>;
    assembled: string[];
  };
};

export type StartBattleResponse = {
  battleId: number;
  bossLevel: number;
  totalDps: number;
  bossMaxHp: number;
  startedAt: string;
};

export type ClaimBattleResponse = {
  rewards: ChestReward[];
  balances: { ton: number; tonyx: number };
  nftInventory: {
    fragments: Record<string, number>;
    assembled: string[];
  };
  bossRespawnAt: number;
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export const battleApi = {
  getGameState: () => api<GameStateResponse>("/api/mini/battle/game-state"),

  start: (bossLevel: number) =>
    api<StartBattleResponse>("/api/mini/battle/start", {
      method: "POST",
      body: JSON.stringify({ bossLevel }),
    }),

  claim: (battleId: number) =>
    api<ClaimBattleResponse>("/api/mini/battle/claim", {
      method: "POST",
      body: JSON.stringify({ battleId }),
    }),

  revive: (bossLevel: number, method: "ton" | "ad") =>
    api<{
      ok: boolean;
      method: string;
      balances?: { ton: number };
      bossRespawnAt: number | null;
      revived?: boolean;
      reviveAdsWatched?: number;
      adsRequired?: number;
    }>("/api/mini/battle/revive", {
      method: "POST",
      body: JSON.stringify({ bossLevel, method }),
    }),

  buyMage: (mageId: string) =>
    api<{ ok: boolean; mageId: string; level: number; balances: { ton: number } }>(
      "/api/mini/battle/mage/buy",
      {
        method: "POST",
        body: JSON.stringify({ mageId }),
      },
    ),

  upgradeMage: (mageId: string) =>
    api<{ ok: boolean; mageId: string; level: number; balances: { tonyx: number } }>(
      "/api/mini/battle/mage/upgrade",
      {
        method: "POST",
        body: JSON.stringify({ mageId }),
      },
    ),

  setLoadout: (equippedSlots: (string | null)[]) =>
    api<{ ok: boolean; equippedSlots: (string | null)[] }>("/api/mini/battle/loadout", {
      method: "POST",
      body: JSON.stringify({ equippedSlots }),
    }),
};
