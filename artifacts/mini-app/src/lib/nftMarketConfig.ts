/** NFT Market config: server switches (enabled/buyEnabled) + local catalog prefs */

export type NftMarketConfig = {
  /** Master switch from server */
  enabled: boolean;
  /** Allow users to press Buy — from server */
  buyEnabled: boolean;
  markupPercent: number;
  priceOverrides: Record<string, number>;
  hidden: string[];
  featured: string[];
  whitelist: string[];
  stock: Record<string, number>;
  bannerText: string;
  updatedAt: string;
};

export const NFT_MARKET_CFG_KEY = "tonyx-nft-market-cfg-v1";

export const defaultNftMarketConfig = (): NftMarketConfig => ({
  enabled: true,
  buyEnabled: false,
  markupPercent: 0,
  priceOverrides: {},
  hidden: [],
  featured: [],
  whitelist: [],
  stock: {},
  bannerText: "\u0420\u0435\u0430\u043b\u044c\u043d\u044b\u0435 \u0446\u0435\u043d\u044b Portals / Getgems",
  updatedAt: new Date().toISOString(),
});

export function loadNftMarketConfig(): NftMarketConfig {
  try {
    const raw = localStorage.getItem(NFT_MARKET_CFG_KEY);
    if (!raw) return defaultNftMarketConfig();
    const parsed = JSON.parse(raw) as Partial<NftMarketConfig>;
    return { ...defaultNftMarketConfig(), ...parsed };
  } catch {
    return defaultNftMarketConfig();
  }
}

export function saveNftMarketConfig(cfg: NftMarketConfig): void {
  const next = { ...cfg, updatedAt: new Date().toISOString() };
  localStorage.setItem(NFT_MARKET_CFG_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("tonyx-nft-cfg"));
}

/** Pull enabled/buyEnabled from API and merge into local config + notify listeners */
export async function syncNftMarketConfigFromServer(): Promise<NftMarketConfig> {
  const local = loadNftMarketConfig();
  try {
    const r = await fetch("/api/mini/admin/settings/nft-market", { cache: "no-store" });
    if (!r.ok) return local;
    const d = (await r.json()) as {
      enabled?: boolean;
      buyEnabled?: boolean;
      feePercent?: number;
    };
    const next: NftMarketConfig = {
      ...local,
      enabled: d.enabled !== false,
      buyEnabled: Boolean(d.buyEnabled),
      updatedAt: new Date().toISOString(),
    };
    saveNftMarketConfig(next);
    return next;
  } catch {
    return local;
  }
}

export function effectivePrice(
  short: string,
  floor: number,
  cfg: NftMarketConfig,
): number {
  if (cfg.priceOverrides[short] != null && cfg.priceOverrides[short]! > 0) {
    return Number(cfg.priceOverrides[short]);
  }
  const base = floor > 0 ? floor : 0;
  const marked = base * (1 + (Number(cfg.markupPercent) || 0) / 100);
  return Math.round(marked * 1000) / 1000;
}

export function isGiftVisible(short: string, cfg: NftMarketConfig): boolean {
  if (!cfg.enabled) return false;
  if (cfg.hidden.includes(short)) return false;
  if (cfg.whitelist.length > 0 && !cfg.whitelist.includes(short)) return false;
  if (cfg.stock[short] === 0) return false;
  return true;
}
