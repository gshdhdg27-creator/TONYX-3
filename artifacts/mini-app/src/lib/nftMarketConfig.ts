/** Shared NFT Market admin config — stored in localStorage until API is wired */

export type NftMarketConfig = {
  /** Master switch: hide all listings when false */
  enabled: boolean;
  /** Allow users to press Buy */
  buyEnabled: boolean;
  /** Markup on Portals floor, e.g. 5 = +5% */
  markupPercent: number;
  /** short_name → custom TON price (overrides floor+markup) */
  priceOverrides: Record<string, number>;
  /** short_name set to hide from market */
  hidden: string[];
  /** short_name pinned to top */
  featured: string[];
  /** Only show these (empty = all except hidden) */
  whitelist: string[];
  /** Optional stock per short_name (0 = sold out, undefined = unlimited) */
  stock: Record<string, number>;
  /** Banner text under title */
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
  bannerText: "Реальные цены Portals / Getgems",
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
