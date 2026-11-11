import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useTelegram, haptic } from "@/lib/telegram";
import {
  loadNftMarketConfig,
  effectivePrice,
  isGiftVisible,
  type NftMarketConfig,
} from "@/lib/nftMarketConfig";
const PRICES_URL =
  "https://cdn.jsdelivr.net/gh/ssamy2/TelegramGiftsAssests@main/Gifts_Details.json";
const MODELS_URL = (short: string) =>
  `https://cdn.jsdelivr.net/gh/ssamy2/TelegramGiftsAssests@main/models/${short}/prices.json`;
const IMG = (short: string) =>
  `https://cdn.jsdelivr.net/gh/ssamy2/TG_Photos@main/webp/by_name/${short}.webp`;
type GiftRow = {
  name: string;
  short: string;
  price: number;
  floor: number;
  getgems: number;
  tgmrkt: number;
  id: string;
};
type PriceSource = {
  full_name: string;
  short_name: string;
  regular_id?: string;
  floor_price_ton?: number;
  portal_price_ton?: number;
  getgems_price_ton?: number;
  tgmrkt_price_ton?: number;
};
type AttrMap = Record<string, number>;
type ModelsPack = { models: AttrMap; backdrops: AttrMap; symbols: AttrMap };
type CatTab = "all" | "collections" | "stars";
type Sort = "price_asc" | "price_desc" | "name";
type Sheet = null | "hub" | "collection" | "model" | "background" | "symbol";
function pickFloor(g: PriceSource): number {
  const candidates = [
    g.portal_price_ton,
    g.floor_price_ton,
    g.getgems_price_ton,
    g.tgmrkt_price_ton,
  ].filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  return candidates.length ? candidates[0] : 0;
}
function fmtPrice(n: number): string {
  if (!n || n <= 0) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1).replace(/\.0$/, "");
  return n.toFixed(2).replace(/0$/, "").replace(/\.$/, "");
}
const CARD_BG = [
  "linear-gradient(165deg,#2a3a4a 0%,#1a2838 55%,#121c28 100%)",
  "linear-gradient(165deg,#2a4a3a 0%,#1a3028 55%,#12201c 100%)",
  "linear-gradient(165deg,#3a2a4a 0%,#281a38 55%,#1c1228 100%)",
  "linear-gradient(165deg,#4a3a2a 0%,#38281a 55%,#281c12 100%)",
  "linear-gradient(165deg,#2a3a5a 0%,#1a2840 55%,#121c30 100%)",
  "linear-gradient(165deg,#3a2a3a 0%,#281a28 55%,#1c121c 100%)",
  "linear-gradient(165deg,#2a4a4a 0%,#1a3030 55%,#122020 100%)",
  "linear-gradient(165deg,#4a2a3a 0%,#381a28 55%,#28121c 100%)",
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
    return () => {
      cancelled = true;
    };
  }, []);
  const priced = useMemo(() => {
    return gifts
      .filter((g) => isGiftVisible(g.short, cfg))
      .map((g) => ({
        ...g,
        price: effectivePrice(g.short, g.floor, cfg),
      }));
  }, [gifts, cfg]);
  const collectionOptions = useMemo(
    () =>
      [...priced]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((g) => ({ name: g.name, short: g.short, price: g.price })),
    [priced],
  );
  const listings = useMemo(() => {
    let list = [...priced];
    if (fCollections.length) {
      list = list.filter((g) => fCollections.includes(g.name));
    }
    const hasAttrFilters = fModels.length > 0 || fBg.length > 0 || fSymbol.length > 0;
    if (hasAttrFilters) {
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
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.short.includes(q) ||
          g.id.includes(q),
      );
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
    return [...priced]
      .sort((a, b) => b.price - a.price)
      .filter((c) => {
        const q = search.toLowerCase().trim();
        if (!q) return true;
        return c.name.toLowerCase().includes(q) || c.short.includes(q);
      });
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
          const data = (await res.json()) as {
            models?: AttrMap;
            backdrops?: AttrMap;
            symbols?: AttrMap;
          };
          const pack: ModelsPack = {
            models: data.models ?? {},
            backdrops: data.backdrops ?? {},
            symbols: data.symbols ?? {},
          };
          packs.push(pack);
          nextCache[s] = pack;
        } catch {
          /* skip */
        }
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
      setAttrPack({
        models: merge("models"),
        backdrops: merge("backdrops"),
        symbols: merge("symbols"),
      });
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
        const shorts = collectionOptions
          .filter((c) => dCollections.includes(c.name))
          .map((c) => c.short);
        void loadAttrsFor(shorts);
      }
    }
    if (sheet === "model") setFModels([...dModels]);
    if (sheet === "background") setFBg([...dBg]);
    if (sheet === "symbol") setFSymbol([...dSymbol]);
    if (
      (sheet === "model" && dModels.length) ||
      (sheet === "background" && dBg.length) ||
      (sheet === "symbol" && dSymbol.length)
    ) {
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
  const activeFilters =
    fCollections.length + fModels.length + fBg.length + fSymbol.length;
  const modelOptions = useMemo(() => {
    const entries = Object.entries(attrPack?.models ?? {});
    return entries
      .sort((a, b) => a[0].localeCompare(b[0]))
      .filter(([n]) => n.toLowerCase().includes(sheetQ.toLowerCase()));
  }, [attrPack, sheetQ]);
  const bgOptions = useMemo(() => {
    const entries = Object.entries(attrPack?.backdrops ?? {});
    return entries
      .sort((a, b) => a[0].localeCompare(b[0]))
      .filter(([n]) => n.toLowerCase().includes(sheetQ.toLowerCase()));
  }, [attrPack, sheetQ]);
  const symbolOptions = useMemo(() => {
    const entries = Object.entries(attrPack?.symbols ?? {});
    return entries
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
        .p-card:active { transform: scale(0.97); }
        .p-scroll::-webkit-scrollbar { display: none; }
        .p-input::placeholder { color: #6b7280; }
      `}</style>
      {toast && <div style={toastStyle}>{toast}</div>}
      <div style={banner}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>Tournament</div>
          <div style={timerPill}>6:23:31:00</div>
        </div>
        <div style={{ fontSize: 40 }}>🏆</div>
      </div>
      <div style={catRow}>
        {(
          [
            ["all", "🎁", "Все"],
            ["collections", "👥", "Коллекции"],
            ["stars", "⭐", "Звёзды"],
          ] as const
        ).map(([k, icon, label]) => {
          const on = cat === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => {
                haptic("light");
                setCat(k);
              }}
              style={catBtn}
            >
              <span style={catIconBox(on)}>{icon}</span>
              <span style={{ fontSize: 11, fontWeight: on ? 700 : 500, color: on ? "#fff" : "#6b7280" }}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
      {cat !== "stars" && (
        <div style={{ padding: "0 14px 10px" }}>
          <div style={searchWrap}>
            <span style={{ color: "#6b7280", fontSize: 15, marginRight: 8 }}>⌕</span>
            <input
              className="p-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Быстрый поиск"
              style={searchInput}
            />
            <button type="button" onClick={cycleSort} style={iconRound}>↕</button>
            <button type="button" style={iconRound}>≡</button>
          </div>
        </div>
      )}
      {cat === "all" && (
        <div className="p-scroll" style={filterRow}>
          <button
            type="button"
            style={{
              ...filterChip,
              borderColor: activeFilters ? "rgba(0,152,234,0.5)" : "rgba(255,255,255,0.08)",
              color: activeFilters ? "#7dd3fc" : "#9ca3af",
            }}
            onClick={() => void openSheet("hub")}
          >
            ☰{activeFilters ? ` ${activeFilters}` : ""}
          </button>
          <button type="button" onClick={cycleSort} style={filterChip}>↕</button>
          <button
            type="button"
            onClick={() => void openSheet("collection")}
            style={{
              ...filterPill,
              borderColor: fCollections.length ? "rgba(0,152,234,0.5)" : "rgba(255,255,255,0.08)",
              color: fCollections.length ? "#7dd3fc" : "#d1d5db",
            }}
          >
            Коллекция{fCollections.length ? ` · ${fCollections.length}` : ""} ▾
          </button>
          <button
            type="button"
            onClick={() => void openSheet("model")}
            style={{
              ...filterPill,
              borderColor: fModels.length ? "rgba(0,152,234,0.5)" : "rgba(255,255,255,0.08)",
              color: fModels.length ? "#7dd3fc" : "#d1d5db",
            }}
          >
            Модель{fModels.length ? ` · ${fModels.length}` : ""} ▾
          </button>
          <button
            type="button"
            onClick={() => void openSheet("background")}
            style={{
              ...filterPill,
              borderColor: fBg.length ? "rgba(0,152,234,0.5)" : "rgba(255,255,255,0.08)",
              color: fBg.length ? "#7dd3fc" : "#d1d5db",
            }}
          >
            Фон{fBg.length ? ` · ${fBg.length}` : ""} ▾
          </button>
          <button
            type="button"
            onClick={() => void openSheet("symbol")}
            style={{
              ...filterPill,
              borderColor: fSymbol.length ? "rgba(0,152,234,0.5)" : "rgba(255,255,255,0.08)",
              color: fSymbol.length ? "#7dd3fc" : "#d1d5db",
            }}
          >
            Символ{fSymbol.length ? ` · ${fSymbol.length}` : ""} ▾
          </button>
        </div>
      )}
      {loading && <div style={{ padding: 24, color: "#9ca3af", textAlign: "center" }}>Загрузка…</div>}
      {loadError && <div style={{ padding: 24, color: "#f87171", textAlign: "center" }}>{loadError}</div>}
      {!loading && cfg.enabled && cat === "all" && (
        <div style={grid}>
          {listings.map((g, i) => (
            <button
              key={g.short}
              type="button"
              className="p-card"
              onClick={() => {
                haptic("light");
                setSelected(g);
              }}
              style={{ ...card, background: CARD_BG[i % CARD_BG.length] }}
            >
              <img src={IMG(g.short)} alt="" style={cardImg} />
              <div style={cardName}>{g.name}</div>
              <div style={pricePill}>{fmtPrice(g.price)} TON</div>
            </button>
          ))}
        </div>
      )}
      {!loading && cfg.enabled && cat === "collections" && (
        <div style={{ padding: "0 14px 100px" }}>
          {collectionRows.map((c) => (
            <button
              key={c.short}
              type="button"
              onClick={() => {
                haptic("light");
                setSelected(c);
              }}
              style={collRow}
            >
              <img src={IMG(c.short)} alt="" style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 10 }} />
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>Floor {fmtPrice(c.floor)} TON</div>
              </div>
              <div style={pricePill}>{fmtPrice(c.price)} TON</div>
            </button>
          ))}
        </div>
      )}
      {cat === "stars" && (
        <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⭐</div>
          <div style={{ fontWeight: 700, color: "#e5e7eb", marginBottom: 8 }}>Telegram Stars</div>
          <div style={{ fontSize: 13 }}>Покупка Stars скоро будет доступна</div>
        </div>
      )}
      {selected && (
        <div style={overlay} onClick={() => setSelected(null)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div style={modalHero}>
              <img src={IMG(selected.short)} alt={selected.name} style={{ width: 160, height: 160, objectFit: "contain" }} />
              <div style={{ marginTop: 8, fontSize: 17, fontWeight: 800, color: "#fff" }}>{selected.name}</div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>#{String(selected.id).slice(-6)}</div>
            </div>
            <div style={attrBox}>
              <div style={attrLine}><span style={{ color: "#9ca3af" }}>Floor</span><span>{fmtPrice(selected.floor)} TON</span></div>
              <div style={attrLine}><span style={{ color: "#9ca3af" }}>Getgems</span><span>{fmtPrice(selected.getgems)} TON</span></div>
              <div style={attrLine}><span style={{ color: "#9ca3af" }}>Мин. цена</span><span style={{ fontWeight: 800 }}>{fmtPrice(selected.price)} TON</span></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 8 }}>
              <button type="button" onClick={() => flash("Офферы скоро")} style={btnGray}>Сделать оффер</button>
              <button
                type="button"
                disabled={buying || !cfg.buyEnabled}
                onClick={() => void handleBuy()}
                style={{ ...btnBlue, opacity: buying || !cfg.buyEnabled ? 0.55 : 1 }}
              >
                {!cfg.buyEnabled ? "Покупка отключена" : buying ? "…" : `Купить · ${fmtPrice(selected.price)} TON`}
              </button>
            </div>
          </div>
        </div>
      )}
      {sheet === "hub" && (
        <Sheet title="Фильтры" onClose={() => setSheet(null)}>
          {(
            [
              ["collection", "💎", "Коллекция", fCollections.length],
              ["model", "🪖", "Model", fModels.length],
              ["background", "🎨", "Background", fBg.length],
              ["symbol", "☘", "Symbol", fSymbol.length],
            ] as const
          ).map(([key, icon, label, count]) => (
            <button key={key} type="button" onClick={() => void openSheet(key)} style={hubRow}>
              <span style={{ marginRight: 10 }}>{icon}</span>
              <span style={{ flex: 1, textAlign: "left", fontWeight: 700 }}>{label}</span>
              {count > 0 && (
                <span style={{ fontSize: 12, color: "#38bdf8", marginRight: 8 }}>{count}</span>
              )}
              <span style={{ color: "#6b7280" }}>›</span>
            </button>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="button" onClick={resetAll} style={btnGray}>Сбросить</button>
            <button type="button" onClick={() => setSheet(null)} style={btnBlue}>Поиск</button>
          </div>
        </Sheet>
      )}
      {sheet === "collection" && (
        <Sheet title="Коллекция" onClose={() => setSheet(null)}>
          <SearchField value={sheetQ} onChange={setSheetQ} />
          <div className="p-scroll" style={listScroll}>
            {collectionSheetItems.map((c) => {
              const on = dCollections.includes(c.name);
              return (
                <CheckRow
                  key={c.short}
                  on={on}
                  title={c.name}
                  right={`${fmtPrice(c.price)} TON`}
                  img={IMG(c.short)}
                  onClick={() => toggle(dCollections, setDCollections, c.name)}
                />
              );
            })}
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
          {attrLoading && <div style={{ color: "#6b7280", fontSize: 13, padding: 12 }}>Загрузка моделей…</div>}
          {!attrLoading && modelOptions.length === 0 && (
            <div style={{ color: "#6b7280", fontSize: 13, padding: 12 }}>Нет данных — подождите или выберите коллекцию</div>
          )}
          <div className="p-scroll" style={listScroll}>
            {modelOptions.map(([name, price]) => {
              const on = dModels.includes(name);
              return (
                <CheckRow
                  key={name}
                  on={on}
                  title={name}
                  right={`${fmtPrice(price)} TON`}
                  onClick={() => toggle(dModels, setDModels, name)}
                />
              );
            })}
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
          {attrLoading && <div style={{ color: "#6b7280", fontSize: 13, padding: 12 }}>Загрузка фонов…</div>}
          {!attrLoading && bgOptions.length === 0 && (
            <div style={{ color: "#6b7280", fontSize: 13, padding: 12 }}>Нет данных — подождите или выберите коллекцию</div>
          )}
          <div className="p-scroll" style={listScroll}>
            {bgOptions.map(([name, price]) => {
              const on = dBg.includes(name);
              return (
                <CheckRow
                  key={name}
                  on={on}
                  title={name}
                  right={`${fmtPrice(price)} TON`}
                  onClick={() => toggle(dBg, setDBg, name)}
                />
              );
            })}
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
          {attrLoading && <div style={{ color: "#6b7280", fontSize: 13, padding: 12 }}>Загрузка символов…</div>}
          {!attrLoading && symbolOptions.length === 0 && (
            <div style={{ color: "#6b7280", fontSize: 13, padding: 12 }}>Нет данных — подождите или выберите коллекцию</div>
          )}
          <div className="p-scroll" style={listScroll}>
            {symbolOptions.map(([name, price]) => {
              const on = dSymbol.includes(name);
              return (
                <CheckRow
                  key={name}
                  on={on}
                  title={name}
                  right={`${fmtPrice(price)} TON`}
                  onClick={() => toggle(dSymbol, setDSymbol, name)}
                />
              );
            })}
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{title}</div>
          <button type="button" onClick={onClose} style={closeBtn}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={searchWrapSheet}>
      <span style={{ color: "#6b7280", fontSize: 15, marginRight: 8 }}>⌕</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Быстрый поиск" style={searchInput} />
    </div>
  );
}
function CheckRow({
  on, title, right, img, onClick,
}: { on: boolean; title: string; right?: string; img?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={checkRow}>
      <span style={checkBox(on)}>{on ? "✓" : ""}</span>
      {img ? (
        <img src={img} alt="" style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 8 }} />
      ) : (
        <span style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.06)" }} />
      )}
      <span style={{ flex: 1, textAlign: "left", fontWeight: 600, fontSize: 14 }}>{title}</span>
      {right && <span style={{ fontSize: 13, fontWeight: 700 }}>{right}</span>}
    </button>
  );
}
const page: CSSProperties = { minHeight: "100%", background: "#0b0b0d", color: "#e5e7eb", paddingBottom: 100 };
const banner: CSSProperties = {
  margin: "10px 14px", padding: "14px 16px", borderRadius: 18,
  background: "linear-gradient(135deg,#1e3a5f 0%,#0f172a 100%)", border: "1px solid rgba(56,189,248,0.25)",
  display: "flex", justifyContent: "space-between", alignItems: "center",
};
const timerPill: CSSProperties = {
  marginTop: 6, display: "inline-block", padding: "4px 10px", borderRadius: 999,
  background: "rgba(0,152,234,0.2)", color: "#7dd3fc", fontSize: 12, fontWeight: 700,
};
const catRow: CSSProperties = { display: "flex", gap: 8, padding: "4px 14px 12px" };
const catBtn: CSSProperties = {
  flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
  background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", color: "#e5e7eb",
};
function catIconBox(on: boolean): CSSProperties {
  return {
    width: 48, height: 48, borderRadius: 14,
    background: on ? "rgba(0,152,234,0.25)" : "rgba(255,255,255,0.06)",
    border: on ? "1px solid rgba(0,152,234,0.5)" : "1px solid rgba(255,255,255,0.06)",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
  };
}
const searchWrap: CSSProperties = {
  display: "flex", alignItems: "center", background: "rgba(255,255,255,0.06)", borderRadius: 14,
  padding: "0 6px 0 14px", height: 44, border: "1px solid rgba(255,255,255,0.06)",
};
const searchWrapSheet: CSSProperties = {
  display: "flex", alignItems: "center", background: "rgba(255,255,255,0.06)", borderRadius: 14,
  padding: "0 8px 0 14px", height: 42, border: "1px solid rgba(255,255,255,0.06)", marginBottom: 10,
};
const searchInput: CSSProperties = {
  flex: 1, background: "transparent", border: "none", outline: "none", color: "#f3f4f6", fontSize: 14, fontFamily: "inherit",
};
const iconRound: CSSProperties = {
  width: 34, height: 34, borderRadius: 10, border: "none", background: "rgba(255,255,255,0.06)",
  color: "#9ca3af", fontSize: 14, cursor: "pointer", marginLeft: 4,
};
const filterRow: CSSProperties = {
  display: "flex", gap: 8, padding: "0 14px 12px", overflowX: "auto", WebkitOverflowScrolling: "touch",
};
const filterChip: CSSProperties = {
  flexShrink: 0, padding: "8px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)", color: "#9ca3af", fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
};
const filterPill: CSSProperties = {
  flexShrink: 0, padding: "8px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)", fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
};
const grid: CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 14px 100px",
};
const card: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "12px 10px 12px",
  cursor: "pointer", fontFamily: "inherit", color: "#e5e7eb", textAlign: "center",
};
const cardImg: CSSProperties = { width: "100%", height: 110, objectFit: "contain" };
const cardName: CSSProperties = { fontSize: 12, fontWeight: 700, marginTop: 6, marginBottom: 8 };
const pricePill: CSSProperties = {
  display: "inline-block", padding: "5px 10px", borderRadius: 999, background: "#0098EA",
  color: "#fff", fontSize: 12, fontWeight: 800,
};
const collRow: CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 10px",
  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14,
  marginBottom: 8, cursor: "pointer", fontFamily: "inherit", color: "#e5e7eb",
};
const overlay: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 200,
  display: "flex", alignItems: "flex-end", justifyContent: "center",
};
const modal: CSSProperties = {
  width: "100%", maxWidth: 480, background: "#121214", borderRadius: "22px 22px 0 0",
  padding: "16px 16px 28px", border: "1px solid rgba(255,255,255,0.06)", borderBottom: "none",
};
const modalHero: CSSProperties = { textAlign: "center", marginBottom: 14 };
const attrBox: CSSProperties = {
  background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "10px 14px", marginBottom: 14,
};
const attrLine: CSSProperties = {
  display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13,
};
const sheetBox: CSSProperties = {
  width: "100%", maxWidth: 480, background: "#121214", borderRadius: "22px 22px 0 0",
  padding: "10px 16px 28px", border: "1px solid rgba(255,255,255,0.06)", borderBottom: "none",
  maxHeight: "88vh", display: "flex", flexDirection: "column",
};
const handle: CSSProperties = {
  width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 12px",
};
const closeBtn: CSSProperties = {
  width: 32, height: 32, borderRadius: "50%", border: "none",
  background: "rgba(255,255,255,0.08)", color: "#94a3b8", fontSize: 20, cursor: "pointer",
};
const listScroll: CSSProperties = { overflowY: "auto", maxHeight: "48vh", flex: 1 };
const checkRow: CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 4px",
  background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.05)",
  cursor: "pointer", fontFamily: "inherit", color: "#e5e7eb",
};
function checkBox(on: boolean): CSSProperties {
  return {
    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
    border: on ? "none" : "1.5px solid rgba(255,255,255,0.25)",
    background: on ? "#0098EA" : "transparent",
    display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12,
  };
}
const hubRow: CSSProperties = {
  display: "flex", alignItems: "center", width: "100%", padding: "14px 12px", marginBottom: 8,
  borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)",
  color: "#e5e7eb", fontSize: 14, cursor: "pointer", fontFamily: "inherit",
};
const btnGray: CSSProperties = {
  flex: 1, padding: "13px 0", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.06)", color: "#e5e7eb", fontWeight: 700, fontSize: 13,
  cursor: "pointer", fontFamily: "inherit",
};
const btnBlue: CSSProperties = {
  flex: 1, padding: "13px 0", borderRadius: 14, border: "none", background: "#0098EA", color: "#fff",
  fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
};
const toastStyle: CSSProperties = {
  position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 400,
  background: "rgba(15,23,42,0.95)", border: "1px solid rgba(56,189,248,0.4)",
  color: "#e2e8f0", padding: "10px 16px", borderRadius: 12, fontSize: 13, fontWeight: 700,
};
