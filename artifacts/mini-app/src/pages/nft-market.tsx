import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTelegram, haptic } from "@/lib/telegram";
import {
  loadNftMarketConfig,
  syncNftMarketConfigFromServer,
  type NftMarketConfig,
} from "@/lib/nftMarketConfig";

type Lot = {
  id: number;
  inventoryId: number;
  sellerId: string;
  nftId: string;
  nameRu: string;
  nameEn?: string;
  imageUrl: string | null;
  model?: string | null;
  backdrop?: string | null;
  symbol?: string | null;
  priceTon: number;
  listedAt?: string;
};

type Sort = "price_asc" | "price_desc" | "new";

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
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [selected, setSelected] = useState<Lot | null>(null);
  const [buying, setBuying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [serverBuy, setServerBuy] = useState(false);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const loadLots = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/mini/inventory/listings", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        listings?: Array<Record<string, unknown>>;
        buyEnabled?: boolean;
        enabled?: boolean;
      };

      if (data.enabled === false) {
        setCfg((c) => ({ ...c, enabled: false }));
      }
      setServerBuy(Boolean(data.buyEnabled));

      const rows: Lot[] = (data.listings ?? []).map((x) => ({
        id: Number(x.id ?? x.inventoryId),
        inventoryId: Number(x.inventoryId ?? x.id),
        sellerId: String(x.sellerId ?? ""),
        nftId: String(x.nftId ?? ""),
        nameRu: String(x.nameRu ?? x.giftName ?? x.nftId ?? "NFT"),
        nameEn: x.nameEn != null ? String(x.nameEn) : undefined,
        imageUrl: (x.imageUrl as string) || null,
        model: (x.model as string) || null,
        backdrop: (x.backdrop as string) || null,
        symbol: (x.symbol as string) || null,
        priceTon: Number(x.priceTon) || 0,
        listedAt: x.listedAt != null ? String(x.listedAt) : undefined,
      }));
      setLots(rows);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setLots([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadLots();
  }, [loadLots]);

  const visible = useMemo(() => {
    let list = [...lots];
    const q = search.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (g) =>
          g.nameRu.toLowerCase().includes(q) ||
          g.nftId.toLowerCase().includes(q) ||
          (g.model && g.model.toLowerCase().includes(q)) ||
          (g.sellerId && g.sellerId.includes(q)),
      );
    }
    if (sort === "price_asc") list.sort((a, b) => a.priceTon - b.priceTon);
    else if (sort === "price_desc") list.sort((a, b) => b.priceTon - a.priceTon);
    else
      list.sort((a, b) => String(b.listedAt ?? "").localeCompare(String(a.listedAt ?? "")));
    return list;
  }, [lots, search, sort]);

  const buyEnabled = cfg.buyEnabled || serverBuy;

  const handleBuy = async () => {
    if (!selected) return;
    haptic("medium");
    if (!buyEnabled) {
      flash("Покупка отключена админом");
      return;
    }
    setBuying(true);
    try {
      const res = await fetch("/api/mini/inventory/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventoryId: selected.inventoryId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error || `HTTP ${res.status}`);
      setSelected(null);
      flash("Куплено ✓");
      await loadLots();
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e));
    } finally {
      setBuying(false);
    }
  };

  const cycleSort = () => {
    setSort((s) => (s === "new" ? "price_asc" : s === "price_asc" ? "price_desc" : "new"));
  };

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
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
          Только реальные лоты игроков · {loading ? "…" : `${visible.length} на продаже`}
        </div>
        {!buyEnabled && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#fbbf24" }}>Покупка отключена админом</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, padding: "12px 14px" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск…"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(0,0,0,0.35)",
            color: "#e2e8f0",
            fontSize: 13,
            fontFamily: "inherit",
          }}
        />
        <button type="button" onClick={cycleSort} style={filterChip}>
          {sort === "price_asc" ? "↑ Цена" : sort === "price_desc" ? "↓ Цена" : "Новые"}
        </button>
        <button type="button" onClick={() => void loadLots()} style={filterChip}>
          ↻
        </button>
      </div>

      {loading && <div style={{ padding: 24, color: "#9ca3af", textAlign: "center" }}>Загрузка…</div>}
      {loadError && <div style={{ padding: 24, color: "#f87171", textAlign: "center" }}>{loadError}</div>}

      {!loading && !visible.length && (
        <div style={{ padding: "40px 24px", textAlign: "center", color: "#6b7280" }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Нет продаж</div>
          <div style={{ fontSize: 13, lineHeight: 1.4 }}>
            Сейчас никто не выставил NFT на продажу.
            <br />
            Когда лот появится — он будет здесь.
          </div>
        </div>
      )}

      {!loading && visible.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            padding: "0 12px 24px",
          }}
        >
          {visible.map((g, i) => (
            <button
              key={g.inventoryId}
              type="button"
              onClick={() => {
                haptic("light");
                setSelected(g);
              }}
              style={{
                textAlign: "left",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16,
                padding: 10,
                background: CARD_BG[i % CARD_BG.length],
                cursor: "pointer",
                fontFamily: "inherit",
                color: "#e2e8f0",
              }}
            >
              {g.imageUrl ? (
                <img
                  src={g.imageUrl}
                  alt=""
                  style={{ width: "100%", height: 90, objectFit: "contain" }}
                  loading="lazy"
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: 90,
                    borderRadius: 8,
                    background: "rgba(0,0,0,0.25)",
                  }}
                />
              )}
              <div style={{ fontSize: 12, fontWeight: 800, marginTop: 6 }}>{g.nameRu}</div>
              {(g.model || g.backdrop || g.symbol) && (
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                  {[g.model, g.backdrop, g.symbol].filter(Boolean).join(" · ")}
                </div>
              )}
              <div style={{ fontSize: 13, fontWeight: 900, color: "#7dd3fc", marginTop: 4 }}>
                {fmtPrice(g.priceTon)} TON
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 50,
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
              background: "#0f172a",
              borderRadius: "20px 20px 0 0",
              padding: 16,
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {selected.imageUrl ? (
                <img
                  src={selected.imageUrl}
                  alt=""
                  style={{ width: 72, height: 72, objectFit: "contain", borderRadius: 10 }}
                />
              ) : (
                <div style={{ width: 72, height: 72, borderRadius: 10, background: "rgba(255,255,255,0.06)" }} />
              )}
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{selected.nameRu}</div>
                <div style={{ color: "#7dd3fc", fontWeight: 800, marginTop: 4 }}>
                  {fmtPrice(selected.priceTon)} TON
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                  {[selected.model, selected.backdrop, selected.symbol].filter(Boolean).join(" · ") ||
                    selected.nftId}
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>seller {selected.sellerId}</div>
              </div>
            </div>
            <button
              type="button"
              disabled={buying || !buyEnabled}
              onClick={() => void handleBuy()}
              style={{
                width: "100%",
                marginTop: 14,
                padding: 14,
                borderRadius: 14,
                border: "none",
                background: buyEnabled
                  ? "linear-gradient(135deg,#0369a1,#38bdf8)"
                  : "rgba(100,116,139,0.4)",
                color: "#fff",
                fontWeight: 800,
                fontSize: 14,
                cursor: buyEnabled ? "pointer" : "not-allowed",
                fontFamily: "inherit",
                opacity: buying ? 0.7 : 1,
              }}
            >
              {!buyEnabled
                ? "Покупка отключена"
                : buying
                  ? "…"
                  : `Купить · ${fmtPrice(selected.priceTon)} TON`}
            </button>
            <button
              type="button"
              onClick={() => setSelected(null)}
              style={{
                width: "100%",
                marginTop: 8,
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "transparent",
                color: "#94a3b8",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            left: 16,
            right: 16,
            bottom: 90,
            zIndex: 60,
            background: "rgba(15,23,42,0.95)",
            border: "1px solid rgba(56,189,248,0.35)",
            borderRadius: 12,
            padding: 12,
            textAlign: "center",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

const filterChip: CSSProperties = {
  flexShrink: 0,
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
  color: "#9ca3af",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};
