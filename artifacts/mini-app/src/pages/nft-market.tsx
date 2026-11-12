import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useTelegram, haptic } from "@/lib/telegram";
import {
  loadNftMarketConfig,
  effectivePrice,
  isGiftVisible,
  type NftMarketConfig,
} from "@/lib/nftMarketConfig";

const PRICES_URL = "https://cdn.jsdelivr.net/gh/ssamy2/TelegramGiftsAssests@main/Gifts_Details.json";
const MODELS_URL = (s: string) => `https://cdn.jsdelivr.net/gh/ssamy2/TelegramGiftsAssests@main/models/${s}/prices.json`;
const IMG = (s: string) => `https://cdn.jsdelivr.net/gh/ssamy2/TG_Photos@main/webp/by_name/${s}.webp`;

type GiftRow = { name: string; short: string; price: number; floor: number; getgems: number; tgmrkt: number; id: string };
type PriceSource = {
  full_name: string; short_name: string; regular_id?: string;
  floor_price_ton?: number; portal_price_ton?: number; getgems_price_ton?: number; tgmrkt_price_ton?: number;
};
type AttrMap = Record<string, number>;
type ModelsPack = { models: AttrMap; backdrops: AttrMap; symbols: AttrMap };
type CatTab = "all" | "collections" | "stars";
type Sort = "price_asc" | "price_desc" | "name";
type Sheet = null | "hub" | "collection" | "model" | "background" | "symbol";

function pickFloor(g: PriceSource): number {
  const c = [g.portal_price_ton, g.floor_price_ton, g.getgems_price_ton, g.tgmrkt_price_ton]
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  return c.length ? c[0] : 0;
}
function fmtPrice(n: number): string {
  if (!n || n <= 0) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1).replace(/\.0$/, "");
  return n.toFixed(2).replace(/0$/, "").replace(/\.$/, "");
}

const CARD_BG = [
  "linear-gradient(165deg,#3a2a5a 0%,#1a1830 100%)",
  "linear-gradient(165deg,#2a4a6a 0%,#122030 100%)",
  "linear-gradient(165deg,#2a5a3a 0%,#122818 100%)",
  "linear-gradient(165deg,#5a3a2a 0%,#281810 100%)",
  "linear-gradient(165deg,#2a3a5a 0%,#121c30 100%)",
  "linear-gradient(165deg,#4a2a4a 0%,#281028 100%)",
  "linear-gradient(165deg,#2a4a4a 0%,#122020 100%)",
  "linear-gradient(165deg,#4a2a3a 0%,#28121c 100%)",
];

export default function NftMarketPage() {
  useTelegram();
  const [cfg, setCfg] = useState<NftMarketConfig>(() => loadNftMarketConfig());
  const [gifts, setGifts] = useState<GiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cat, setCat] = useState<CatTab>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("price_asc");
  const [selected, setSelected] = useState<GiftRow | null>(null);
  const [buying, setBuying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [sheetQ, setSheetQ] = useState("");
  const [fCollections, setFCollections] = useState<string[]>([]);
  const [fModels, setFModels] = useState<string[]>([]);
  const [fBg, setFBg] = useState<string[]>([]);
  const [fSymbol, setFSymbol] = useState<string[]>([]);
  const [dCollections, setDCollections] = useState<string[]>([]);
  const [dModels, setDModels] = useState<string[]>([]);
  const [dBg, setDBg] = useState<string[]>([]);
  const [dSymbol, setDSymbol] = useState<string[]>([]);
  const [attrPack, setAttrPack] = useState<ModelsPack | null>(null);
  const [attrLoading, setAttrLoading] = useState(false);
  const [attrCache, setAttrCache] = useState<Record<string, ModelsPack>>({});
  const [starsQty, setStarsQty] = useState(100);

  useEffect(() => {
    const sync = () => setCfg(loadNftMarketConfig());
    window.addEventListener("tonyx-nft-cfg", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("tonyx-nft-cfg", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(PRICES_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { upgraded?: PriceSource[] };
        const rows: GiftRow[] = (data.upgraded ?? [])
          .map((g) => {
            const floor = pickFloor(g);
            return {
              name: g.full_name,
              short: g.short_name,
              price: floor,
              floor,
              getgems: Number(g.getgems_price_ton) || floor,
              tgmrkt: Number(g.tgmrkt_price_ton) || floor,
              id: String(g.regular_id ?? g.short_name),
            };
          })
          .filter((g) => g.short && g.floor > 0);
        if (!cancelled) setGifts(rows);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Ошибка загрузки цен");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const priced = useMemo(
    () =>
      gifts
        .filter((g) => isGiftVisible(g.short, cfg))
        .map((g) => ({ ...g, price: effectivePrice(g.short, g.floor, cfg) })),
    [gifts, cfg],
  );

  const collectionOptions = useMemo(
    () => [...priced].sort((a, b) => a.name.localeCompare(b.name)).map((g) => ({ name: g.name, short: g.short, price: g.price })),
    [priced],
  );

  const listings = useMemo(() => {
    let list = [...priced];
    if (fCollections.length) list = list.filter((g) => fCollections.includes(g.name));
    const hasAttr = fModels.length > 0 || fBg.length > 0 || fSymbol.length > 0;
    if (hasAttr) {
      list = list.filter((g) => {
        const pack = attrCache[g.short];
        if (!pack) return true;
        if (fModels.length && !fModels.some((m) => pack.models[m] != null)) return false;
        if (fBg.length && !fBg.some((b) => pack.backdrops[b] != null)) return false;
        if (fSymbol.length && !fSymbol.some((s) => pack.symbols[s] != null)) return false;
        return true;
      });
    }
    const q = search.toLowerCase().trim();
    if (q) {
      list = list.filter((g) => g.name.toLowerCase().includes(q) || g.short.includes(q) || g.id.includes(q));
    }
    list.sort((a, b) => {
      const fa = cfg.featured.includes(a.short) ? 0 : 1;
      const fb = cfg.featured.includes(b.short) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      if (sort === "price_asc") return a.price - b.price;
      if (sort === "price_desc") return b.price - a.price;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [priced, search, sort, cfg.featured, fCollections, fModels, fBg, fSymbol, attrCache]);

  const collectionRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    return [...priced]
      .sort((a, b) => b.price - a.price)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.short.includes(q));
  }, [priced, search]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const handleBuy = async () => {
    if (!selected) return;
    haptic("medium");
    if (!cfg.buyEnabled) {
      flash("Покупка временно отключена админом");
      return;
    }
    setBuying(true);
    await new Promise((r) => setTimeout(r, 700));
    setBuying(false);
    setSelected(null);
    flash("Скоро: покупка NFT будет доступна");
  };

  const cycleSort = () => {
    setSort((s) => (s === "price_asc" ? "price_desc" : s === "price_desc" ? "name" : "price_asc"));
  };

  // CONTINUED_IN_NEXT - incomplete
  return <div style={{ padding: 24, color: "#fff" }}>Loading market…</div>;
}
