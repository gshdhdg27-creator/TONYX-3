import { useEffect, useMemo, useState } from "react";
import {
  loadNftMarketConfig,
  saveNftMarketConfig,
  type NftMarketConfig,
  effectivePrice,
} from "@/lib/nftMarketConfig";

const PRICES_URL =
  "https://cdn.jsdelivr.net/gh/ssamy2/TelegramGiftsAssests@main/Gifts_Details.json";
const IMG = (short: string) =>
  `https://cdn.jsdelivr.net/gh/ssamy2/TG_Photos@main/webp/by_name/${short}.webp`;

type Gift = {
  name: string;
  short: string;
  floor: number;
};

export function NftMarketAdminTab() {
  const [cfg, setCfg] = useState<NftMarketConfig>(() => loadNftMarketConfig());
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState(false);
  const [editShort, setEditShort] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editStock, setEditStock] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(PRICES_URL, { cache: "no-store" });
        const data = (await res.json()) as {
          upgraded?: {
            full_name: string;
            short_name: string;
            portal_price_ton?: number;
            floor_price_ton?: number;
          }[];
        };
        const rows: Gift[] = (data.upgraded ?? [])
          .map((g) => ({
            name: g.full_name,
            short: g.short_name,
            floor:
              Number(g.portal_price_ton) ||
              Number(g.floor_price_ton) ||
              0,
          }))
          .filter((g) => g.short && g.floor > 0)
          .sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) setGifts(rows);
      } catch {
        if (!cancelled) setGifts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return gifts;
    return gifts.filter(
      (g) => g.name.toLowerCase().includes(q) || g.short.includes(q),
    );
  }, [gifts, search]);

  const visibleCount = useMemo(() => {
    if (!cfg.enabled) return 0;
    return gifts.filter((g) => {
      if (cfg.hidden.includes(g.short)) return false;
      if (cfg.whitelist.length && !cfg.whitelist.includes(g.short)) return false;
      if (cfg.stock[g.short] === 0) return false;
      return true;
    }).length;
  }, [gifts, cfg]);

  const patch = (partial: Partial<NftMarketConfig>) => {
    setCfg((prev) => ({ ...prev, ...partial }));
  };

  const persist = (next?: NftMarketConfig) => {
    const toSave = next ?? cfg;
    saveNftMarketConfig(toSave);
    setCfg(toSave);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const toggleHidden = (short: string) => {
    const hidden = cfg.hidden.includes(short)
      ? cfg.hidden.filter((s) => s !== short)
      : [...cfg.hidden, short];
    const next = { ...cfg, hidden };
    setCfg(next);
  };

  const toggleFeatured = (short: string) => {
    const featured = cfg.featured.includes(short)
      ? cfg.featured.filter((s) => s !== short)
      : [...cfg.featured, short];
    const next = { ...cfg, featured };
    setCfg(next);
  };

  const toggleWhitelist = (short: string) => {
    const whitelist = cfg.whitelist.includes(short)
      ? cfg.whitelist.filter((s) => s !== short)
      : [...cfg.whitelist, short];
    const next = { ...cfg, whitelist };
    setCfg(next);
  };

  const applyPriceEdit = () => {
    if (!editShort) return;
    const n = parseFloat(editPrice.replace(",", "."));
    const overrides = { ...cfg.priceOverrides };
    if (!Number.isFinite(n) || n <= 0) delete overrides[editShort];
    else overrides[editShort] = n;
    const stock = { ...cfg.stock };
    if (editStock.trim() === "") delete stock[editShort];
    else {
      const s = parseInt(editStock, 10);
      if (Number.isFinite(s) && s >= 0) stock[editShort] = s;
    }
    const next = { ...cfg, priceOverrides: overrides, stock };
    setCfg(next);
    setEditShort(null);
  };

  const hideAll = () => {
    const next = { ...cfg, hidden: gifts.map((g) => g.short) };
    setCfg(next);
  };

  const showAll = () => {
    const next = { ...cfg, hidden: [], whitelist: [] };
    setCfg(next);
  };

  return (
    <div style={{ padding: "0 0 40px", color: "#e2e8f0" }}>
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>NFT Market · управление</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
          Лоты, цены, наличие, покупка. Сохраняется на этом устройстве (localStorage).
        </div>

        <Toggle
          label="Маркет включён"
          hint={cfg.enabled ? `${visibleCount} лотов видно` : "Пользователи видят пусто"}
          on={cfg.enabled}
          onChange={(v) => patch({ enabled: v })}
        />
        <Toggle
          label="Покупка доступна"
          hint={cfg.buyEnabled ? "Кнопка Купить активна" : "Только просмотр"}
          on={cfg.buyEnabled}
          onChange={(v) => patch({ buyEnabled: v })}
        />

        <div style={{ marginTop: 12 }}>
          <label style={label}>Наценка к floor Portals, %</label>
          <input
            type="number"
            value={cfg.markupPercent}
            onChange={(e) => patch({ markupPercent: Number(e.target.value) || 0 })}
            style={input}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={label}>Текст баннера</label>
          <input
            value={cfg.bannerText}
            onChange={(e) => patch({ bannerText: e.target.value })}
            style={input}
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button type="button" onClick={() => persist()} style={btnPrimary}>
            {saved ? "✓ Сохранено" : "Сохранить"}
          </button>
          <button type="button" onClick={showAll} style={btnGhost}>Показать все</button>
          <button type="button" onClick={hideAll} style={btnGhost}>Скрыть все</button>
          <button
            type="button"
            onClick={() => {
              const next = {
                ...cfg,
                priceOverrides: {},
                stock: {},
                featured: [],
                markupPercent: 0,
              };
              setCfg(next);
            }}
            style={btnGhost}
          >
            Сброс цен/стока
          </button>
        </div>
      </div>

      <div style={{ ...card, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Каталог ({gifts.length})</div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск…"
            style={{ ...input, width: 140, margin: 0 }}
          />
        </div>

        {loading && <div style={{ color: "#64748b", fontSize: 13 }}>Загрузка каталога…</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 480, overflowY: "auto" }}>
          {filtered.map((g) => {
            const hidden = cfg.hidden.includes(g.short);
            const featured = cfg.featured.includes(g.short);
            const inWhite = cfg.whitelist.includes(g.short);
            const price = effectivePrice(g.short, g.floor, cfg);
            const stock = cfg.stock[g.short];
            return (
              <div
                key={g.short}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  padding: "10px 10px",
                  borderRadius: 14,
                  background: hidden ? "rgba(248,113,113,0.08)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${hidden ? "rgba(248,113,113,0.25)" : "rgba(255,255,255,0.08)"}`,
                  opacity: hidden ? 0.7 : 1,
                }}
              >
                <img
                  src={IMG(g.short)}
                  alt=""
                  style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 10, background: "rgba(0,0,0,0.25)" }}
                  loading="lazy"
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {g.name}{featured ? " ★" : ""}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    floor {g.floor.toFixed(2)} → <b style={{ color: "#7dd3fc" }}>{price.toFixed(2)} TON</b>
                    {stock != null ? ` · stock ${stock}` : ""}
                    {cfg.priceOverrides[g.short] != null ? " · custom" : ""}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <button type="button" style={miniBtn} onClick={() => toggleHidden(g.short)}>
                    {hidden ? "Показать" : "Скрыть"}
                  </button>
                  <button type="button" style={miniBtn} onClick={() => toggleFeatured(g.short)}>
                    {featured ? "★" : "☆"}
                  </button>
                  <button
                    type="button"
                    style={miniBtn}
                    onClick={() => {
                      setEditShort(g.short);
                      setEditPrice(String(cfg.priceOverrides[g.short] ?? ""));
                      setEditStock(stock != null ? String(stock) : "");
                    }}
                  >
                    Цена
                  </button>
                  <button type="button" style={miniBtn} onClick={() => toggleWhitelist(g.short)}>
                    {inWhite ? "WL✓" : "WL"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {cfg.whitelist.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 11, color: "#fbbf24" }}>
            Whitelist активен: только {cfg.whitelist.length} подарков. Очисти WL кнопкой «Показать все».
          </div>
        )}
      </div>

      {editShort && (
        <div style={modalBg} onClick={() => setEditShort(null)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 12 }}>Цена / stock · {editShort}</div>
            <label style={label}>Своя цена TON (пусто = floor+наценка)</label>
            <input value={editPrice} onChange={(e) => setEditPrice(e.target.value)} style={input} placeholder="например 12.5" />
            <label style={{ ...label, marginTop: 10 }}>Сток (пусто = ∞, 0 = sold out)</label>
            <input value={editStock} onChange={(e) => setEditStock(e.target.value)} style={input} placeholder="∞" />
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button type="button" style={btnPrimary} onClick={applyPriceEdit}>Применить</button>
              <button type="button" style={btnGhost} onClick={() => setEditShort(null)}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({
  label, hint, on, onChange,
}: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 14px", borderRadius: 14, marginBottom: 8,
        border: `1px solid ${on ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.1)"}`,
        background: on ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)",
        cursor: "pointer", fontFamily: "inherit", color: "#e2e8f0", textAlign: "left",
      }}
    >
      <div>
        <div style={{ fontWeight: 800, fontSize: 13 }}>{label}</div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{hint}</div>
      </div>
      <div style={{
        width: 44, height: 26, borderRadius: 999, padding: 3,
        background: on ? "#22c55e" : "rgba(255,255,255,0.15)",
        transition: "background 0.2s",
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: "50%", background: "#fff",
          transform: on ? "translateX(18px)" : "translateX(0)", transition: "transform 0.2s",
        }} />
      </div>
    </button>
  );
}

const card: React.CSSProperties = {
  background: "rgba(15,23,42,0.7)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 18, padding: 14,
};
const label: React.CSSProperties = { display: "block", fontSize: 11, color: "#64748b", fontWeight: 700, marginBottom: 6 };
const input: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.35)",
  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "10px 12px",
  color: "#e2e8f0", fontSize: 13, fontFamily: "inherit", outline: "none",
};
const btnPrimary: React.CSSProperties = {
  padding: "10px 16px", borderRadius: 12, border: "none",
  background: "linear-gradient(135deg,#0891b2,#22d3ee)", color: "#fff",
  fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
};
const btnGhost: React.CSSProperties = {
  padding: "10px 12px", borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)",
  color: "#94a3b8", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
};
const miniBtn: React.CSSProperties = {
  padding: "4px 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)", color: "#cbd5e1", fontSize: 10, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
};
const modalBg: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 300,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
};
const modal: React.CSSProperties = {
  width: "100%", maxWidth: 360, background: "#0f172a", borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.1)", padding: 16,
};
