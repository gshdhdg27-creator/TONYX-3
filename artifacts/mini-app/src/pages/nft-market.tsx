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
  const [sheetQ, setSheetQ] = useState("");
  const [fCollections, setFCollections] = useState<string[]>([]);
  const [fModels, setFModels] = useState<string[]>([]);
  const [fBg, setFBg] = useState<string[]>([]);
  const [fSymbol, setFSymbol] = useState<string[]>([]);
  const [dCollections, setDCollections] = useState<string[]>([]);
  const [dModels, setDModels] = useState<string[]>([]);
  const [dBg, setDBg] = useState<string[]>([]);
  const [dSymbol, setDSymbol] = useState<string[]>([]);
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
      try {
        const next = await syncNftMarketConfigFromServer();
        if (!cancelled) setCfg(next);
      } catch { /* ignore */ }
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
          .filter((g) => g.short && g.floor > 0);
        if (!cancelled) setGifts(rows);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const priced = useMemo(() => gifts.map((g) => ({ ...g, price: effectivePrice(g.short, g.floor, cfg) })), [gifts, cfg]);

  const collectionOptions = useMemo(() => {
    const map = new Map<string, { name: string; short: string; min: number }>();
    for (const g of priced) {
      const prev = map.get(g.name);
      if (!prev || g.price < prev.min) map.set(g.name, { name: g.name, short: g.short, min: g.price });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [priced]);

  const listings = useMemo(() => {
    let list = priced.filter((g) => isGiftVisible(g.short, cfg));
    const q = search.toLowerCase().trim();
    if (q) list = list.filter((g) => g.name.toLowerCase().includes(q) || g.short.includes(q));
    if (fCollections.length) list = list.filter((g) => fCollections.includes(g.name));
    if (fModels.length || fBg.length || fSymbol.length) {
      list = list.filter((g) => {
        const pack = attrCache[g.short];
        if (!pack) return true;
        if (fModels.length && !fModels.some((m) => pack.models[m] != null)) return false;
        if (fBg.length && !fBg.some((m) => pack.backdrops[m] != null)) return false;
        if (fSymbol.length && !fSymbol.some((m) => pack.symbols[m] != null)) return false;
        return true;
      });
    }
    if (sort === "price_asc") list = [...list].sort((a, b) => a.price - b.price);
    else if (sort === "price_desc") list = [...list].sort((a, b) => b.price - a.price);
    else list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [priced, cfg, search, sort, fCollections, fModels, fBg, fSymbol, attrCache]);

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
    flash("Это витрина floor-цен Portals. Реальные лоты — через инвентарь.");
  };

  const cycleSort = () => {
    setSort((s) => (s === "price_asc" ? "price_desc" : s === "price_desc" ? "name" : "price_asc"));
  };

  const loadAttrs = async (shorts: string[]) => {
    setAttrLoading(true);
    try {
      const next = { ...attrCache };
      for (const s of shorts) {
        if (next[s]) continue;
        try {
          const res = await fetch(MODELS_URL(s), { cache: "force-cache" });
          if (!res.ok) continue;
          const j = (await res.json()) as ModelsPack;
          next[s] = {
            models: j.models || {},
            backdrops: j.backdrops || {},
            symbols: j.symbols || {},
          };
        } catch { /* skip */ }
      }
      setAttrCache(next);
      return next;
    } finally {
      setAttrLoading(false);
    }
  };

  const openSheet = async (s: Sheet) => {
    haptic("light");
    setSheetQ("");
    if (s === "hub" || s === null) {
      setSheet(s);
      return;
    }
    setSheet(s);
    if (s === "collection") return;
    const shorts = fCollections.length
      ? collectionOptions.filter((c) => fCollections.includes(c.name)).map((c) => c.short)
      : collectionOptions.slice(0, 12).map((c) => c.short);
    const cache = await loadAttrs(shorts);
    const merged: ModelsPack = { models: {}, backdrops: {}, symbols: {} };
    for (const sh of shorts) {
      const p = cache[sh];
      if (!p) continue;
      Object.assign(merged.models, p.models);
      Object.assign(merged.backdrops, p.backdrops);
      Object.assign(merged.symbols, p.symbols);
    }
    setAttrPack(merged);
    setDModels([...fModels]);
    setDBg([...fBg]);
    setDSymbol([...fSymbol]);
    setDCollections([...fCollections]);
  };

  const applySheet = () => {
    if (sheet === "collection") setFCollections([...dCollections]);
    if (sheet === "model") setFModels([...dModels]);
    if (sheet === "background") setFBg([...dBg]);
    if (sheet === "symbol") setFSymbol([...dSymbol]);
    setSheet(null);
  };

  const clearFilters = () => {
    setFCollections([]);
    setFModels([]);
    setFBg([]);
    setFSymbol([]);
    setDCollections([]);
    setDModels([]);
    setDBg([]);
    setDSymbol([]);
    setSheet(null);
  };

  const toggle = (list: string[], name: string, set: (v: string[]) => void) => {
    set(list.includes(name) ? list.filter((x) => x !== name) : [...list, name]);
  };

  const activeFilters = fCollections.length + fModels.length + fBg.length + fSymbol.length;

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

      <div style={{ display: "flex", gap: 8, padding: "12px 14px", overflowX: "auto" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск…"
          style={{
            flex: 1, minWidth: 120, padding: "10px 12px", borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.35)",
            color: "#e2e8f0", fontSize: 13, fontFamily: "inherit",
          }}
        />
        <button type="button" onClick={cycleSort} style={filterChip}>
          {sort === "price_asc" ? "↑" : sort === "price_desc" ? "↓" : "A"}
        </button>
        <button type="button" onClick={() => void openSheet("hub")} style={{
          ...filterChip,
          borderColor: activeFilters ? "rgba(0,152,234,0.5)" : "rgba(255,255,255,0.08)",
          color: activeFilters ? "#7dd3fc" : "#9ca3af",
        }}>
          Фильтры{activeFilters ? ` · ${activeFilters}` : ""}
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, padding: "0 14px 12px", overflowX: "auto" }}>
        <button type="button" onClick={() => void openSheet("collection")} style={filterPill}>Коллекции{fCollections.length ? ` (${fCollections.length})` : ""}</button>
        <button type="button" onClick={() => void openSheet("model")} style={filterPill}>Модели{fModels.length ? ` (${fModels.length})` : ""}</button>
        <button type="button" onClick={() => void openSheet("background")} style={filterPill}>Фоны{fBg.length ? ` (${fBg.length})` : ""}</button>
        <button type="button" onClick={() => void openSheet("symbol")} style={filterPill}>Символы{fSymbol.length ? ` (${fSymbol.length})` : ""}</button>
        {activeFilters > 0 && (
          <button type="button" onClick={clearFilters} style={{ ...filterPill, color: "#fca5a5" }}>Сброс</button>
        )}
      </div>

      {loading && <div style={{ padding: 24, color: "#9ca3af", textAlign: "center" }}>Загрузка…</div>}
      {loadError && <div style={{ padding: 24, color: "#f87171", textAlign: "center" }}>{loadError}</div>}

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 12px 24px" }}>
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setSelected(null)}>
          <div style={{ width: "100%", maxWidth: 480, background: "#0f172a", borderRadius: "20px 20px 0 0", padding: 16, border: "1px solid rgba(255,255,255,0.1)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <img src={IMG(selected.short)} alt="" style={{ width: 72, height: 72, objectFit: "contain" }} />
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{selected.name}</div>
                <div style={{ color: "#7dd3fc", fontWeight: 800, marginTop: 4 }}>{fmtPrice(selected.price)} TON</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Floor Portals / Getgems</div>
              </div>
            </div>
            <button type="button" disabled={buying || !cfg.buyEnabled} onClick={() => void handleBuy()} style={{
              width: "100%", marginTop: 14, padding: 14, borderRadius: 14, border: "none",
              background: cfg.buyEnabled ? "linear-gradient(135deg,#0369a1,#38bdf8)" : "rgba(100,116,139,0.4)",
              color: "#fff", fontWeight: 800, fontSize: 14, cursor: cfg.buyEnabled ? "pointer" : "not-allowed",
              fontFamily: "inherit", opacity: buying ? 0.7 : 1,
            }}>
              {!cfg.buyEnabled ? "Покупка отключена" : buying ? "…" : `Купить · ${fmtPrice(selected.price)} TON`}
            </button>
            <button type="button" onClick={() => setSelected(null)} style={{
              width: "100%", marginTop: 8, padding: 12, borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)", background: "transparent",
              color: "#94a3b8", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>Закрыть</button>
          </div>
        </div>
      )}

      {sheet && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 55, display: "flex", alignItems: "flex-end" }} onClick={() => setSheet(null)}>
          <div style={{ width: "100%", maxHeight: "75%", background: "#0f172a", borderRadius: "20px 20px 0 0", padding: 16, overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12 }}>
              {sheet === "hub" ? "Фильтры" : sheet === "collection" ? "Коллекции" : sheet === "model" ? "Модели" : sheet === "background" ? "Фоны" : "Символы"}
            </div>
            {sheet === "hub" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(["collection", "model", "background", "symbol"] as const).map((key) => (
                  <button key={key} type="button" onClick={() => void openSheet(key)} style={hubRow}>
                    {key === "collection" ? "Коллекции" : key === "model" ? "Модели" : key === "background" ? "Фоны" : "Символы"}
                  </button>
                ))}
                {activeFilters > 0 && (
                  <button type="button" onClick={clearFilters} style={{ ...hubRow, color: "#fca5a5" }}>Сбросить всё</button>
                )}
              </div>
            )}
            {sheet === "collection" && (
              <>
                <input value={sheetQ} onChange={(e) => setSheetQ(e.target.value)} placeholder="Поиск…" style={inputStyle} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflow: "auto" }}>
                  {collectionOptions.filter((c) => !sheetQ || c.name.toLowerCase().includes(sheetQ.toLowerCase())).map((c) => (
                    <button key={c.name} type="button" onClick={() => toggle(dCollections, c.name, setDCollections)} style={{
                      ...hubRow,
                      borderColor: dCollections.includes(c.name) ? "rgba(56,189,248,0.5)" : "rgba(255,255,255,0.08)",
                      color: dCollections.includes(c.name) ? "#7dd3fc" : "#e2e8f0",
                    }}>{c.name} · {fmtPrice(c.min)}</button>
                  ))}
                </div>
                <button type="button" onClick={applySheet} style={btnApply}>Применить</button>
              </>
            )}
            {(sheet === "model" || sheet === "background" || sheet === "symbol") && (
              <>
                <input value={sheetQ} onChange={(e) => setSheetQ(e.target.value)} placeholder="Поиск…" style={inputStyle} />
                {attrLoading && <div style={{ color: "#64748b", padding: 12 }}>Загрузка атрибутов…</div>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 360, overflow: "auto" }}>
                  {Object.entries(
                    sheet === "model" ? (attrPack?.models || {}) : sheet === "background" ? (attrPack?.backdrops || {}) : (attrPack?.symbols || {}),
                  )
                    .filter(([n]) => !sheetQ || n.toLowerCase().includes(sheetQ.toLowerCase()))
                    .slice(0, 200)
                    .map(([name]) => {
                      const list = sheet === "model" ? dModels : sheet === "background" ? dBg : dSymbol;
                      const set = sheet === "model" ? setDModels : sheet === "background" ? setDBg : setDSymbol;
                      const on = list.includes(name);
                      return (
                        <button key={name} type="button" onClick={() => toggle(list, name, set)} style={{
                          padding: "8px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                          border: on ? "1px solid rgba(56,189,248,0.5)" : "1px solid rgba(255,255,255,0.1)",
                          background: on ? "rgba(56,189,248,0.15)" : "rgba(255,255,255,0.04)",
                          color: on ? "#7dd3fc" : "#cbd5e1", cursor: "pointer", fontFamily: "inherit",
                        }}>{name}</button>
                      );
                    })}
                </div>
                <button type="button" onClick={applySheet} style={btnApply}>Применить</button>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: "fixed", left: 16, right: 16, bottom: 90, zIndex: 60,
          background: "rgba(15,23,42,0.95)", border: "1px solid rgba(56,189,248,0.35)",
          borderRadius: 12, padding: 12, textAlign: "center", fontWeight: 700, fontSize: 13,
        }}>{toast}</div>
      )}
    </div>
  );
}

const filterChip: CSSProperties = {
  flexShrink: 0, padding: "8px 12px", borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)",
  color: "#9ca3af", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};
const filterPill: CSSProperties = {
  flexShrink: 0, padding: "8px 12px", borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)",
  color: "#d1d5db", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};
const hubRow: CSSProperties = {
  width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)",
  color: "#e2e8f0", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
};
const inputStyle: CSSProperties = {
  width: "100%", boxSizing: "border-box", marginBottom: 10, padding: "10px 12px", borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.35)",
  color: "#e2e8f0", fontSize: 13, fontFamily: "inherit",
};
const btnApply: CSSProperties = {
  width: "100%", marginTop: 12, padding: 14, borderRadius: 14, border: "none",
  background: "linear-gradient(135deg,#0369a1,#38bdf8)", color: "#fff",
  fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
};
