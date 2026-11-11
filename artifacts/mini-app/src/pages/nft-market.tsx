import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTelegram, haptic } from "@/lib/telegram";
import {
  loadNftMarketConfig,
  effectivePrice,
  isGiftVisible,
  type NftMarketConfig,
} from "@/lib/nftMarketConfig";

const PRICES_URL =
  "https://cdn.jsdelivr.net/gh/ssamy2/TelegramGiftsAssests@main/Gifts_Details.json";
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
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1).replace(/\.0$/, "");
  return n.toFixed(2).replace(/0$/, "").replace(/\.$/, "");
}

const CARD_BG = [
  "linear-gradient(165deg, #2a3a4a 0%, #1a2838 55%, #121c28 100%)",
  "linear-gradient(165deg, #2a4a3a 0%, #1a3028 55%, #12201c 100%)",
  "linear-gradient(165deg, #3a2a4a 0%, #281a38 55%, #1c1228 100%)",
  "linear-gradient(165deg, #4a3a2a 0%, #38281a 55%, #281c12 100%)",
  "linear-gradient(165deg, #2a3a5a 0%, #1a2840 55%, #121c30 100%)",
  "linear-gradient(165deg, #3a2a3a 0%, #281a28 55%, #1c121c 100%)",
  "linear-gradient(165deg, #2a4a4a 0%, #1a3030 55%, #122020 100%)",
  "linear-gradient(165deg, #4a2a3a 0%, #381a28 55%, #28121c 100%)",
];

