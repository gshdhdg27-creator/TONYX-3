export type InventoryCollection = {
  id: string;
  nameRu: string;
  nameEn: string;
  valueTon: number;
  rarity: string;
  imageUrl: string | null;
  pieces: number[];
  owned: number;
  total: number;
  canClaim: boolean;
  claimedTimes: number;
};

export type InventoryItem = {
  id: number;
  itemType: string;
  itemId: string;
  quantity: number;
  acquiredAt: string;
  nameRu: string;
  nameEn: string;
  valueTon: number;
  imageUrl: string | null;
  rarity: string | null;
};

export type InventoryResponse = {
  balances: { ton: number; tonyx: number };
  collections: InventoryCollection[];
  inventory: InventoryItem[];
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
    throw new Error((data as { error?: string })?.error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

export const inventoryApi = {
  get: () => api<InventoryResponse>("/api/mini/inventory"),
  claim: (nftId: string) =>
    api<{ ok: boolean; nftId: string; valueTon: number; nameRu: string }>(
      "/api/mini/inventory/claim",
      { method: "POST", body: JSON.stringify({ nftId }) },
    ),
  sell: (inventoryId: number) =>
    api<{ ok: boolean; sold: string; receivedTon: number; balances: { ton: number; tonyx: number } }>(
      "/api/mini/inventory/sell",
      { method: "POST", body: JSON.stringify({ inventoryId }) },
    ),
};
