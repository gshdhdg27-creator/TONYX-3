import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTelegram, haptic } from "@/lib/telegram";
import {
  loadNftMarketConfig,
  syncNftMarketConfigFromServer,
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
  const [sort, setSort] = useState<"price_asc" | "price_desc" | "name">("price_asc");
  const [selected, setSelected] = useState<GiftRow | null>(null);
  const [buying, setBuying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
    return () => {
      cancelled = true;
    };
  }, []);

  const priced = useMemo(
    () =>
      gifts
        .filter((g) => isGiftVisible(g.short, cfg))
        .map((g) => ({ ...g, price: effectivePrice(g.short, g.floor, cfg) })),
    [gifts, cfg],
  );

  const listings = useMemo(() => {
    let list = [...priced];
    const s = search.toLowerCase().trim();
    if (s) list = list.filter((g) => g.name.toLowerCase().includes(s) || g.short.toLowerCase().includes(s));
    list.sort((a, b) => {
      if (sort === "price_asc") return a.price - b.price;
      if (sort === "price_desc") return b.price - a.price;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [priced, search, sort]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const handleBuy = async () => {
    if (!selected || buying || !cfg.buyEnabled) return;
    setBuying(true);
    try {
      const r = await fetch("/api/mini/nft-market/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ short: selected.short, priceTon: selected.price }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error || `HTTP ${r.status}`);
      flash("Куплено");
      haptic("success");
      setSelected(null);
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e));
      haptic("error");
    } finally {
      setBuying(false);
    }
  };

  return (
    <div style={{ minHeight: "100%", background: "#0a0a0c", color: "#f3f4f6", paddingBottom: 100 }}>
      <div style={{ padding: "14px 16px 8px" }}>
        <div style={{ fontSize: 20, fontWeight: 900 }}>NFT Market</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>Telegram Gifts · floor prices</div>
      </div>

      <div style={{ padding: "0 16px 12px", display: "flex", gap: 8 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск…"
          style={{
            flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 13, fontFamily: "inherit",
          }}
        />
        <button
          type="button"
          onClick={() => setSort((s) => (s === "price_asc" ? "price_desc" : s === "price_desc" ? "name" : "price_asc"))}
          style={{
            padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.05)", color: "#cbd5e1", fontWeight: 700, fontSize: 12,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {sort === "price_asc" ? "↑ цена" : sort === "price_desc" ? "↓ цена" : "A–Z"}
        </button>
      </div>

      {!cfg.enabled && (
        <div style={{ margin: "0 16px", padding: 14, borderRadius: 12, background: "rgba(239,68,68,0.12)", color: "#fca5a5", fontSize: 13 }}>
          NFT Market выключен в настройках
        </div>
      )}

      {loading && <div style={{ padding: 24, color: "#9ca3af", textAlign: "center" }}>Загрузка…</div>}
      {loadError && <div style={{ padding: 24, color: "#f87171", textAlign: "center" }}>{loadError}</div>}

      {!loading && cfg.enabled && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 12px 24px" }}>
          {listings.map((g, i) => (
            <button
              key={g.short}
              type="button"
              onClick={() => { haptic("light"); setSelected(g); }}
              style={{
                borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", padding: 10,
                background: CARD_BG[i % CARD_BG.length], cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              }}
            >
              <img src={IMG(g.short)} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "contain" }} />
              <div style={{ fontSize: 13, fontWeight: 800, marginTop: 6, color: "#f8fafc" }}>{g.name}</div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>#{String(g.id).slice(-5)}</div>
              <div style={{
                marginTop: 8, display: "inline-flex", alignItems: "center", gap: 4,
                padding: "4px 10px", borderRadius: 999, background: "rgba(0,152,234,0.2)", color: "#7dd3fc", fontWeight: 800, fontSize: 12,
              }}>
                {fmtPrice(g.price)} TON
              </div>
            </button>
          ))}
          {!listings.length && (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#6b7280", padding: 32 }}>Ничего не найдено</div>
          )}
        </div>
      )}

      {selected && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{
              width: "100%", maxWidth: 480, background: "#121214", borderRadius: "22px 22px 0 0",
              padding: "10px 16px 28px", border: "1px solid rgba(255,255,255,0.06)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 12px" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ borderRadius: 18, background: CARD_BG[0], padding: 16, display: "inline-block" }}>
                <img src={IMG(selected.short)} alt={selected.name} style={{ width: 140, height: 140, objectFit: "contain" }} />
              </div>
              <div style={{ marginTop: 10, fontSize: 17, fontWeight: 800 }}>{selected.name}</div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>#{String(selected.id).slice(-6)}</div>
            </div>
            <div style={{ margin: "14px 0", padding: 12, borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
                <span style={{ color: "#9ca3af" }}>Floor</span><span>{fmtPrice(selected.floor)} TON</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
                <span style={{ color: "#9ca3af" }}>Getgems</span><span>{fmtPrice(selected.getgems)} TON</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
                <span style={{ color: "#9ca3af" }}>Мин. цена</span><span style={{ fontWeight: 800 }}>{fmtPrice(selected.price)} TON</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 8 }}>
              <button type="button" onClick={() => flash("Офферы скоро")} style={{
                padding: "13px 0", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.06)", color: "#e5e7eb", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              }}>Сделать оффер</button>
              <button
                type="button"
                disabled={buying || !cfg.buyEnabled}
                onClick={() => void handleBuy()}
                style={{
                  padding: "13px 0", borderRadius: 14, border: "none", background: "#0098EA", color: "#fff",
                  fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                  opacity: buying || !cfg.buyEnabled ? 0.55 : 1,
                }}
              >
                {!cfg.buyEnabled ? "Покупка отключена" : buying ? "…" : `Купить · ${fmtPrice(selected.price)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 400,
          background: "rgba(15,23,42,0.95)", border: "1px solid rgba(56,189,248,0.4)", color: "#e2e8f0",
          padding: "10px 16px", borderRadius: 12, fontSize: 13, fontWeight: 700,
        }}>{toast}</div>
      )}
    </div>
  );
}
