import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTelegram, haptic } from "@/lib/telegram";
import {
  loadNftMarketConfig,
  syncNftMarketConfigFromServer,
  type NftMarketConfig,
} from "@/lib/nftMarketConfig";

type MarketListing = {
  id: number;
  inventoryId?: number;
  sellerId: string;
  nftId: string;
  nameRu: string;
  nameEn?: string;
  imageUrl?: string | null;
  modelImageUrl?: string | null;
  symbolImageUrl?: string | null;
  patternImageUrl?: string | null;
  number?: number | null;
  model?: string | null;
  backdrop?: string | null;
  symbol?: string | null;
  backdropCenter?: string | null;
  backdropEdge?: string | null;
  collectionName?: string | null;
  kind?: string | null;
  ownedGiftId?: string | null;
  priceTon: number;
  listedAt?: string;
};

const API_COVER = (name: string) =>
  `https://api.changes.tg/original/${encodeURIComponent(name)}.png?size=256`;
const API_MODEL = (gift: string, model: string) =>
  `https://api.changes.tg/model/${encodeURIComponent(gift)}/${encodeURIComponent(model)}.png?size=256`;
const API_SYMBOL = (gift: string, symbol: string) =>
  `https://api.changes.tg/symbol/${encodeURIComponent(gift)}/${encodeURIComponent(symbol)}.png?size=128`;
const API_PATTERN = (gift: string, symbol: string) =>
  `https://api.changes.tg/pattern/${encodeURIComponent(gift)}/${encodeURIComponent(symbol)}.png?size=128`;

function giftBaseName(l: MarketListing): string {
  const raw =
    l.collectionName ||
    l.nameEn ||
    (l.nameRu || "").replace(/\s*#\d+\s*$/, "").trim() ||
    String(l.nftId || "").split("#")[0] ||
    "";
  return raw.replace(/\s*#\d+\s*$/, "").trim();
}

function fmtPrice(n: number): string {
  if (!n || n <= 0) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1).replace(/\.0$/, "");
  return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function TgGiftCard({ listing, size = 148 }: { listing: MarketListing; size?: number }) {
  const base = giftBaseName(listing);
  const center = listing.backdropCenter || "#4b5563";
  const edge = listing.backdropEdge || "#111827";
  const modelUrl =
    listing.modelImageUrl ||
    (listing.model ? API_MODEL(base, listing.model) : listing.imageUrl) ||
    API_COVER(base);
  const patternUrl =
    listing.patternImageUrl || (listing.symbol ? API_PATTERN(base, listing.symbol) : null);
  const symbolUrl =
    listing.symbolImageUrl || (listing.symbol ? API_SYMBOL(base, listing.symbol) : null);
  const radius = Math.round(size * 0.22);
  const modelSz = Math.round(size * 0.72);
  const symSz = Math.round(size * 0.2);
  const pat = Math.round(size * 0.26);
  const num = listing.number;

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        margin: "0 auto",
        borderRadius: radius,
        overflow: "hidden",
        background: `radial-gradient(circle at 50% 36%, ${center} 0%, ${edge} 72%, #05070d 100%)`,
        boxShadow: "0 12px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.1)",
        border: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      {patternUrl && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.28,
            backgroundImage: `url("${patternUrl}")`,
            backgroundSize: `${pat}px ${pat}px`,
            backgroundRepeat: "repeat",
            mixBlendMode: "soft-light",
            pointerEvents: "none",
          }}
        />
      )}
      {num != null && Number.isFinite(num) && num > 0 && (
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 0,
            right: 0,
            zIndex: 4,
            textAlign: "center",
            fontSize: Math.max(10, Math.round(size * 0.075)),
            fontWeight: 900,
            color: "rgba(255,255,255,0.92)",
            textShadow: "0 1px 4px rgba(0,0,0,0.65)",
          }}
        >
          #{num}
        </div>
      )}
      <img
        src={modelUrl || undefined}
        alt=""
        style={{
          position: "relative",
          zIndex: 2,
          width: modelSz,
          height: modelSz,
          objectFit: "contain",
          display: "block",
          margin: `${Math.round(size * 0.12)}px auto 0`,
          filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.45))",
        }}
        onError={(e) => {
          const el = e.currentTarget;
          if (!el.dataset.fb) {
            el.dataset.fb = "1";
            el.src = API_COVER(base);
          }
        }}
      />
      {symbolUrl && (
        <img
          src={symbolUrl}
          alt=""
          style={{
            position: "absolute",
            right: Math.round(size * 0.06),
            bottom: Math.round(size * 0.06),
            width: symSz,
            height: symSz,
            objectFit: "contain",
            zIndex: 3,
            filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.55))",
          }}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
    </div>
  );
}

