import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTelegram, haptic } from "@/lib/telegram";
import {
  loadNftMarketConfig,
  effectivePrice,
  isGiftVisible,
  type NftMarketConfig,
} from "@/lib/nftMarketConfig";

const PRICES_URL = "https://cdn.jsdelivr.net/gh/ssamy2/TelegramGiftsAssests@main/Gifts_Details.json";
const IMG = (s: string) => `https://cdn.jsdelivr.net/gh/ssamy2/TG_Photos@main/webp/by_name/${s}.webp`;

type GiftRow = { name: string; short: string; price: number; floor: number; getgems: number; tgmrkt: number; id: string };
type PriceSource = {
  full_name: string; short_name: string; regular_id?: string;
  floor_price_ton?: number; portal_price_ton?: number; getgems_price_ton?: number; tgmrkt_price_ton?: number;
};

function pickFloor(g: PriceSource): number {
  const c = [g.portal_price_ton, g.floor_price_ton, g.getgems_price_ton, g.tgmrkt_price_ton]
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  return c.length ? c[0] : 0;
}
function fmtPrice(n: number): string {
  if (!n || n <= 0) return "—";
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1).replace(/\.0$/, "");
  return n.toFixed(2).replace(/0$/, "").replace(/\.$/, "");
}

const CARD_BG = [
  "linear-gradient(165deg,#3a2a5a 0%,#1a1830 100%)",
  "linear-gradient(165deg,#2a4a6a 0%,#122030 100%)",
  "linear-gradient(165deg,#2a5a3a 0%,#122818 100%)",
  "linear-gradient(165deg,#5a3a2a 0%,#281810 100%)",
];

