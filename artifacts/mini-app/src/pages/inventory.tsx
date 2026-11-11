import { useEffect, useState } from "react";
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

export default function InventoryPage() {
  const { telegramId } = useTelegram();
  const [items, setItems] = useState<InventoryItem[]>(() => getInventoryCache()?.inventory ?? []);
  const [listed, setListed] = useState<InventoryItem[]>(() => getInventoryCache()?.listed ?? []);
  const [loading, setLoading] = useState(() => !getInventoryCache());
  const [tab, setTab] = useState<"gifts" | "listed">("gifts");
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

  const grid = tab === "gifts" ? items : listed;

  return (
    <div style={{ minHeight: "100%", padding: "16px 16px 28px", color: "#e2e8f0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: "-0.02em" }}>Инвентарь</div>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>{items.length} NFT</div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {(["gifts", "listed"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 12,
              border: tab === t ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.08)",
              background: tab === t ? "rgba(124,58,237,0.25)" : "rgba(15,23,42,0.7)",
              color: tab === t ? "#f5f3ff" : "#94a3b8",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t === "gifts" ? `Мои (${items.length})` : `На продаже (${listed.length})`}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: "#64748b", fontSize: 13 }}>Загрузка…</div>}

      {!loading && grid.length === 0 && (
        <div style={{ textAlign: "center", color: "#64748b", padding: 40, fontSize: 13 }}>
          {tab === "gifts"
            ? "Пока пусто — собери пазл 9/9 и нажми Получить"
            : "Нет лотов на продаже"}
        </div>
      )}

      {!loading && grid.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {grid.map((item) => {
            const src = giftImg(item);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelected(item);
                  setPrice(item.listPriceTon ? String(item.listPriceTon) : String(item.valueTon || ""));
                }}
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(168,85,247,0.25)",
                  background: "linear-gradient(160deg, rgba(15,23,42,0.98), rgba(8,12,24,0.98))",
                  padding: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "#e2e8f0",
                  textAlign: "left",
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
                  {tab === "listed" && item.listPriceTon != null
                    ? `${item.listPriceTon} TON`
                    : `≈ ${item.valueTon} TON`}
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
            <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 12 }}>
              Каталог ≈ {selected.valueTon} TON · комиссия рынка 1%
            </div>

            {tab === "gifts" ? (
              <>
                <label style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>Цена продажи (TON)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Например 2.5"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    margin: "6px 0 14px",
                    background: "rgba(0,0,0,0.35)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    color: "#f1f5f9",
                    fontSize: 15,
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void listForSale(selected)}
                  style={{
                    width: "100%",
                    padding: "14px 0",
                    borderRadius: 14,
                    border: "none",
                    background: "linear-gradient(135deg,#7c3aed,#a855f7)",
                    color: "#fff",
                    fontWeight: 900,
                    fontSize: 15,
                    cursor: busy ? "wait" : "pointer",
                    fontFamily: "inherit",
                    opacity: busy ? 0.7 : 1,
                  }}
                >
                  {busy ? "…" : "Выставить на маркет"}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void unlist(selected)}
                style={{
                  width: "100%",
                  padding: "14px 0",
                  borderRadius: 14,
                  border: "none",
                  background: "linear-gradient(135deg,#b45309,#f59e0b)",
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: 15,
                  cursor: busy ? "wait" : "pointer",
                  fontFamily: "inherit",
                }}
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
