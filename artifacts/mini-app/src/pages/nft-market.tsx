import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useTelegram, haptic } from "@/lib/telegram";
import {
  loadNftMarketConfig,
  syncNftMarketConfigFromServer,
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
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<CatTab>("all");
  const [sort, setSort] = useState<Sort>("price_asc");
  const [selected, setSelected] = useState<GiftRow | null>(null);
  const [buying, setBuying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [fModels, setFModels] = useState<string[]>([]);
  const [fBg, setFBg] = useState<string[]>([]);
  const [fSymbol, setFSymbol] = useState<string[]>([]);
  const [attrCache, setAttrCache] = useState<Record<string, ModelsPack>>({});
  const [attrLoading, setAttrLoading] = useState(false);
  const [attrPack, setAttrPack] = useState<ModelsPack | null>(null);

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
      const next = await syncNftMarketConfigFromServer();
      if (!cancelled) setCfg(next);
    })();
    return () => { cancelled = true; };
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
              name: g.full_name || g.short_name,
              short: g.short_name,
              floor,
              price: floor,
              getgems: Number(g.getgems_price_ton) || 0,
              tgmrkt: Number(g.tgmrkt_price_ton) || 0,
              id: String(g.regular_id || g.short_name),
            };
          })
          .filter((g) => g.short);
        if (!cancelled) setGifts(rows);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const priced = useMemo(() => {
    return gifts.map((g) => ({ ...g, price: effectivePrice(g.short, g.floor, cfg) }));
  }, [gifts, cfg]);

  const listings = useMemo(() => {
    let list = priced.filter((g) => isGiftVisible(g.short, cfg));
    const q = search.toLowerCase().trim();
    if (q) list = list.filter((g) => g.name.toLowerCase().includes(q) || g.short.includes(q));
    if (sort === "price_asc") list = [...list].sort((a, b) => a.price - b.price);
    else if (sort === "price_desc") list = [...list].sort((a, b) => b.price - a.price);
    else list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [priced, cfg, search, sort]);

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
    const invId = (selected as { inventoryId?: number }).inventoryId;
    if (!invId) {
      flash("Это витрина цен. Покупай лоты игроков из инвентаря/маркета");
      return;
    }
    setBuying(true);
    try {
      const res = await fetch("/api/mini/inventory/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventoryId: invId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error || `HTTP ${res.status}`);
      setSelected(null);
      flash("Куплено ✓");
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e));
    } finally {
      setBuying(false);
    }
  };

  const cycleSort = () => {
    setSort((s) => (s === "price_asc" ? "price_desc" : s === "price_desc" ? "name" : "price_asc"));
  };

  if (!cfg.enabled) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>NFT Market закрыт</div>
        <div style={{ fontSize: 13 }}>Админ временно отключил маркет</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100%", background: "#0b1220", color: "#e2e8f0", paddingBottom: 100 }}>
      <div style={{ padding: "12px 14px 0" }}>
        <div style={{ fontSize: 20, fontWeight: 900 }}>NFT Market</div>
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{cfg.bannerText}</div>
        {!cfg.buyEnabled && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#fbbf24" }}>Покупка отключена админом</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, padding: "12px 14px" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск…"
          style={{
            flex: 1, padding: "10px 12px", borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.35)",
            color: "#e2e8f0", fontSize: 13, fontFamily: "inherit",
          }}
        />
        <button type="button" onClick={cycleSort} style={{
          padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.06)", color: "#cbd5e1", fontWeight: 700, fontSize: 12,
          cursor: "pointer", fontFamily: "inherit",
        }}>
          {sort === "price_asc" ? "↑ Цена" : sort === "price_desc" ? "↓ Цена" : "A–Z"}
        </button>
      </div>

      {loading && <div style={{ padding: 24, color: "#9ca3af", textAlign: "center" }}>Загрузка…</div>}
      {loadError && <div style={{ padding: 24, color: "#f87171", textAlign: "center" }}>{loadError}</div>}

      {!loading && (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 12px 24px",
        }}>
          {listings.map((g, i) => (
            <button
              key={g.short}
              type="button"
              onClick={() => { haptic("light"); setSelected(g); }}
              style={{
                textAlign: "left", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16,
                padding: 10, background: CARD_BG[i % CARD_BG.length], cursor: "pointer",
                fontFamily: "inherit", color: "#e2e8f0",
              }}
            >
              <img src={IMG(g.short)} alt="" style={{ width: "100%", height: 90, objectFit: "contain" }} loading="lazy" />
              <div style={{ fontSize: 12, fontWeight: 800, marginTop: 6 }}>{g.name}</div>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#7dd3fc", marginTop: 4 }}>{fmtPrice(g.price)} TON</div>
            </button>
          ))}
          {!listings.length && (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#6b7280", padding: 32 }}>Ничего не найдено</div>
          )}
        </div>
      )}

      {selected && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 50,
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{
              width: "100%", maxWidth: 480, background: "#0f172a", borderRadius: "20px 20px 0 0",
              padding: 16, border: "1px solid rgba(255,255,255,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <img src={IMG(selected.short)} alt="" style={{ width: 72, height: 72, objectFit: "contain" }} />
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{selected.name}</div>
                <div style={{ color: "#7dd3fc", fontWeight: 800, marginTop: 4 }}>{fmtPrice(selected.price)} TON</div>
              </div>
            </div>
            <button
              type="button"
              disabled={buying || !cfg.buyEnabled}
              onClick={() => void handleBuy()}
              style={{
                width: "100%", marginTop: 14, padding: 14, borderRadius: 14, border: "none",
                background: cfg.buyEnabled ? "linear-gradient(135deg,#0369a1,#38bdf8)" : "rgba(100,116,139,0.4)",
                color: "#fff", fontWeight: 800, fontSize: 14, cursor: cfg.buyEnabled ? "pointer" : "not-allowed",
                fontFamily: "inherit", opacity: buying ? 0.7 : 1,
              }}
            >
              {!cfg.buyEnabled ? "Покупка отключена" : buying ? "…" : `Купить · ${fmtPrice(selected.price)} TON`}
            </button>
            <button
              type="button"
              onClick={() => setSelected(null)}
              style={{
                width: "100%", marginTop: 8, padding: 12, borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)", background: "transparent",
                color: "#94a3b8", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: "fixed", left: 16, right: 16, bottom: 90, zIndex: 60,
          background: "rgba(15,23,42,0.95)", border: "1px solid rgba(56,189,248,0.35)",
          borderRadius: 12, padding: 12, textAlign: "center", fontWeight: 700, fontSize: 13,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
