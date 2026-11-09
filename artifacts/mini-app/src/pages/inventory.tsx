import { useEffect, useState, type CSSProperties } from "react";
import { useTelegram, haptic } from "@/lib/telegram";
import { inventoryApi, type InventoryItem } from "@/lib/inventoryApi";
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

export default function InventoryPage() {
  const { telegramId } = useTelegram();
  const [items, setItems] = useState<InventoryItem[]>(() => getInventoryCache()?.inventory ?? []);
  const [loading, setLoading] = useState(() => !getInventoryCache());
  const [tab, setTab] = useState<"gifts" | "listed">("gifts");
  const [selected, setSelected] = useState<InventoryItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getInventoryCache()) setLoading(true);
      try {
        const d = await inventoryApi.get();
        setInventoryCache(d);
        if (!cancelled) setItems(d.inventory ?? []);
      } catch {
        if (!cancelled && !getInventoryCache()) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [telegramId]);

  const sell = async (item: InventoryItem) => {
    try {
      haptic("medium");
      await inventoryApi.sell(item.id);
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      setSelected(null);
      const d = await inventoryApi.get();
      setInventoryCache(d);
      setItems(d.inventory ?? []);
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={{ minHeight: "100%", padding: "16px 16px 28px", color: "#e2e8f0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Инвентарь</div>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>
          {loading ? "…" : items.length} шт.
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["gifts", "listed"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 12,
              border: "none",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
              background: tab === t ? "rgba(6,182,212,0.25)" : "rgba(30,41,59,0.6)",
              color: tab === t ? "#67e8f9" : "#94a3b8",
            }}
          >
            {t === "gifts" ? "Подарки" : "На маркете"}
          </button>
        ))}
      </div>

      {!loading && tab === "gifts" && items.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
          <div style={{ fontSize: 56, marginBottom: 12, opacity: 0.85 }}>🎁</div>
          Пусто — собери NFT в коллекции
        </div>
      )}

      {!loading && tab === "listed" && (
        <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
          Пока нет лотов на маркете
        </div>
      )}

      {!loading && tab === "gifts" && items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {items.map((item) => {
            const src = giftImg(item);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                style={{
                  textAlign: "left",
                  borderRadius: 16,
                  border: "1px solid rgba(6,182,212,0.25)",
                  background: "linear-gradient(160deg, rgba(15,23,42,0.98), rgba(8,12,24,0.98))",
                  padding: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "#e2e8f0",
                }}
              >
                <div style={{ height: 72, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {src ? (
                    <img src={src} alt="" style={{ width: 64, height: 64, objectFit: "contain" }} />
                  ) : (
                    <span style={{ fontSize: 36 }}>🎁</span>
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, marginTop: 8 }}>{item.nameRu}</div>
                <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 4 }}>
                  <span style={{ opacity: 0.8 }}>≈</span> {item.valueTon} TON
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
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
              background: "#0f172a",
              borderRadius: "20px 20px 0 0",
              padding: 20,
              paddingBottom: 32,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>{selected.nameRu}</div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 16 }}>≈ {selected.valueTon} TON</div>
            <button
              type="button"
              onClick={() => void sell(selected)}
              style={{
                width: "100%",
                padding: "14px 0",
                borderRadius: 14,
                border: "none",
                background: "linear-gradient(135deg,#0891b2,#06b6d4)",
                color: "#fff",
                fontWeight: 900,
                fontSize: 15,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Продать
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