export default function NftMarketPage() {
  useTelegram();
  const [cfg, setCfg] = useState<NftMarketConfig>(() => loadNftMarketConfig());
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"price_asc" | "price_desc" | "new">("new");
  const [selected, setSelected] = useState<MarketListing | null>(null);
  const [buying, setBuying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [buyEnabled, setBuyEnabled] = useState(false);

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

  const loadListings = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/mini/inventory/listings", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { listings?: MarketListing[]; buyEnabled?: boolean };
      setListings(Array.isArray(data.listings) ? data.listings : []);
      setBuyEnabled(Boolean(data.buyEnabled));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setListings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadListings();
  }, []);

  const filtered = useMemo(() => {
    let list = [...listings];
    const s = search.toLowerCase().trim();
    if (s) {
      list = list.filter((g) =>
        [g.nameRu, g.nameEn, g.nftId, g.model, g.backdrop, g.symbol, g.number != null ? `#${g.number}` : ""]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(s),
      );
    }
    list.sort((a, b) => {
      if (sort === "price_asc") return a.priceTon - b.priceTon;
      if (sort === "price_desc") return b.priceTon - a.priceTon;
      return String(b.listedAt ?? "").localeCompare(String(a.listedAt ?? ""));
    });
    return list;
  }, [listings, search, sort]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const handleBuy = async () => {
    if (!selected || buying) return;
    if (!cfg.buyEnabled && !buyEnabled) {
      flash("Покупка отключена");
      return;
    }
    setBuying(true);
    try {
      const res = await fetch("/api/mini/inventory/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventoryId: selected.inventoryId ?? selected.id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error || `HTTP ${res.status}`);
      flash("Куплено — смотри инвентарь");
      haptic("success");
      setSelected(null);
      void loadListings();
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e));
      haptic("error");
    } finally {
      setBuying(false);
    }
  };

  const canBuy = cfg.buyEnabled || buyEnabled;

  return (
    <div style={{ minHeight: "100%", background: "#0a0a0c", color: "#f3f4f6", paddingBottom: 100 }}>
      <div style={{ padding: "14px 16px 8px" }}>
        <div style={{ fontSize: 20, fontWeight: 900 }}>NFT Market</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
          Реальные unique-подарки · model · backdrop · symbol · #
        </div>
      </div>

      <div style={{ padding: "0 16px 12px", display: "flex", gap: 8 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск: имя, model, #номер…"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.05)",
            color: "#fff",
            fontSize: 13,
            fontFamily: "inherit",
          }}
        />
        <button
          type="button"
          onClick={() => setSort((s) => (s === "new" ? "price_asc" : s === "price_asc" ? "price_desc" : "new"))}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.05)",
            color: "#cbd5e1",
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {sort === "new" ? "новые" : sort === "price_asc" ? "↑ цена" : "↓ цена"}
        </button>
      </div>

      {!cfg.enabled && (
        <div style={{ margin: "0 16px 12px", padding: 14, borderRadius: 12, background: "rgba(239,68,68,0.12)", color: "#fca5a5", fontSize: 13 }}>
          NFT Market выключен в настройках
        </div>
      )}

      {loading && <div style={{ padding: 24, color: "#9ca3af", textAlign: "center" }}>Загрузка лотов…</div>}
      {loadError && <div style={{ padding: 24, color: "#f87171", textAlign: "center" }}>{loadError}</div>}

      {!loading && cfg.enabled && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "0 12px 24px" }}>
          {filtered.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                haptic("light");
                setSelected(g);
              }}
              style={{
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.08)",
                padding: "12px 10px",
                background: "linear-gradient(180deg, rgba(24,24,28,0.95), rgba(10,10,14,0.98))",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "center",
              }}
            >
              <TgGiftCard listing={g} size={132} />
              <div style={{ fontSize: 13, fontWeight: 800, marginTop: 8, color: "#f8fafc" }}>
                {g.nameRu}
                {g.number != null && g.number > 0 ? ` #${g.number}` : ""}
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3, minHeight: 28, lineHeight: 1.3 }}>
                {[g.model, g.backdrop, g.symbol].filter(Boolean).join(" · ") || "unique gift"}
              </div>
              <div
                style={{
                  marginTop: 8,
                  display: "inline-flex",
                  padding: "5px 12px",
                  borderRadius: 999,
                  background: "rgba(0,152,234,0.22)",
                  color: "#7dd3fc",
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                {fmtPrice(g.priceTon)} TON
              </div>
            </button>
          ))}
          {!filtered.length && (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#6b7280", padding: 36, fontSize: 13 }}>
              Пока нет лотов на продаже.
            </div>
          )}
        </div>
      )}

      {selected && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.72)",
            zIndex: 200,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 480,
              background: "#121214",
              borderRadius: "22px 22px 0 0",
              padding: "10px 16px 28px",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 12px" }} />
            <div style={{ textAlign: "center" }}>
              <TgGiftCard listing={selected} size={180} />
              <div style={{ marginTop: 12, fontSize: 18, fontWeight: 900 }}>
                {selected.nameRu}
                {selected.number != null && selected.number > 0 ? ` #${selected.number}` : ""}
              </div>
            </div>
            <div style={{ margin: "14px 0", padding: 12, borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}>
                <span style={{ color: "#9ca3af" }}>Model</span>
                <span style={{ fontWeight: 700 }}>{selected.model || "—"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}>
                <span style={{ color: "#9ca3af" }}>Backdrop</span>
                <span style={{ fontWeight: 700 }}>{selected.backdrop || "—"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}>
                <span style={{ color: "#9ca3af" }}>Symbol</span>
                <span style={{ fontWeight: 700 }}>{selected.symbol || "—"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 5px", fontSize: 13, borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 6 }}>
                <span style={{ color: "#94a3b8" }}>Цена</span>
                <span style={{ fontWeight: 900 }}>{fmtPrice(selected.priceTon)} TON</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 8 }}>
              <button type="button" onClick={() => setSelected(null)} style={{ padding: "13px 0", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: "#e5e7eb", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Закрыть
              </button>
              <button
                type="button"
                disabled={buying || !canBuy}
                onClick={() => void handleBuy()}
                style={{ padding: "13px 0", borderRadius: 14, border: "none", background: "#0098EA", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", opacity: buying || !canBuy ? 0.55 : 1 }}
              >
                {!canBuy ? "Покупка отключена" : buying ? "…" : `Купить · ${fmtPrice(selected.priceTon)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 400, background: "rgba(15,23,42,0.95)", border: "1px solid rgba(56,189,248,0.4)", color: "#e2e8f0", padding: "10px 16px", borderRadius: 12, fontSize: 13, fontWeight: 700 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
