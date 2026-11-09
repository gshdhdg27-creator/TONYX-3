/**
 * In-memory cache for heavy section data.
 * Prefetched at app start so section switches are instant.
 */
import { inventoryApi, type InventoryResponse } from "@/lib/inventoryApi";
import { casesApi, type CasesListResponse } from "@/lib/casesApi";

export type MarketOrdersCache = {
  all: unknown[];
  stats: { inOrdersTon: number; volume24h: number; avgProfit: number; openCount: number } | null;
};

type CacheShape = {
  inventory: InventoryResponse | null;
  cases: CasesListResponse | null;
  marketOrders: unknown[] | null;
  marketStats: MarketOrdersCache["stats"];
  inventoryAt: number;
  casesAt: number;
  marketAt: number;
};

const cache: CacheShape = {
  inventory: null,
  cases: null,
  marketOrders: null,
  marketStats: null,
  inventoryAt: 0,
  casesAt: 0,
  marketAt: 0,
};

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => {
    try { fn(); } catch { /* ignore */ }
  });
}

export function subscribeDataCache(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getInventoryCache() {
  return cache.inventory;
}

export function getCasesCache() {
  return cache.cases;
}

export function getMarketOrdersCache() {
  return cache.marketOrders;
}

export function getMarketStatsCache() {
  return cache.marketStats;
}

export function setInventoryCache(data: InventoryResponse) {
  cache.inventory = data;
  cache.inventoryAt = Date.now();
  notify();
}

export function setCasesCache(data: CasesListResponse) {
  cache.cases = data;
  cache.casesAt = Date.now();
  notify();
}

export function setMarketCache(orders: unknown[], stats?: MarketOrdersCache["stats"]) {
  cache.marketOrders = orders;
  if (stats) cache.marketStats = stats;
  cache.marketAt = Date.now();
  notify();
}

/** Known NFT photo ids for image preloading */
const NFT_PHOTO_IDS = [
  "hypno_lollipop", "liberty_figure", "bday_candle", "moon_pendant",
  "input_key", "snoop_cigar", "snoop_dogg", "electric_skull",
  "neko_helmet", "heroic_helmet",
];

const TG_PHOTOS = "https://raw.githubusercontent.com/ssamy2/TG_Photos/main/webp/by_name/";

function preloadImages(urls: string[]) {
  for (const url of urls) {
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
    } catch { /* ignore */ }
  }
}

let prefetchPromise: Promise<void> | null = null;

/** Prefetch all section data once. Safe to call multiple times. */
export function prefetchAllSectionData(): Promise<void> {
  if (prefetchPromise) return prefetchPromise;
  prefetchPromise = (async () => {
    const tasks: Promise<void>[] = [];

    tasks.push(
      inventoryApi.get()
        .then((d) => {
          setInventoryCache(d);
          const urls: string[] = [];
          for (const c of d.collections ?? []) {
            if (c.imageUrl) urls.push(c.imageUrl);
          }
          for (const id of NFT_PHOTO_IDS) {
            urls.push(`${TG_PHOTOS}${id}.webp`);
          }
          for (const item of d.inventory ?? []) {
            if (item.imageUrl) urls.push(item.imageUrl);
          }
          preloadImages(urls);
        })
        .catch(() => { /* keep previous cache */ }),
    );

    tasks.push(
      casesApi.list()
        .then((d) => {
          setCasesCache(d);
          const urls: string[] = [];
          for (const c of d.cases ?? []) {
            if (c.imageUrl) urls.push(c.imageUrl);
            urls.push(`/cases/${c.id}.jpg`);
          }
          preloadImages(urls);
        })
        .catch(() => { /* ignore */ }),
    );

    tasks.push(
      fetch("/api/mini/market/orders")
        .then(async (r) => {
          if (!r.ok) return;
          const d = await r.json();
          setMarketCache(d.orders ?? []);
        })
        .catch(() => { /* ignore */ }),
    );

    tasks.push(
      fetch("/api/mini/market/stats")
        .then(async (r) => {
          if (!r.ok) return;
          const d = await r.json();
          cache.marketStats = d;
          cache.marketAt = Date.now();
          notify();
        })
        .catch(() => { /* ignore */ }),
    );

    preloadImages([
      "/cases/boss_1.jpg", "/cases/boss_2.jpg", "/cases/boss_3.jpg",
      "/cases/boss_4.jpg", "/cases/boss_5.jpg",
    ]);

    await Promise.allSettled(tasks);
  })();
  return prefetchPromise;
}

export function refreshInventoryInBackground() {
  return inventoryApi.get()
    .then((d) => setInventoryCache(d))
    .catch(() => { /* ignore */ });
}

export function refreshCasesInBackground() {
  return casesApi.list()
    .then((d) => setCasesCache(d))
    .catch(() => { /* ignore */ });
}
