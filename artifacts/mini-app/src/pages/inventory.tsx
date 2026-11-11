import { useEffect, useState, type CSSProperties } from "react";
import { useTelegram, haptic, hapticNotify } from "@/lib/telegram";
import {
  inventoryApi,
  notifyInventoryUpdated,
  type InventoryItem,
} from "@/lib/inventoryApi";
import { getInventoryCache, setInventoryCache } from "@/lib/dataCache";

const IMG = (short: string) =>
  `https://cdn.jsdelivr.net/gh/ssamy2/TG_Photos@main/webp/by_name/${short}.webp`;

function giftImg(item: InventoryItem): string | null {
  if (item.imageUrl) return item.imageUrl;
  const raw = (item.itemId || item.nameEn || item.nameRu || "").toLowerCase();
  const short = raw
    .replace(/[^a-z0-9\s_]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  if (!short) return null;
  return IMG(short);
}

function fmtPrice(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
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
];

export default function InventoryPage() {
  const { telegramId } = useTelegram();
  const [items, setItems] = useState<InventoryItem[]>(() => getInventoryCache()?.inventory ?? []);
  const [listed, setListed] = useState<InventoryItem[]>(() => getInventoryCache()?.listed ?? []);
  const [loading, setLoading] = useState(() => !getInventoryCache());
  const [tab, setTab] = useState<"gifts" | "listed">("gifts");
  const [topTab, setTopTab] = useState<"gifts" | "offers" | "history">("gifts");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      const d = await inventoryApi.get();
      setInventoryCache(d);
      setItems(d.inventory ?? []);
      setListed(d.listed ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getInventoryCache()) setLoading(true);
      try {
        const d = await inventoryApi.get();
        setInventoryCache(d);
        if (!cancelled) {
          setItems(d.inventory ?? []);
          setListed(d.listed ?? []);
        }
      } catch {
        if (!cancelled && !getInventoryCache()) {
          setItems([]);
          setListed([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const onUpd = () => {
      const hit = getInventoryCache();
      if (hit) {
        setItems(hit.inventory ?? []);
        setListed(hit.listed ?? []);
      }
      void reload();
    };
    window.addEventListener("tonyx-inventory-updated", onUpd);
    return () => {
      cancelled = true;
      window.removeEventListener("tonyx-inventory-updated", onUpd);
    };
  }, [telegramId]);

  const listForSale = async (item: InventoryItem) => {
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) {
      hapticNotify("error");
      return;
    }
    setBusy(true);
    try {
      haptic("medium");
      await inventoryApi.list(item.id, p);
      hapticNotify("success");
      setSelected(null);
      setPrice("");
      await reload();
      notifyInventoryUpdated();
    } catch {
      hapticNotify("error");
    } finally {
      setBusy(false);
    }
  };

  const unlist = async (item: InventoryItem) => {
    setBusy(true);
    try {
      await inventoryApi.unlist(item.id);
      hapticNotify("success");
      setSelected(null);
      await reload();
      notifyInventoryUpdated();
    } catch {
      hapticNotify("error");
    } finally {
      setBusy(false);
    }
  };

  const grid = (tab === "gifts" ? items : listed).filter((item) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const name = (item.nameRu || item.nameEn || item.itemId || "").toLowerCase();
    return name.includes(q) || String(item.id).includes(q);
  });

  return (
    <div style={page}>
      <style>{`
        .p-card:active { transform: scale(0.97); }
        .p-scroll::-webkit-scrollbar { display: none; }
        .p-input::placeholder { color: #6b7280; }
      `}</style>

      <div style={topTabs}>
        {(
          [
            ["gifts", "Гифты"],
            ["offers", "Офферы"],
            ["history", "История"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              haptic("light");
              setTopTab(k);
            }}
            style={{
              background: "transparent",
              border: "none",
              color: topTab === k ? "#fff" : "#6b7280",
              fontWeight: topTab === k ? 800 : 600,
              fontSize: 18,
              padding: "4px 10px 8px",
              cursor: "pointer",
              fontFamily: "inherit",
              borderBottom: topTab === k ? "2px solid #fff" : "2px solid transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {topTab !== "gifts" && (
        <div style={{ textAlign: "center", color: "#6b7280", padding: 48, fontSize: 13 }}>
          {topTab === "offers" ? "Офферы скоро" : "История скоро"}
        </div>
      )}

      {topTab === "gifts" && (
        <>
          <div style={segWrap}>
            <button type="button" onClick={() => setTab("gifts")} style={segBtn(tab === "gifts")}>
              Не выставл. {items.length}
            </button>
            <button type="button" onClick={() => setTab("listed")} style={segBtn(tab === "listed")}>
              Выставл. {listed.length}
            </button>
          </div>

          <div className="p-scroll" style={actionRow}>
            {(
              [
                ["➕", "Добавить"],
                ["↑", "Вывод"],
                ["↗", "Отправить"],
                ["🛒", "Продать"],
                ["🔨", "Крафт"],
              ] as const
            ).map(([icon, label]) => (
              <button key={label} type="button" style={actionBtn} onClick={() => haptic("light")}>
                <span style={actionIcon}>{icon}</span>
                <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600 }}>{label}</span>
              </button>
            ))}
          </div>

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
              <button type="button" style={iconRound}>≡</button>
            </div>
          </div>

          <div className="p-scroll" style={filterRow}>
            <button type="button" style={filterChip}>☰</button>
            <button type="button" style={filterChip}>↕</button>
            <button type="button" style={filterPill}>Коллекция ▾</button>
            <button type="button" style={filterPill}>Модель ▾</button>
          </div>

          {loading && (
            <div style={{ textAlign: "center", color: "#6b7280", padding: 40, fontSize: 13 }}>Загрузка…</div>
          )}

          {!loading && grid.length === 0 && (
            <div style={emptyBox}>
              <div style={{ fontSize: 56, marginBottom: 8 }}>🦩</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#f3f4f6", marginBottom: 6 }}>
                Если подарков нет
              </div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                {tab === "gifts" ? "Купите их на маркетплейсе" : "Нет лотов на продаже"}
              </div>
            </div>
          )}

          {!loading && grid.length > 0 && (
            <div style={gridStyle}>
              {grid.map((item, i) => {
                const src = giftImg(item);
                const showPrice = tab === "listed" ? item.listPriceTon : item.valueTon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="p-card"
                    onClick={() => {
                      haptic("light");
                      setSelected(item);
                      setPrice(
                        item.listPriceTon
                          ? String(item.listPriceTon)
                          : String(item.valueTon || ""),
                      );
                    }}
                    style={{ ...card, background: CARD_BG[i % CARD_BG.length] }}
                  >
                    <div style={badgeRow}>
                      <span style={badgeGreen}>☘</span>
                      <span style={badgePurple}>↗</span>
                    </div>
                    <div style={imgWrap}>
                      {src ? (
                        <img src={src} alt="" style={img} loading="lazy" />
                      ) : (
                        <span style={{ fontSize: 40 }}>🎁</span>
                      )}
                    </div>
                    <div style={cardBody}>
                      <div style={cardName}>{item.nameRu || item.nameEn || "Gift"}</div>
                      <div style={cardId}>#{String(item.id).slice(-5)}</div>
                      <div style={priceRow}>
                        <div style={priceBtn}>
                          <TonIcon size={13} />
                          <span>{fmtPrice(showPrice)}</span>
                        </div>
                        <span style={cartBtn}>🛒</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {selected && (
        <div style={modalOverlay} onClick={() => setSelected(null)}>
          <div style={modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={modalHandle} />
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              {giftImg(selected) ? (
                <img src={giftImg(selected)!} alt="" style={{ width: 100, height: 100, objectFit: "contain" }} />
              ) : (
                <div style={{ fontSize: 48 }}>🎁</div>
              )}
              <div style={{ fontSize: 17, fontWeight: 800, marginTop: 6 }}>
                {selected.nameRu || selected.nameEn || "Gift"}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>#{String(selected.id).slice(-6)}</div>
            </div>

            {tab === "gifts" ? (
              <>
                <label style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600 }}>Цена продажи (TON)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Например 2.5"
                  style={priceInput}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void listForSale(selected)}
                  style={{ ...btnBlue, opacity: busy ? 0.7 : 1 }}
                >
                  {busy ? "…" : "Выставить на маркет"}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void unlist(selected)}
                style={{ ...btnOrange, opacity: busy ? 0.7 : 1 }}
              >
                {busy ? "…" : "Снять с продажи"}
              </button>
            )}
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
const topTabs: CSSProperties = { display: "flex", gap: 4, padding: "4px 10px 10px" };
const segWrap: CSSProperties = {
  display: "flex", margin: "0 14px 12px", background: "rgba(255,255,255,0.06)", borderRadius: 999, padding: 3,
};
function segBtn(on: boolean): CSSProperties {
  return {
    flex: 1, padding: "9px 0", borderRadius: 999, border: "none",
    background: on ? "#fff" : "transparent", color: on ? "#0b0b0d" : "#9ca3af",
    fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
  };
}
const actionRow: CSSProperties = {
  display: "flex", gap: 6, padding: "0 14px 12px", overflowX: "auto", justifyContent: "space-between",
};
const actionBtn: CSSProperties = {
  flex: 1, minWidth: 56, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
  background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0,
};
const actionIcon: CSSProperties = {
  width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center",
  justifyContent: "center", fontSize: 18,
};
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
const emptyBox: CSSProperties = { textAlign: "center", padding: "48px 20px" };
const gridStyle: CSSProperties = {
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
const priceInput: CSSProperties = {
  width: "100%", boxSizing: "border-box", margin: "6px 0 14px", background: "rgba(0,0,0,0.35)",
  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px",
  color: "#f1f5f9", fontSize: 15, fontFamily: "inherit", outline: "none",
};
const btnBlue: CSSProperties = {
  width: "100%", padding: "14px 0", borderRadius: 14, border: "none", background: "#0098EA",
  color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer", fontFamily: "inherit",
};
const btnOrange: CSSProperties = {
  width: "100%", padding: "14px 0", borderRadius: 14, border: "none",
  background: "linear-gradient(135deg,#b45309,#f59e0b)", color: "#fff", fontWeight: 900,
  fontSize: 15, cursor: "pointer", fontFamily: "inherit",
};
