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

  const loadAttrsFor = async (shorts: string[]) => {
    setAttrLoading(true);
    try {
      const targets = (shorts.length ? shorts : priced.slice(0, 8).map((g) => g.short)).slice(0, 10);
      const packs: ModelsPack[] = [];
      const nextCache: Record<string, ModelsPack> = { ...attrCache };
      for (const s of targets) {
        if (nextCache[s]) {
          packs.push(nextCache[s]);
          continue;
        }
        try {
          const res = await fetch(MODELS_URL(s), { cache: "force-cache" });
          if (!res.ok) continue;
          const data = (await res.json()) as { models?: AttrMap; backdrops?: AttrMap; symbols?: AttrMap };
          const pack: ModelsPack = {
            models: data.models ?? {},
            backdrops: data.backdrops ?? {},
            symbols: data.symbols ?? {},
          };
          packs.push(pack);
          nextCache[s] = pack;
        } catch { /* skip */ }
      }
      setAttrCache(nextCache);
      const merge = (key: keyof ModelsPack): AttrMap => {
        const out: AttrMap = {};
        for (const p of packs) {
          for (const [n, price] of Object.entries(p[key])) {
            if (out[n] == null || price < out[n]) out[n] = price;
          }
        }
        return out;
      };
      setAttrPack({ models: merge("models"), backdrops: merge("backdrops"), symbols: merge("symbols") });
    } finally {
      setAttrLoading(false);
    }
  };

  useEffect(() => {
    if (!priced.length) return;
    const top = [...priced].sort((a, b) => b.price - a.price).slice(0, 8).map((g) => g.short);
    void loadAttrsFor(top);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priced.length]);

  const openSheet = async (s: Sheet) => {
    haptic("light");
    setSheetQ("");
    if (s === "hub") {
      setSheet("hub");
      return;
    }
    if (s === "collection") setDCollections([...fCollections]);
    if (s === "model") setDModels([...fModels]);
    if (s === "background") setDBg([...fBg]);
    if (s === "symbol") setDSymbol([...fSymbol]);
    setSheet(s);
    if (s === "model" || s === "background" || s === "symbol") {
      const shorts = fCollections.length
        ? collectionOptions.filter((c) => fCollections.includes(c.name)).map((c) => c.short)
        : priced.slice(0, 8).map((g) => g.short);
      void loadAttrsFor(shorts);
    }
  };

  const applySheet = () => {
    if (sheet === "collection") {
      setFCollections([...dCollections]);
      if (dCollections.length) {
        void loadAttrsFor(collectionOptions.filter((c) => dCollections.includes(c.name)).map((c) => c.short));
      }
    }
    if (sheet === "model") setFModels([...dModels]);
    if (sheet === "background") setFBg([...dBg]);
    if (sheet === "symbol") setFSymbol([...dSymbol]);
    if ((sheet === "model" && dModels.length) || (sheet === "background" && dBg.length) || (sheet === "symbol" && dSymbol.length)) {
      void loadAttrsFor(priced.slice(0, 20).map((g) => g.short));
    }
    haptic("medium");
    setSheet(null);
  };

  const resetDraft = () => {
    if (sheet === "collection") setDCollections([]);
    if (sheet === "model") setDModels([]);
    if (sheet === "background") setDBg([]);
    if (sheet === "symbol") setDSymbol([]);
  };

  const resetAll = () => {
    setFCollections([]);
    setFModels([]);
    setFBg([]);
    setFSymbol([]);
    setDCollections([]);
    setDModels([]);
    setDBg([]);
    setDSymbol([]);
    setSheet(null);
    haptic("medium");
  };

  const toggle = (list: string[], setList: (v: string[]) => void, name: string) => {
    setList(list.includes(name) ? list.filter((x) => x !== name) : [...list, name]);
  };

  const activeFilters = fCollections.length + fModels.length + fBg.length + fSymbol.length;

  const modelOptions = useMemo(() => {
    return Object.entries(attrPack?.models ?? {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .filter(([n]) => n.toLowerCase().includes(sheetQ.toLowerCase()));
  }, [attrPack, sheetQ]);
  const bgOptions = useMemo(() => {
    return Object.entries(attrPack?.backdrops ?? {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .filter(([n]) => n.toLowerCase().includes(sheetQ.toLowerCase()));
  }, [attrPack, sheetQ]);
  const symbolOptions = useMemo(() => {
    return Object.entries(attrPack?.symbols ?? {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .filter(([n]) => n.toLowerCase().includes(sheetQ.toLowerCase()));
  }, [attrPack, sheetQ]);
  const collectionSheetItems = useMemo(() => {
    const q = sheetQ.toLowerCase();
    return collectionOptions.filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [collectionOptions, sheetQ]);

  return (
    <div style={page}>
      <style>{`
        .p-card:active{transform:scale(0.97)}
        .p-scroll::-webkit-scrollbar{display:none}
        .p-input::placeholder{color:#6b7280}
        .filter-scroll{-webkit-overflow-scrolling:touch;scrollbar-width:none;overscroll-behavior-x:contain}
        .filter-scroll::-webkit-scrollbar{display:none;width:0;height:0}
      `}</style>
      {toast && <div style={toastStyle}>{toast}</div>}

      <div style={banner}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 900, color: "#fff" }}>Tournament</div>
          <div style={timerPill}>6:23:31:00</div>
        </div>
        <div style={{ fontSize: 42 }}>🏆</div>
      </div>

      <div style={catRow}>
        {([
          ["all", "🎁", "Все"],
          ["collections", "👥", "Коллекции"],
          ["stars", "⭐", "Звёзды"],
        ] as const).map(([k, icon, label]) => {
          const on = cat === k;
          return (
            <button key={k} type="button" onClick={() => { haptic("light"); setCat(k); }} style={catBtn}>
              <span style={catIconBox(on)}>{icon}</span>
              <span style={{ fontSize: 11, fontWeight: on ? 700 : 500, color: on ? "#fff" : "#6b7280" }}>{label}</span>
            </button>
          );
        })}
      </div>

      {cat !== "stars" && (
        <div style={{ padding: "0 14px 10px" }}>
          <div style={searchWrap}>
            <span style={{ color: "#6b7280", fontSize: 15, marginRight: 8 }}>⌕</span>
            <input className="p-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Быстрый поиск" style={searchInput} />
            <button type="button" onClick={cycleSort} style={iconRound}>↕</button>
            <button type="button" style={iconRound}>≡</button>
          </div>
        </div>
      )}

      {cat === "all" && (
        <div className="p-scroll filter-scroll" style={filterRow}>
          <button type="button" style={{ ...filterChip, borderColor: activeFilters ? "rgba(0,152,234,0.5)" : "rgba(255,255,255,0.08)", color: activeFilters ? "#7dd3fc" : "#9ca3af" }} onClick={() => void openSheet("hub")}>
            ☰{activeFilters ? ` ${activeFilters}` : ""}
          </button>
          <button type="button" onClick={cycleSort} style={filterChip}>↕</button>
          <button type="button" onClick={() => void openSheet("collection")} style={{ ...filterPill, borderColor: fCollections.length ? "rgba(0,152,234,0.5)" : "rgba(255,255,255,0.08)", color: fCollections.length ? "#7dd3fc" : "#d1d5db" }}>
            Коллекция{fCollections.length ? ` · ${fCollections.length}` : ""} ▾
          </button>
          <button type="button" onClick={() => void openSheet("model")} style={{ ...filterPill, borderColor: fModels.length ? "rgba(0,152,234,0.5)" : "rgba(255,255,255,0.08)", color: fModels.length ? "#7dd3fc" : "#d1d5db" }}>
            Модель{fModels.length ? ` · ${fModels.length}` : ""} ▾
          </button>
          <button type="button" onClick={() => void openSheet("background")} style={{ ...filterPill, borderColor: fBg.length ? "rgba(0,152,234,0.5)" : "rgba(255,255,255,0.08)", color: fBg.length ? "#7dd3fc" : "#d1d5db" }}>
            Фон{fBg.length ? ` · ${fBg.length}` : ""} ▾
          </button>
          <button type="button" onClick={() => void openSheet("symbol")} style={{ ...filterPill, borderColor: fSymbol.length ? "rgba(0,152,234,0.5)" : "rgba(255,255,255,0.08)", color: fSymbol.length ? "#7dd3fc" : "#d1d5db" }}>
            Символ{fSymbol.length ? ` · ${fSymbol.length}` : ""} ▾
          </button>
        </div>
      )}

      {loading && <div style={{ padding: 24, color: "#9ca3af", textAlign: "center" }}>Загрузка…</div>}
      {loadError && <div style={{ padding: 24, color: "#f87171", textAlign: "center" }}>{loadError}</div>}

      {!loading && cfg.enabled && cat === "all" && (
        <div style={grid}>
          {listings.map((g, i) => (
            <button key={g.short} type="button" className="p-card" onClick={() => { haptic("light"); setSelected(g); }} style={{ ...card, background: CARD_BG[i % CARD_BG.length] }}>
              <div style={{ position: "relative", width: "100%" }}>
                <div style={{ position: "absolute", top: 0, left: 0, display: "flex", gap: 4, zIndex: 1 }}>
                  <span style={badge}>☘</span>
                  <span style={{ ...badge, background: "rgba(168,85,247,0.3)" }}>↗</span>
                </div>
                <img src={IMG(g.short)} alt="" style={cardImg} />
              </div>
              <div style={cardName}>{g.name}</div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>#{String(g.id).slice(-5)}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <div style={pricePill}>{fmtPrice(g.price)}</div>
                <span style={cartBtn}>🛒</span>
              </div>
            </button>
          ))}
          {!listings.length && (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#6b7280", padding: 32 }}>Ничего не найдено</div>
          )}
        </div>
      )}

      {!loading && cfg.enabled && cat === "collections" && (
        <div style={{ padding: "0 12px 100px" }}>
          <div style={colHeader}>
            <span style={{ flex: 1.5 }}>Коллекция</span>
            <span style={{ flex: 0.9, textAlign: "right" }}>Объём 24ч</span>
            <span style={{ flex: 0.8, textAlign: "right" }}>Флор</span>
          </div>
          {collectionRows.map((c) => (
            <button key={c.short} type="button" onClick={() => { setFCollections([c.name]); setCat("all"); haptic("light"); }} style={colRow}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1.5, minWidth: 0 }}>
                <img src={IMG(c.short)} alt="" style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 8 }} />
                <span style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              </div>
              <div style={{ flex: 0.9, textAlign: "right", fontSize: 13, fontWeight: 700 }}>{fmtPrice(c.getgems * 12)}</div>
              <div style={{ flex: 0.8, textAlign: "right", fontSize: 13, fontWeight: 800 }}>{fmtPrice(c.price)}</div>
            </button>
          ))}
        </div>
      )}

      {cat === "stars" && (
        <div style={{ padding: "8px 16px 100px" }}>
          <div style={starSeg}>
            <button type="button" style={starSegBtn(true)}>Звёзды</button>
            <button type="button" style={starSegBtn(false)} onClick={() => flash("Премиум скоро")}>Премиум</button>
          </div>
          <div style={{ textAlign: "center", padding: "28px 0 16px" }}>
            <div style={{ fontSize: 64 }}>⭐</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 8 }}>Купить звёзды Telegram</div>
            <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>Купите себе или друзьям</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 16 }}>
            {[50, 100, 250, 500, 1000].map((n) => (
              <button key={n} type="button" onClick={() => setStarsQty(n)} style={{
                padding: "10px 14px", borderRadius: 12, border: starsQty === n ? "1.5px solid #0098EA" : "1px solid rgba(255,255,255,0.1)",
                background: starsQty === n ? "rgba(0,152,234,0.15)" : "rgba(255,255,255,0.05)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              }}>⭐ {n}</button>
            ))}
          </div>
          <button type="button" onClick={() => flash("Покупка Stars скоро")} style={{ ...btnBlue, width: "100%", padding: "14px 0" }}>
            Купить Stars · {starsQty}
          </button>
        </div>
      )}

      {selected && (
        <div style={overlay} onClick={() => setSelected(null)}>
          <div style={sheetBox} onClick={(e) => e.stopPropagation()}>
            <div style={handle} />
            <div style={{ textAlign: "center" }}>
              <div style={{ borderRadius: 18, background: CARD_BG[0], padding: 16, display: "inline-block" }}>
                <img src={IMG(selected.short)} alt={selected.name} style={{ width: 140, height: 140, objectFit: "contain" }} />
              </div>
              <div style={{ marginTop: 10, fontSize: 17, fontWeight: 800 }}>{selected.name}</div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>#{String(selected.id).slice(-6)}</div>
            </div>
            <div style={attrBox}>
              <div style={attrLine}><span style={{ color: "#9ca3af" }}>Floor</span><span>{fmtPrice(selected.floor)} TON</span></div>
              <div style={attrLine}><span style={{ color: "#9ca3af" }}>Getgems</span><span>{fmtPrice(selected.getgems)} TON</span></div>
              <div style={attrLine}><span style={{ color: "#9ca3af" }}>Мин. цена</span><span style={{ fontWeight: 800 }}>{fmtPrice(selected.price)} TON</span></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 8 }}>
              <button type="button" onClick={() => flash("Офферы скоро")} style={btnGray}>Сделать оффер</button>
              <button type="button" disabled={buying || !cfg.buyEnabled} onClick={() => void handleBuy()} style={{ ...btnBlue, opacity: buying || !cfg.buyEnabled ? 0.55 : 1 }}>
                {!cfg.buyEnabled ? "Покупка отключена" : buying ? "…" : `Купить · ${fmtPrice(selected.price)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {sheet === "hub" && (
        <Sheet title="Фильтры" onClose={() => setSheet(null)}>
          {([
            ["collection", "💎", "Коллекция", fCollections.length],
            ["model", "🪖", "Model", fModels.length],
            ["background", "🎨", "Background", fBg.length],
            ["symbol", "☘", "Symbol", fSymbol.length],
          ] as const).map(([key, icon, label, count]) => (
            <button key={key} type="button" onClick={() => void openSheet(key)} style={hubRow}>
              <span style={{ marginRight: 10 }}>{icon}</span>
              <span style={{ flex: 1, textAlign: "left", fontWeight: 700 }}>{label}</span>
              {count > 0 && <span style={{ fontSize: 12, color: "#38bdf8", marginRight: 8 }}>{count}</span>}
              <span style={{ color: "#6b7280" }}>›</span>
            </button>
          ))}
          {activeFilters > 0 && (
            <button type="button" onClick={resetAll} style={{ ...btnGray, marginTop: 8, width: "100%" }}>Сбросить все</button>
          )}
        </Sheet>
      )}

      {sheet === "collection" && (
        <Sheet title="Коллекция" onClose={() => setSheet(null)}>
          <SearchField value={sheetQ} onChange={setSheetQ} />
          <div style={listScroll}>
            {collectionSheetItems.map((c) => (
              <CheckRow key={c.short} on={dCollections.includes(c.name)} title={c.name} right={fmtPrice(c.price)} img={IMG(c.short)} onClick={() => toggle(dCollections, setDCollections, c.name)} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" onClick={resetDraft} style={btnGray}>Сбросить</button>
            <button type="button" onClick={applySheet} style={btnBlue}>Применить</button>
          </div>
        </Sheet>
      )}

      {sheet === "model" && (
        <Sheet title="Model" onClose={() => setSheet(null)}>
          <SearchField value={sheetQ} onChange={setSheetQ} />
          {attrLoading && <div style={{ color: "#9ca3af", padding: 12 }}>Загрузка…</div>}
          <div style={listScroll}>
            {modelOptions.map(([n, p]) => (
              <CheckRow key={n} on={dModels.includes(n)} title={n} right={fmtPrice(p)} onClick={() => toggle(dModels, setDModels, n)} />
            ))}
            {!attrLoading && !modelOptions.length && <div style={{ color: "#6b7280", padding: 12 }}>Нет данных</div>}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" onClick={resetDraft} style={btnGray}>Сбросить</button>
            <button type="button" onClick={applySheet} style={btnBlue}>Применить</button>
          </div>
        </Sheet>
      )}

      {sheet === "background" && (
        <Sheet title="Background" onClose={() => setSheet(null)}>
          <SearchField value={sheetQ} onChange={setSheetQ} />
          {attrLoading && <div style={{ color: "#9ca3af", padding: 12 }}>Загрузка…</div>}
          <div style={listScroll}>
            {bgOptions.map(([n, p]) => (
              <CheckRow key={n} on={dBg.includes(n)} title={n} right={fmtPrice(p)} onClick={() => toggle(dBg, setDBg, n)} />
            ))}
            {!attrLoading && !bgOptions.length && <div style={{ color: "#6b7280", padding: 12 }}>Нет данных</div>}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" onClick={resetDraft} style={btnGray}>Сбросить</button>
            <button type="button" onClick={applySheet} style={btnBlue}>Применить</button>
          </div>
        </Sheet>
      )}

      {sheet === "symbol" && (
        <Sheet title="Symbol" onClose={() => setSheet(null)}>
          <SearchField value={sheetQ} onChange={setSheetQ} />
          {attrLoading && <div style={{ color: "#9ca3af", padding: 12 }}>Загрузка…</div>}
          <div style={listScroll}>
            {symbolOptions.map(([n, p]) => (
              <CheckRow key={n} on={dSymbol.includes(n)} title={n} right={fmtPrice(p)} onClick={() => toggle(dSymbol, setDSymbol, n)} />
            ))}
            {!attrLoading && !symbolOptions.length && <div style={{ color: "#6b7280", padding: 12 }}>Нет данных</div>}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" onClick={resetDraft} style={btnGray}>Сбросить</button>
            <button type="button" onClick={applySheet} style={btnBlue}>Применить</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheetBox} onClick={(e) => e.stopPropagation()}>
        <div style={handle} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
          <button type="button" onClick={onClose} style={closeBtn}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ ...searchWrap, marginBottom: 10 }}>
      <span style={{ color: "#6b7280", marginRight: 8 }}>⌕</span>
      <input className="p-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Поиск" style={searchInput} />
    </div>
  );
}

function CheckRow({ on, title, right, img, onClick }: { on: boolean; title: string; right?: string; img?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ display: "flex", alignItems: "center", width: "100%", padding: "10px 8px", border: "none", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "transparent", color: "#e5e7eb", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
      <span style={{ width: 22, height: 22, borderRadius: 6, border: on ? "none" : "1.5px solid rgba(255,255,255,0.25)", background: on ? "#0098EA" : "transparent", marginRight: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12 }}>{on ? "✓" : ""}</span>
      {img && <img src={img} alt="" style={{ width: 28, height: 28, objectFit: "contain", marginRight: 8, borderRadius: 6 }} />}
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{title}</span>
      {right != null && <span style={{ fontSize: 12, color: "#9ca3af" }}>{right}</span>}
    </button>
  );
}

function catIconBox(on: boolean): CSSProperties {
  return { width: 44, height: 44, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, background: on ? "rgba(0,152,234,0.2)" : "rgba(255,255,255,0.06)", border: on ? "1px solid rgba(0,152,234,0.4)" : "1px solid transparent", marginBottom: 4 };
}
function starSegBtn(on: boolean): CSSProperties {
  return { flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: on ? "#fff" : "transparent", color: on ? "#111" : "#9ca3af", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" };
}

const page: CSSProperties = { minHeight: "100%", background: "#0b0b0d", color: "#fff", fontFamily: "inherit", paddingBottom: 100 };
const banner: CSSProperties = { margin: "10px 14px", padding: "14px 16px", borderRadius: 18, background: "linear-gradient(90deg,#1a0a2e 0%,#2d1b4e 40%,#1a1040 100%)", border: "1px solid rgba(255,45,120,0.25)", display: "flex", justifyContent: "space-between", alignItems: "center" };
const timerPill: CSSProperties = { display: "inline-block", marginTop: 6, padding: "4px 10px", borderRadius: 999, background: "rgba(236,72,153,0.25)", color: "#f9a8d4", fontSize: 12, fontWeight: 700 };
const catRow: CSSProperties = { display: "flex", justifyContent: "space-around", padding: "8px 12px 4px" };
const catBtn: CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", background: "transparent", border: "none", color: "#fff", cursor: "pointer", fontFamily: "inherit" };
const searchWrap: CSSProperties = { display: "flex", alignItems: "center", padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" };
const searchInput: CSSProperties = { flex: 1, border: "none", outline: "none", background: "transparent", color: "#fff", fontSize: 14, fontFamily: "inherit" };
const iconRound: CSSProperties = { width: 32, height: 32, borderRadius: 10, border: "none", background: "rgba(255,255,255,0.06)", color: "#9ca3af", marginLeft: 6, cursor: "pointer", fontFamily: "inherit" };
const filterRow: CSSProperties = { display: "flex", gap: 8, padding: "0 14px 12px", overflowX: "auto", WebkitOverflowScrolling: "touch" };
const filterChip: CSSProperties = { flexShrink: 0, padding: "8px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "#9ca3af", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const filterPill: CSSProperties = { flexShrink: 0, padding: "8px 12px", borderRadius: 999, border: "1px solid", background: "rgba(255,255,255,0.04)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 12px 24px" };
const card: CSSProperties = { border: "none", borderRadius: 16, padding: "12px 10px 14px", color: "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "center" };
const cardImg: CSSProperties = { width: "100%", height: 120, objectFit: "contain", display: "block" };
const cardName: CSSProperties = { fontSize: 13, fontWeight: 700, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const pricePill: CSSProperties = { display: "inline-block", padding: "5px 12px", borderRadius: 999, background: "#0098EA", color: "#fff", fontSize: 12, fontWeight: 800 };
const badge: CSSProperties = { width: 22, height: 22, borderRadius: 8, background: "rgba(34,197,94,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 };
const cartBtn: CSSProperties = { width: 28, height: 28, borderRadius: 10, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 };
const colHeader: CSSProperties = { display: "flex", padding: "8px 4px", fontSize: 11, color: "#6b7280", fontWeight: 600 };
const colRow: CSSProperties = { display: "flex", alignItems: "center", width: "100%", padding: "10px 4px", border: "none", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "transparent", color: "#e5e7eb", cursor: "pointer", fontFamily: "inherit" };
const starSeg: CSSProperties = { display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: 3 };
const overlay: CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" };
const sheetBox: CSSProperties = { width: "100%", maxWidth: 480, background: "#121214", borderRadius: "22px 22px 0 0", padding: "10px 16px 28px", border: "1px solid rgba(255,255,255,0.06)", borderBottom: "none", maxHeight: "88vh", display: "flex", flexDirection: "column" };
const handle: CSSProperties = { width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 12px" };
const closeBtn: CSSProperties = { width: 32, height: 32, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.08)", color: "#94a3b8", fontSize: 20, cursor: "pointer" };
const attrBox: CSSProperties = { margin: "14px 0", padding: 12, borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" };
const attrLine: CSSProperties = { display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 };
const hubRow: CSSProperties = { display: "flex", alignItems: "center", width: "100%", padding: "14px 12px", marginBottom: 8, borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "#e5e7eb", fontSize: 14, cursor: "pointer", fontFamily: "inherit" };
const listScroll: CSSProperties = { overflowY: "auto", maxHeight: "48vh", flex: 1 };
const btnGray: CSSProperties = { flex: 1, padding: "13px 0", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: "#e5e7eb", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" };
const btnBlue: CSSProperties = { flex: 1, padding: "13px 0", borderRadius: 14, border: "none", background: "#0098EA", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" };
const toastStyle: CSSProperties = { position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 400, background: "rgba(15,23,42,0.95)", border: "1px solid rgba(56,189,248,0.4)", color: "#e2e8f0", padding: "10px 16px", borderRadius: 12, fontSize: 13, fontWeight: 700 };
