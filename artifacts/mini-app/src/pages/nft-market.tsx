import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTelegram, haptic } from "@/lib/telegram";
import {
  loadNftMarketConfig,
  syncNftMarketConfigFromServer,
  type NftMarketConfig,
} from "@/lib/nftMarketConfig";

type MarketListing = {
  id: number;
  inventoryId?: number;
  sellerId: string;
  nftId: string;
  nameRu: string;
  nameEn?: string;
  imageUrl?: string | null;
  modelImageUrl?: string | null;
  symbolImageUrl?: string | null;
  patternImageUrl?: string | null;
  number?: number | null;
  model?: string | null;
  backdrop?: string | null;
  symbol?: string | null;
  backdropCenter?: string | null;
  backdropEdge?: string | null;
  collectionName?: string | null;
  kind?: string | null;
  ownedGiftId?: string | null;
  priceTon: number;
  listedAt?: string;
};

const API_COVER = (name: string) =>
  `https://api.changes.tg/original/${encodeURIComponent(name)}.png?size=256`;
const API_MODEL = (gift: string, model: string) =>
  `https://api.changes.tg/model/${encodeURIComponent(gift)}/${encodeURIComponent(model)}.png?size=256`;
const API_SYMBOL = (gift: string, symbol: string) =>
  `https://api.changes.tg/symbol/${encodeURIComponent(gift)}/${encodeURIComponent(symbol)}.png?size=128`;
const API_PATTERN = (gift: string, symbol: string) =>
  `https://api.changes.tg/pattern/${encodeURIComponent(gift)}/${encodeURIComponent(symbol)}.png?size=128`;

function giftBaseName(l: MarketListing): string {
  const raw =
    l.collectionName ||
    l.nameEn ||
    (l.nameRu || "").replace(/\s*#\d+\s*$/, "").trim() ||
    String(l.nftId || "").split("#")[0] ||
    "";
  return raw.replace(/\s*#\d+\s*$/, "").trim();
}

function fmtPrice(n: number): string {
  if (!n || n <= 0) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1).replace(/\.0$/, "");
  return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export default function NftMarketPage() {
  useTelegram();
  const [cfg, setCfg] = useState<NftMarketConfig>(() => loadNftMarketConfig());
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"price_asc" | "price_desc" | "new">("new");
  const [selected, setSelected] = useState<MarketListing | null>(null);
  const [buying, setBuying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [buyEnabled, setBuyEnabled] = useState(false);

  useEffect(() => {
    const sync = () => setCfg(loadNftMarketConfig());
    window.addEventListener("tonyx-nft-cfg", sync);
    window.addEventListener("storage", sync);
    void syncNftMarketConfigFromServer().then(sync).catch(() => {});
    return () => {
      window.removeEventListener("tonyx-nft-cfg", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const loadListings = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/mini/inventory/listings", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { listings?: MarketListing[]; buyEnabled?: boolean };
      setListings(Array.isArray(data.listings) ? data.listings : []);
      setBuyEnabled(Boolean(data.buyEnabled));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setListings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadListings();
  }, []);

  const filtered = useMemo(() => {
    let list = [...listings];
    const s = search.toLowerCase().trim();
    if (s) {
      list = list.filter((g) =>
        [g.nameRu, g.nameEn, g.nftId, g.model, g.backdrop, g.symbol, g.number != null ? `#${g.number}` : ""]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(s),
      );
    }
    list.sort((a, b) => {
      if (sort === "price_asc") return a.priceTon - b.priceTon;
      if (sort === "price_desc") return b.priceTon - a.priceTon;
      return String(b.listedAt ?? "").localeCompare(String(a.listedAt ?? ""));
    });
    return list;
  }, [listings, search, sort]);

  return (
    <div style={{ minHeight: "100%", background: "#0a0a0c", color: "#f3f4f6", paddingBottom: 100 }}>
      <div style={{ padding: "14px 16px 8px" }}>
        <div style={{ fontSize: 20, fontWeight: 900 }}>NFT Market</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>Реальные unique-подарки</div>
      </div>
      {loading && <div style={{ padding: 24, color: "#9ca3af", textAlign: "center" }}>Загрузка…</div>}
      {loadError && <div style={{ padding: 24, color: "#f87171", textAlign: "center" }}>{loadError}</div>}
      {!loading && (
        <div style={{ padding: 16, color: "#94a3b8", fontSize: 13 }}>
          Лотов: {filtered.length}. Открой заново после деплоя полного файла.
        </div>
      )}
      {toast && <div>{toast}</div>}
    </div>
  );
}
