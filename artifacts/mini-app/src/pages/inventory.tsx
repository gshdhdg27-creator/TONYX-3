import { useEffect, useState, type CSSProperties } from "react";
import { useTelegram, haptic } from "@/lib/telegram";
import { inventoryApi, type InventoryItem } from "@/lib/inventoryApi";

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

export default function InventoryPage() {
  const { telegramId } = useTelegram();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"gifts" | "listed">("gifts");
  const [selected, setSelected] = useState<InventoryItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const d = await inventoryApi.get();
        if (!cancelled) setItems(d.inventory ?? []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [telegramId]);

  return (
    <div style={page}>
      <div style={header}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>My Gifts</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            Инвентарь · как Portals
          </div>
        </div>
        <div style={countPill}>
          {loading ? "…" : items.length} шт.
        </div>
      </div>

      <div style={tabsRow}>
        <button type="button" onClick={() => setTab("gifts")} style={tabBtn(tab === "gifts")}>
          Мои подарки
        </button>
        <button type="button" onClick={() => setTab("listed")} style={tabBtn(tab === "listed")}>
          На продаже
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: "center", color: "#64748b", padding: 48, fontSize: 13 }}>
          Загрузка инвентаря…
        </div>
      )}

      {!loading && tab === "gifts" && items.length === 0 && (
        <div style={emptyBox}>
          <div style={{ fontSize: 56, marginBottom: 12, opacity: 0.85 }}>🎁</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#e2e8f0", marginBottom: 8 }}>
            Пока пусто
          </div>
          <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5, maxWidth: 260 }}>
            Здесь появятся твои Telegram NFT-подарки после покупки на маркете или выигрыша.
          </div>
        </div>
      )}

      {!loading && tab === "listed" && (
        <div style={emptyBox}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏷</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0", marginBottom: 8 }}>
            Нет лотов
          </div>
          <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5, maxWidth: 260 }}>
            Выставленные на продажу подарки будут здесь.
          </div>
        </div>
      )}

      {!loading && tab === "gifts" && items.length > 0 && (
        <div style={grid}>
          {items.map((it) => {
            const src = giftImg(it);
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  haptic("light");
                  setSelected(it);
                }}
                style={card}
              >
                <div style={imgWrap}>
                  {src ? (
                    <img src={src} alt="" style={img} loading="lazy" />
                  ) : (
                    <div style={{ fontSize: 36 }}>🎁</div>
                  )}
                </div>
                <div style={cardBody}>
                  <div style={cardName}>{it.nameRu || it.nameEn || it.itemId}</div>
                  <div style={priceBtn}>
                    <span style={{ opacity: 0.8 }}>≈</span>
                    <span>{Number(it.valueTon).toFixed(2)} TON</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <div style={modalOverlay} onClick={() => setSelected(null)}>
          <div style={modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>Подарок</div>
              <button type="button" onClick={() => setSelected(null)} style={closeBtn}>×</button>
            </div>
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              {giftImg(selected) ? (
                <img src={giftImg(selected)!} alt="" style={{ width: 140, height: 140, objectFit: "contain" }} />
              ) : (
                <div style={{ fontSize: 64 }}>🎁</div>
              )}
              <div style={{ fontSize: 18, fontWeight: 900, marginTop: 8 }}>
                {selected.nameRu || selected.nameEn}
              </div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                ~{Number(selected.valueTon).toFixed(2)} TON
              </div>
            </div>
            <button type="button" onClick={() => setSelected(null)} style={buyBtn}>
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const page: CSSProperties = { minHeight: "100%", paddingTop: 56, paddingBottom: 24, color: "#e8e8ed" };
const header: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px 8px",
};
const countPill: CSSProperties = {
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 999, padding: "8px 12px", fontSize: 13, fontWeight: 800, color: "#94a3b8",
};
const tabsRow: CSSProperties = { display: "flex", gap: 8, padding: "0 14px 12px" };
function tabBtn(active: boolean): CSSProperties {
  return {
    flex: 1, padding: "10px 0", borderRadius: 12,
    border: active ? "1px solid rgba(56,189,248,0.45)" : "1px solid rgba(255,255,255,0.08)",
    background: active ? "rgba(56,189,248,0.14)" : "rgba(255,255,255,0.04)",
    color: active ? "#7dd3fc" : "#94a3b8", fontWeight: 800, fontSize: 13,
    cursor: "pointer", fontFamily: "inherit",
  };
}
const emptyBox: CSSProperties = {
  margin: "24px 14px", padding: "40px 20px", borderRadius: 20, textAlign: "center",
  background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.12)",
};
const grid: CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 14px 24px",
};
const card: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 0, overflow: "hidden",
  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
  background: "linear-gradient(160deg,#121a28 0%,#0a1220 100%)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
};
const imgWrap: CSSProperties = {
  aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", padding: 12,
};
const img: CSSProperties = { width: "88%", height: "88%", objectFit: "contain" };
const cardBody: CSSProperties = { padding: "0 10px 12px" };
const cardName: CSSProperties = {
  fontSize: 13, fontWeight: 800, color: "#f1f5f9", marginBottom: 8,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
const priceBtn: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  background: "rgba(0,152,234,0.18)", border: "1px solid rgba(0,152,234,0.35)",
  borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 800, color: "#e2e8f0",
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
const buyBtn: CSSProperties = {
  width: "100%", padding: "14px 0", borderRadius: 14, border: "none",
  background: "rgba(255,255,255,0.08)", color: "#e2e8f0",
  fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
};
