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
  listed?: boolean;
  listPriceTon?: number | null;
};

export type InventoryResponse = {
  balances: { ton: number; tonyx: number };
  collections: InventoryCollection[];
  inventory: InventoryItem[];
  listed?: InventoryItem[];
};

export type MarketListing = {
  id: number;
  sellerId: string;
  nftId: string;
  nameRu: string;
  nameEn: string;
  imageUrl: string | null;
  rarity: string | null;
  priceTon: number;
  listedAt: string;
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

/** Notify all mounted inventory UIs to refresh */
export function notifyInventoryUpdated() {
  try {
    window.dispatchEvent(new CustomEvent("tonyx-inventory-updated"));
  } catch {
    /* ignore */
  }
}

export const inventoryApi = {
  get: () => api<InventoryResponse>("/api/mini/inventory"),
  claim: (nftId: string) =>
    api<{
      ok: boolean;
      nftId: string;
      valueTon: number;
      nameRu: string;
      item?: InventoryItem | null;
      inventory?: InventoryItem[];
      collections?: InventoryCollection[];
    }>("/api/mini/inventory/claim", {
      method: "POST",
      body: JSON.stringify({ nftId }),
    }),
  list: (inventoryId: number, priceTon: number) =>
    api<{ ok: boolean; inventoryId: number; priceTon: number; nftId: string }>(
      "/api/mini/inventory/list",
      { method: "POST", body: JSON.stringify({ inventoryId, priceTon }) },
    ),
  unlist: (inventoryId: number) =>
    api<{ ok: boolean }>("/api/mini/inventory/unlist", {
      method: "POST",
      body: JSON.stringify({ inventoryId }),
    }),
  listings: () => api<{ listings: MarketListing[] }>("/api/mini/inventory/listings"),
  buy: (inventoryId: number) =>
    api<{
      ok: boolean;
      nftId: string;
      paidTon: number;
      feeTon: number;
      sellerReceived: number;
      balances: { ton: number; tonyx: number };
    }>("/api/mini/inventory/buy", {
      method: "POST",
      body: JSON.stringify({ inventoryId }),
    }),
  sell: (inventoryId: number, priceTon?: number) =>
    api<{ ok: boolean; listed?: boolean; priceTon?: number; inventoryId?: number }>(
      "/api/mini/inventory/sell",
      { method: "POST", body: JSON.stringify({ inventoryId, priceTon }) },
    ),
};