export default function NftMarketPage() {
  useTelegram();
  const [cfg, setCfg] = useState<NftMarketConfig>(() => loadNftMarketConfig());
  const [gifts, setGifts] = useState<GiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"price_asc" | "price_desc" | "name">("price_asc");
  const [selected, setSelected] = useState<GiftRow | null>(null);
  const [buying, setBuying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Ошибка загрузки");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const listings = useMemo(() => {
    let list = gifts
      .filter((g) => isGiftVisible(g.short, cfg))
      .map((g) => ({ ...g, price: effectivePrice(g.short, g.floor, cfg) }));
    const q = search.toLowerCase().trim();
    if (q) list = list.filter((g) => g.name.toLowerCase().includes(q) || g.short.includes(q) || g.id.includes(q));
    list.sort((a, b) => {
      if (sort === "price_asc") return a.price - b.price;
      if (sort === "price_desc") return b.price - a.price;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [gifts, cfg, search, sort]);

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
    await new Promise((r) => setTimeout(r, 500));
    setBuying(false);
    setSelected(null);
    flash("Скоро: покупка NFT будет доступна");
  };

  return (
    <div style={page}>
      {toast && <div style={toastStyle}>{toast}</div>}
      <div style={{ padding: "12px 14px 8px", fontSize: 18, fontWeight: 800 }}>NFT Market</div>
      <div style={{ padding: "0 14px 10px" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ID or name"
          style={searchInput}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {(["price_asc", "price_desc", "name"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setSort(s)} style={{
              ...chip, borderColor: sort === s ? "rgba(0,152,234,0.5)" : "rgba(255,255,255,0.08)",
              color: sort === s ? "#7dd3fc" : "#9ca3af",
            }}>
              {s === "price_asc" ? "Цена ↑" : s === "price_desc" ? "Цена ↓" : "Имя"}
            </button>
          ))}
        </div>
      </div>
      {loading && <div style={{ padding: 24, color: "#9ca3af", textAlign: "center" }}>Загрузка…</div>}
      {loadError && <div style={{ padding: 24, color: "#f87171", textAlign: "center" }}>{loadError}</div>}
      {!loading && !cfg.enabled && (
        <div style={{ padding: 24, color: "#9ca3af", textAlign: "center" }}>Маркет отключён админом</div>
      )}
      {!loading && cfg.enabled && (
        <div style={grid}>
          {listings.map((g, i) => (
            <button
              key={g.short}
              type="button"
              onClick={() => { haptic("light"); setSelected(g); }}
              style={{ ...card, background: CARD_BG[i % CARD_BG.length] }}
            >
              <img src={IMG(g.short)} alt="" style={cardImg} />
              <div style={cardName}>{g.name}</div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>#{String(g.id).slice(-5)}</div>
              <div style={pricePill}>{fmtPrice(g.price)} TON</div>
            </button>
          ))}
          {!listings.length && (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#6b7280", padding: 32 }}>Ничего не найдено</div>
          )}
        </div>
      )}
      {selected && (
        <div style={overlay} onClick={() => setSelected(null)}>
          <div style={sheetBox} onClick={(e) => e.stopPropagation()}>
            <div style={{ textAlign: "center" }}>
              <img src={IMG(selected.short)} alt="" style={{ width: 120, height: 120, objectFit: "contain" }} />
              <div style={{ marginTop: 8, fontWeight: 800, fontSize: 16 }}>{selected.name}</div>
              <div style={{ color: "#9ca3af", fontSize: 12 }}>#{String(selected.id).slice(-6)}</div>
            </div>
            <div style={{ margin: "12px 0", fontSize: 13 }}>
              <div style={row}><span style={{ color: "#9ca3af" }}>Floor</span><span>{fmtPrice(selected.floor)} TON</span></div>
              <div style={row}><span style={{ color: "#9ca3af" }}>Getgems</span><span>{fmtPrice(selected.getgems)} TON</span></div>
              <div style={row}><span style={{ color: "#9ca3af" }}>Цена</span><span style={{ fontWeight: 800 }}>{fmtPrice(selected.price)} TON</span></div>
            </div>
            <button
              type="button"
              disabled={buying || !cfg.buyEnabled}
              onClick={() => void handleBuy()}
              style={{ ...btnBlue, opacity: buying || !cfg.buyEnabled ? 0.55 : 1 }}
            >
              {!cfg.buyEnabled ? "Покупка отключена" : buying ? "…" : `Купить · ${fmtPrice(selected.price)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const page: CSSProperties = { minHeight: "100%", background: "#0b0b0d", color: "#fff", fontFamily: "inherit", paddingBottom: 100 };
const searchInput: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 14, fontFamily: "inherit" };
const chip: CSSProperties = { padding: "8px 12px", borderRadius: 999, border: "1px solid", background: "rgba(255,255,255,0.04)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 12px 24px" };
const card: CSSProperties = { border: "none", borderRadius: 16, padding: "12px 10px 14px", color: "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "center" };
const cardImg: CSSProperties = { width: "100%", height: 110, objectFit: "contain", display: "block" };
const cardName: CSSProperties = { fontSize: 13, fontWeight: 700, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const pricePill: CSSProperties = { display: "inline-block", padding: "5px 12px", borderRadius: 999, background: "#0098EA", color: "#fff", fontSize: 12, fontWeight: 800 };
const overlay: CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" };
const sheetBox: CSSProperties = { width: "100%", maxWidth: 480, background: "#121214", borderRadius: "22px 22px 0 0", padding: "16px 16px 28px", border: "1px solid rgba(255,255,255,0.06)", borderBottom: "none" };
const row: CSSProperties = { display: "flex", justifyContent: "space-between", padding: "6px 0" };
const btnBlue: CSSProperties = { width: "100%", padding: "14px 0", borderRadius: 14, border: "none", background: "#0098EA", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };
const toastStyle: CSSProperties = { position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 400, background: "rgba(15,23,42,0.95)", border: "1px solid rgba(56,189,248,0.4)", color: "#e2e8f0", padding: "10px 16px", borderRadius: 12, fontSize: 13, fontWeight: 700 };
