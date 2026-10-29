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
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

const CARD_BG = [
  "linear-gradient(160deg,#1a1030 0%,#0d1528 100%)",
  "linear-gradient(160deg,#0f1a2e 0%,#12203a 100%)",
  "linear-gradient(160deg,#1a1520 0%,#0e1628 100%)",
  "linear-gradient(160deg,#121a28 0%,#0a1220 100%)",
  "linear-gradient(160deg,#1c1430 0%,#101828 100%)",
  "linear-gradient(160deg,#0e1c24 0%,#0a141c 100%)",
];

type Tab = "items" | "collections";
type Sort = "price_asc" | "price_desc" | "name";

export default function NftMarketPage() {
  useTelegram();

  const [cfg, setCfg] = useState<NftMarketConfig>(() => loadNftMarketConfig());
  const [gifts, setGifts] = useState<GiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("items");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("price_asc");
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
        if (!cancelled) {
          setGifts(rows);
          setUpdatedAt(new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }));
        }
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
    const q = search.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.short.includes(q) ||
          g.id.includes(q),
      );
    }
    // featured first
    list.sort((a, b) => {
      const fa = cfg.featured.includes(a.short) ? 0 : 1;
      const fb = cfg.featured.includes(b.short) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      if (sort === "price_asc") return a.price - b.price;
      if (sort === "price_desc") return b.price - a.price;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [priced, search, sort, cfg.featured]);

  const collections = useMemo(() => {
    return [...priced].sort((a, b) => b.price - a.price);
  }, [priced]);

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
    await new Promise((r) => setTimeout(r, 800));
    setBuying(false);
    setSelected(null);
    flash("Скоро: покупка NFT будет доступна");
  };

  return (
    <div style={page}>
      <style>{`.nft-card:active { transform: scale(0.97); }`}</style>

      {toast && <div style={toastStyle}>{toast}</div>}

      {/* top padding under global Header balance */}
      <div style={header}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.2 }}>NFT Market</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            {cfg.bannerText}
            {updatedAt ? ` · ${updatedAt}` : ""}
          </div>
        </div>
      </div>

      {!cfg.enabled && (
        <div style={{ margin: "0 14px 12px", padding: 20, borderRadius: 16, textAlign: "center",
          background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "#fca5a5", fontSize: 13, fontWeight: 700 }}>
          Маркет временно закрыт
        </div>
      )}

      {cfg.enabled && (
        <div style={banner}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#e2e8f0" }}>
            🎁 {loading ? "…" : listings.length} лотов
            {cfg.markupPercent ? ` · +${cfg.markupPercent}%` : ""}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
            Цены от Portals floor · управление в админке → NFT
          </div>
        </div>
      )}

      {cfg.enabled && (
        <>
          <div style={tabsRow}>
            <button type="button" onClick={() => setTab("items")} style={tabBtn(tab === "items")}>
              All items
            </button>
            <button type="button" onClick={() => setTab("collections")} style={tabBtn(tab === "collections")}>
              Collections
            </button>
          </div>

          <div style={{ padding: "0 14px 10px" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto" }}>
              {(
                [
                  ["price_asc", "Цена ↑"],
                  ["price_desc", "Цена ↓"],
                  ["name", "Имя"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSort(k)}
                  style={{
                    ...chip,
                    borderColor: sort === k ? "rgba(56,189,248,0.5)" : "rgba(255,255,255,0.08)",
                    background: sort === k ? "rgba(56,189,248,0.15)" : "rgba(255,255,255,0.05)",
                    color: sort === k ? "#7dd3fc" : "#94a3b8",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or ID"
              style={searchInput}
            />
          </div>
        </>
      )}

      {loading && cfg.enabled && (
        <div style={{ textAlign: "center", color: "#64748b", padding: 40, fontSize: 13 }}>
          Загрузка актуальных цен…
        </div>
      )}

      {loadError && !loading && cfg.enabled && (
        <div style={{ textAlign: "center", color: "#f87171", padding: 24, fontSize: 13 }}>
          Не удалось загрузить цены: {loadError}
        </div>
      )}

      {!loading && !loadError && cfg.enabled && tab === "items" && (
        <div style={grid}>
          {listings.map((g, i) => (
            <button
              key={g.short}
              type="button"
              className="nft-card"
              onClick={() => {
                haptic("light");
                setSelected(g);
              }}
              style={{ ...card, background: CARD_BG[i % CARD_BG.length] }}
            >
              <div style={imgWrap}>
                <img
                  src={IMG(g.short)}
                  alt={g.name}
                  loading="lazy"
                  style={img}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.opacity = "0.3";
                  }}
                />
              </div>
              <div style={cardBody}>
                <div style={cardName}>
                  {cfg.featured.includes(g.short) ? "★ " : ""}{g.name}
                </div>
                <div style={cardId}>#{g.id.slice(-6)}</div>
                <div style={priceBtn}>
                  <TonIcon />
                  <span>{fmtPrice(g.price)}</span>
                </div>
              </div>
            </button>
          ))}
          {listings.length === 0 && (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#64748b", padding: 40 }}>
              Ничего не найдено
            </div>
          )}
        </div>
      )}

      {!loading && !loadError && cfg.enabled && tab === "collections" && (
        <div style={{ padding: "0 14px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
          {collections
            .filter((c) => {
              const q = search.toLowerCase().trim();
              if (!q) return true;
              return c.name.toLowerCase().includes(q) || c.short.includes(q);
            })
            .map((c) => (
              <button
                key={c.short}
                type="button"
                onClick={() => {
                  setSearch(c.name);
                  setTab("items");
                }}
                style={collectionRow}
              >
                <img src={IMG(c.short)} alt="" style={collectionImg} loading="lazy" />
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#e2e8f0" }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    Getgems {fmtPrice(c.getgems)} · Floor {fmtPrice(c.floor)}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#e2e8f0", display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                    <TonIcon size={12} />
                    {fmtPrice(c.price)}
                  </div>
                  <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>Sale</div>
                </div>
              </button>
            ))}
        </div>
      )}

      {selected && (
        <div style={modalOverlay} onClick={() => setSelected(null)}>
          <div style={modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>Купить подарок</div>
              <button type="button" onClick={() => setSelected(null)} style={closeBtn}>×</button>
            </div>

            <div style={modalHero}>
              <img src={IMG(selected.short)} alt={selected.name} style={{ width: 140, height: 140, objectFit: "contain" }} />
            </div>

            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{selected.name}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>#{selected.id}</div>
            </div>

            <div style={modalStats}>
              <div style={statCell}>
                <div style={statLabel}>Цена</div>
                <div style={statValue}><TonIcon /> {fmtPrice(selected.price)}</div>
              </div>
              <div style={statCell}>
                <div style={statLabel}>Portals floor</div>
                <div style={statValue}><TonIcon /> {fmtPrice(selected.floor)}</div>
              </div>
              <div style={statCell}>
                <div style={statLabel}>Getgems</div>
                <div style={statValue}><TonIcon /> {fmtPrice(selected.getgems)}</div>
              </div>
              <div style={statCell}>
                <div style={statLabel}>Сток</div>
                <div style={statValue}>
                  {cfg.stock[selected.short] == null ? "∞" : cfg.stock[selected.short]}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={buying || !cfg.buyEnabled}
              onClick={handleBuy}
              style={{ ...buyBtn, opacity: buying || !cfg.buyEnabled ? 0.55 : 1 }}
            >
              {!cfg.buyEnabled
                ? "Покупка отключена"
                : buying
                  ? "Обработка…"
                  : `Купить · ${fmtPrice(selected.price)} TON`}
            </button>
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
  minHeight: "100%",
  paddingTop: 56,
  paddingBottom: 20,
  color: "#e8e8ed",
  background: "transparent",
};
const header: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "8px 14px 8px",
};
const banner: CSSProperties = {
  margin: "0 14px 12px", padding: "12px 14px", borderRadius: 16,
  background: "linear-gradient(135deg, rgba(56,189,248,0.15), rgba(99,102,241,0.12))",
  border: "1px solid rgba(56,189,248,0.25)",
};
const tabsRow: CSSProperties = { display: "flex", gap: 8, padding: "0 14px 10px" };
function tabBtn(active: boolean): CSSProperties {
  return {
    flex: 1, padding: "10px 0", borderRadius: 12,
    border: active ? "1px solid rgba(56,189,248,0.45)" : "1px solid rgba(255,255,255,0.08)",
    background: active ? "rgba(56,189,248,0.14)" : "rgba(255,255,255,0.04)",
    color: active ? "#7dd3fc" : "#94a3b8", fontWeight: 800, fontSize: 13,
    cursor: "pointer", fontFamily: "inherit",
  };
}
const chip: CSSProperties = {
  flexShrink: 0, padding: "7px 12px", borderRadius: 999, border: "1px solid",
  fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};
const searchInput: CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "rgba(15,23,42,0.8)",
  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "11px 14px",
  color: "#e2e8f0", fontSize: 13, fontFamily: "inherit", outline: "none",
};
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 14px 24px" };
const card: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 0, overflow: "hidden",
  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
  boxShadow: "0 8px 24px rgba(0,0,0,0.35)", transition: "transform 0.15s ease",
};
const imgWrap: CSSProperties = {
  aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", padding: 12,
  background: "radial-gradient(circle at 50% 40%, rgba(255,255,255,0.06), transparent 70%)",
};
const img: CSSProperties = { width: "88%", height: "88%", objectFit: "contain" };
const cardBody: CSSProperties = { padding: "0 10px 12px" };
const cardName: CSSProperties = {
  fontSize: 13, fontWeight: 800, color: "#f1f5f9", lineHeight: 1.2,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
const cardId: CSSProperties = { fontSize: 11, color: "#64748b", marginTop: 2, marginBottom: 8 };
const priceBtn: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  background: "rgba(0,152,234,0.18)", border: "1px solid rgba(0,152,234,0.35)",
  borderRadius: 999, padding: "6px 10px", fontSize: 13, fontWeight: 800, color: "#e2e8f0",
};
const collectionRow: CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 14,
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
  cursor: "pointer", fontFamily: "inherit", width: "100%",
};
const collectionImg: CSSProperties = {
  width: 48, height: 48, objectFit: "contain", borderRadius: 12, background: "rgba(0,0,0,0.25)",
};
const modalOverlay: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 200,
  display: "flex", alignItems: "flex-end", justifyContent: "center",
};
const modalSheet: CSSProperties = {
  width: "100%", maxWidth: 480,
  background: "linear-gradient(180deg,#12141c 0%,#0a0c12 100%)",
  borderRadius: "22px 22px 0 0", padding: "18px 16px 28px",
  border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none",
};
const closeBtn: CSSProperties = {
  width: 32, height: 32, borderRadius: "50%", border: "none",
  background: "rgba(255,255,255,0.08)", color: "#94a3b8", fontSize: 20,
  cursor: "pointer", fontFamily: "inherit",
};
const modalHero: CSSProperties = {
  display: "flex", justifyContent: "center", padding: "8px 0 12px",
  background: "radial-gradient(circle at 50% 50%, rgba(56,189,248,0.12), transparent 65%)",
  borderRadius: 16, marginBottom: 8,
};
const modalStats: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 };
const statCell: CSSProperties = {
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12, padding: "10px 12px",
};
const statLabel: CSSProperties = { fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 4 };
const statValue: CSSProperties = { fontSize: 14, fontWeight: 800, color: "#e2e8f0", display: "flex", alignItems: "center", gap: 4 };
const buyBtn: CSSProperties = {
  width: "100%", padding: "14px 0", borderRadius: 14, border: "none",
  background: "linear-gradient(135deg,#0077b5,#0098EA)", color: "#fff",
  fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
};
const toastStyle: CSSProperties = {
  position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 400,
  background: "rgba(15,23,42,0.95)", border: "1px solid rgba(56,189,248,0.4)",
  color: "#e2e8f0", padding: "10px 16px", borderRadius: 12, fontSize: 13, fontWeight: 700,
};