type CatTab = "all" | "collections" | "stars";
type Sort = "price_asc" | "price_desc" | "name";

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
  const [pickCollection, setPickCollection] = useState<string | null>(null);

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

  const listings = useMemo(() => {
    let list = [...priced];
    if (pickCollection) list = list.filter((g) => g.name === pickCollection);
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
  }, [priced, search, sort, cfg.featured, pickCollection]);

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
          <button type="button" style={filterChip} onClick={cycleSort}>☰</button>
          <button type="button" onClick={cycleSort} style={filterChip}>↕</button>
          <button
            type="button"
            onClick={() => {
              if (pickCollection) setPickCollection(null);
              else flash("Откройте вкладку Коллекции и выберите");
            }}
            style={{
              ...filterPill,
              color: pickCollection ? "#7dd3fc" : "#d1d5db",
            }}
          >
            {pickCollection ? `Коллекция · ${pickCollection.slice(0, 12)}` : "Коллекция ▾"}
          </button>
          <button type="button" style={filterPill} onClick={() => flash("Фильтр модели скоро")}>
            Модель ▾
          </button>
          <button type="button" style={filterPill} onClick={() => flash("Фильтр фона скоро")}>
            Фон ▾
          </button>
          <button type="button" style={filterPill} onClick={() => flash("Фильтр символа скоро")}>
            Символ ▾
          </button>
        </div>
      )}

      {!cfg.enabled && cat === "all" && <div style={closedBox}>Маркет временно закрыт</div>}

      {loading && cfg.enabled && cat !== "stars" && (
        <div style={{ textAlign: "center", color: "#6b7280", padding: 48, fontSize: 13 }}>Загрузка…</div>
      )}

      {loadError && !loading && cfg.enabled && cat === "all" && (
        <div style={{ textAlign: "center", color: "#f87171", padding: 24, fontSize: 13 }}>
          Не удалось загрузить цены: {loadError}
        </div>
      )}

      {!loading && !loadError && cfg.enabled && cat === "all" && (
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
              <div style={badgeRow}>
                <span style={badgeGreen}>☘</span>
                <span style={badgePurple}>↗</span>
              </div>
              <div style={imgWrap}>
                <img
                  src={IMG(g.short)}
                  alt={g.name}
                  loading="lazy"
                  style={img}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.opacity = "0.25";
                  }}
                />
              </div>
              <div style={cardBody}>
                <div style={cardName}>{g.name}</div>
                <div style={cardId}>#{String(g.id).slice(-5)}</div>
                <div style={priceRow}>
                  <div style={priceBtn}>
                    <TonIcon size={13} />
                    <span>{fmtPrice(g.price)}</span>
                  </div>
                  <span style={cartBtn}>🛒</span>
                </div>
              </div>
            </button>
          ))}
          {listings.length === 0 && (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#6b7280", padding: 40 }}>
              Ничего не найдено
            </div>
          )}
        </div>
      )}

      {!loading && cfg.enabled && cat === "collections" && (
        <div style={{ padding: "0 12px 24px" }}>
          {collectionRows.map((c) => (
            <button
              key={c.short}
              type="button"
              onClick={() => {
                setPickCollection(c.name);
                setSearch("");
                setCat("all");
                haptic("light");
              }}
              style={colRow}
            >
              <img src={IMG(c.short)} alt="" style={colImg} loading="lazy" />
              <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#f3f4f6" }}>{c.name}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{fmtPrice(c.price)}</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>floor</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {cat === "stars" && (
        <div style={{ padding: "12px 16px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 8 }}>⭐</div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Купить звёзды Telegram</div>
          <div style={{ fontSize: 13, color: "#9ca3af", margin: "6px 0 16px" }}>
            Купите себе или друзьям
          </div>
          <div className="p-scroll" style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 14, justifyContent: "center" }}>
            {[50, 100, 250, 500, 1000].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => flash(`Выбрано ${n} Stars`)}
                style={{
                  padding: "10px 14px", borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)",
                  color: "#f3f4f6", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                ⭐ {n}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => flash("Покупка Stars скоро")} style={btnBlueFull}>
            Купить Stars
          </button>
        </div>
      )}

      {selected && (
        <div style={modalOverlay} onClick={() => setSelected(null)}>
          <div style={modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={modalHandle} />
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
    </div>
  );
}

function TonIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-hidden>
      <path d="M28 8L10 18.5v9.5c0 11.2 7.8 21.6 18 24.5 10.2-2.9 18-13.3 18-24.5v-9.5L28 8z" fill="#0098EA" />
      <path d="M28.5 20v16.2l10.8-6.1V22.8L28.5 20z" fill="#fff" fillOpacity={0.9} />
      <path d="M28.5 20L17.7 22.8v7.3l10.8 6.1V20z" fill="#fff" />
    </svg>
  );
}

const page: CSSProperties = {
  minHeight: "100%", paddingTop: 52, paddingBottom: 24, color: "#e5e7eb", background: "#0b0b0d",
};
const banner: CSSProperties = {
  margin: "0 14px 12px", padding: "12px 14px", borderRadius: 16,
  background: "linear-gradient(135deg,#1a0a3a 0%,#2a1050 40%,#0d1a3a 100%)",
  border: "1px solid rgba(168,85,247,0.25)", display: "flex", alignItems: "center", justifyContent: "space-between",
};
const timerPill: CSSProperties = {
  display: "inline-block", marginTop: 6, background: "#ec4899", color: "#fff",
  fontSize: 12, fontWeight: 800, padding: "3px 10px", borderRadius: 999,
};
const catRow: CSSProperties = {
  display: "flex", gap: 8, padding: "4px 14px 12px", justifyContent: "space-around",
};
const catBtn: CSSProperties = {
  flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
  background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0,
};
function catIconBox(on: boolean): CSSProperties {
  return {
    width: 48, height: 48, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 22, background: on ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
    border: on ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.06)",
  };
}
const searchWrap: CSSProperties = {
  display: "flex", alignItems: "center", background: "rgba(255,255,255,0.06)", borderRadius: 14,
  padding: "0 8px 0 14px", height: 42, border: "1px solid rgba(255,255,255,0.06)",
};
const searchInput: CSSProperties = {
  flex: 1, background: "transparent", border: "none", outline: "none", color: "#f3f4f6",
  fontSize: 14, fontFamily: "inherit",
};
const iconRound: CSSProperties = {
  width: 32, height: 32, borderRadius: 10, border: "none", background: "rgba(255,255,255,0.06)",
  color: "#9ca3af", fontSize: 14, cursor: "pointer", marginLeft: 4, fontFamily: "inherit",
};
const filterRow: CSSProperties = {
  display: "flex", gap: 8, padding: "0 14px 12px", overflowX: "auto", alignItems: "center",
};
const filterChip: CSSProperties = {
  width: 36, height: 32, borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.05)", color: "#9ca3af", fontSize: 13, cursor: "pointer",
  flexShrink: 0, fontFamily: "inherit",
};
const filterPill: CSSProperties = {
  height: 32, padding: "0 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.05)", color: "#d1d5db", fontSize: 12, fontWeight: 600,
  cursor: "pointer", flexShrink: 0, fontFamily: "inherit", whiteSpace: "nowrap",
};
const closedBox: CSSProperties = {
  margin: "0 14px 12px", padding: 20, borderRadius: 16, textAlign: "center",
  background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
  color: "#fca5a5", fontSize: 13, fontWeight: 700,
};
const grid: CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 14px 24px",
};
const card: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.06)", borderRadius: 18, padding: 0, overflow: "hidden",
  cursor: "pointer", fontFamily: "inherit", textAlign: "left", position: "relative",
  transition: "transform 0.12s ease",
};
const badgeRow: CSSProperties = {
  position: "absolute", top: 8, left: 8, right: 8, display: "flex", justifyContent: "space-between", zIndex: 2,
};
const badgeGreen: CSSProperties = {
  width: 26, height: 26, borderRadius: "50%", background: "rgba(34,197,94,0.25)",
  border: "1px solid rgba(34,197,94,0.4)", display: "flex", alignItems: "center",
  justifyContent: "center", fontSize: 12,
};
const badgePurple: CSSProperties = {
  width: 26, height: 26, borderRadius: "50%", background: "rgba(168,85,247,0.25)",
  border: "1px solid rgba(168,85,247,0.4)", display: "flex", alignItems: "center",
  justifyContent: "center", fontSize: 12,
};
const imgWrap: CSSProperties = {
  aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", padding: "28px 16px 8px",
};
const img: CSSProperties = { width: "82%", height: "82%", objectFit: "contain" };
const cardBody: CSSProperties = { padding: "0 10px 12px" };
const cardName: CSSProperties = {
  fontSize: 13, fontWeight: 700, color: "#f9fafb", lineHeight: 1.2,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
const cardId: CSSProperties = { fontSize: 11, color: "#6b7280", marginTop: 2, marginBottom: 8 };
const priceRow: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
};
const priceBtn: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5, background: "#0098EA", borderRadius: 999,
  padding: "6px 12px", fontSize: 13, fontWeight: 800, color: "#fff",
};
const cartBtn: CSSProperties = {
  width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.08)",
  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
};
const colRow: CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 8px",
  background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.05)",
  cursor: "pointer", fontFamily: "inherit", color: "#e5e7eb",
};
const colImg: CSSProperties = {
  width: 40, height: 40, objectFit: "contain", borderRadius: 10, background: "rgba(255,255,255,0.04)", flexShrink: 0,
};
const modalOverlay: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 200,
  display: "flex", alignItems: "flex-end", justifyContent: "center",
};
const modalSheet: CSSProperties = {
  width: "100%", maxWidth: 480, background: "#121214", borderRadius: "22px 22px 0 0",
  padding: "10px 16px 28px", border: "1px solid rgba(255,255,255,0.06)", borderBottom: "none",
};
const modalHandle: CSSProperties = {
  width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 12px",
};
const modalHero: CSSProperties = {
  position: "relative", display: "flex", flexDirection: "column", alignItems: "center",
  padding: "16px 12px 14px", borderRadius: 18,
  background: "linear-gradient(165deg,#3a3a2a 0%,#2a2818 100%)", marginBottom: 12,
};
const attrBox: CSSProperties = {
  background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: "4px 14px", marginBottom: 12,
  border: "1px solid rgba(255,255,255,0.05)",
};
const attrLine: CSSProperties = {
  display: "flex", justifyContent: "space-between", padding: "8px 0",
  borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 13,
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
const btnBlueFull: CSSProperties = {
  width: "100%", padding: "14px 0", borderRadius: 14, border: "none", background: "#0098EA",
  color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer", fontFamily: "inherit",
};
const toastStyle: CSSProperties = {
  position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 400,
  background: "rgba(15,23,42,0.95)", border: "1px solid rgba(56,189,248,0.4)",
  color: "#e2e8f0", padding: "10px 16px", borderRadius: 12, fontSize: 13, fontWeight: 700,
};
