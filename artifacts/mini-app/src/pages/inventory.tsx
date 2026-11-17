import { useEffect, useState, type CSSProperties } from "react";
import { useTelegram, haptic, hapticNotify } from "@/lib/telegram";
import {
  inventoryApi,
  notifyInventoryUpdated,
  type InventoryItem,
} from "@/lib/inventoryApi";
import { getInventoryCache, setInventoryCache } from "@/lib/dataCache";

const TG = "https://api.changes.tg";
const isTg = (it: InventoryItem) => it.kind === "tg_gift" || Boolean(it.model && it.symbol && it.backdrop);
const tgBase = (it: InventoryItem) =>
  it.collectionName || it.nameEn || (it.nameRu || "").replace(/\s*#\d+\s*$/, "").trim() || String(it.itemId || "").split("#")[0];

function TgGiftThumb({ item, size = 120 }: { item: InventoryItem; size?: number }) {
  const base = tgBase(item);
  const center = item.backdropCenter || "#4b5563";
  const edge = item.backdropEdge || "#111827";
  const modelUrl =
    item.modelImageUrl ||
    (item.model ? `${TG}/model/${encodeURIComponent(base)}/${encodeURIComponent(item.model)}.png?size=256` : item.imageUrl) ||
    `${TG}/original/${encodeURIComponent(base)}.png?size=256`;
  const symbolUrl =
    item.symbolImageUrl ||
    (item.symbol ? `${TG}/symbol/${encodeURIComponent(base)}/${encodeURIComponent(item.symbol)}.png?size=128` : null);
  const patternUrl =
    item.patternImageUrl ||
    (item.symbol ? `${TG}/pattern/${encodeURIComponent(base)}/${encodeURIComponent(item.symbol)}.png?size=128` : null);
  const msz = Math.round(size * 0.72);
  const ssz = Math.round(size * 0.2);
  const pat = Math.round(size * 0.28);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: `radial-gradient(circle at 50% 36%, ${center} 0%, ${edge} 70%, #0a0f1a 100%)` }}>
      {patternUrl && (
        <div aria-hidden style={{ position: "absolute", inset: 0, opacity: 0.26, backgroundImage: `url("${patternUrl}")`, backgroundSize: `${pat}px ${pat}px`, backgroundRepeat: "repeat", mixBlendMode: "soft-light", pointerEvents: "none" }} />
      )}
      {item.number != null && Number.isFinite(item.number) && (
        <div style={{ position: "absolute", top: 6, left: 0, right: 0, zIndex: 4, textAlign: "center", fontSize: Math.max(10, Math.round(size * 0.08)), fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>#{item.number}</div>
      )}
      <img src={modelUrl || undefined} alt="" style={{ position: "relative", zIndex: 2, width: msz, height: msz, objectFit: "contain", display: "block", margin: `${Math.round(size * 0.1)}px auto 0` }} onError={(e) => { const el = e.currentTarget; if (!el.dataset.fb) { el.dataset.fb = "1"; el.src = `${TG}/original/${encodeURIComponent(base)}.png?size=256`; } }} />
      {symbolUrl && (
        <img src={symbolUrl} alt="" style={{ position: "absolute", right: Math.round(size * 0.06), bottom: Math.round(size * 0.06), width: ssz, height: ssz, objectFit: "contain", zIndex: 3 }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
      )}
    </div>
  );
}

function giftImg(item: InventoryItem): string | null {
  if (item.modelImageUrl) return item.modelImageUrl;
  if (item.imageUrl) return item.imageUrl;
  if (item.model) return `${TG}/model/${encodeURIComponent(tgBase(item))}/${encodeURIComponent(item.model)}.png?size=256`;
  return null;
}

function fmtPrice(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1).replace(/\.0$/, "");
  return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
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
    } catch { /* */ } finally { setLoading(false); }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getInventoryCache()) setLoading(true);
      try {
        const d = await inventoryApi.get();
        setInventoryCache(d);
        if (!cancelled) { setItems(d.inventory ?? []); setListed(d.listed ?? []); }
      } catch {
        if (!cancelled && !getInventoryCache()) { setItems([]); setListed([]); }
      } finally { if (!cancelled) setLoading(false); }
    })();
    const onUpd = () => { void reload(); };
    window.addEventListener("tonyx-inventory-updated", onUpd);
    return () => { cancelled = true; window.removeEventListener("tonyx-inventory-updated", onUpd); };
  }, [telegramId]);

  const listForSale = async (item: InventoryItem) => {
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) { hapticNotify("error"); return; }
    setBusy(true);
    try {
      await inventoryApi.list(item.id, p);
      hapticNotify("success");
      setSelected(null); setPrice("");
      await reload(); notifyInventoryUpdated();
    } catch { hapticNotify("error"); }
    finally { setBusy(false); }
  };

  const unlist = async (item: InventoryItem) => {
    setBusy(true);
    try {
      await inventoryApi.unlist(item.id);
      hapticNotify("success");
      setSelected(null);
      await reload(); notifyInventoryUpdated();
    } catch { hapticNotify("error"); }
    finally { setBusy(false); }
  };

  const grid = (tab === "gifts" ? items : listed).filter((item) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const name = (item.nameRu || item.nameEn || item.itemId || "").toLowerCase();
    return name.includes(q) || String(item.id).includes(q);
  });

  return (
    <div style={{ minHeight: "100%", paddingTop: 52, paddingBottom: 24, color: "#e5e7eb", background: "#0b0b0d" }}>
      <div style={{ display: "flex", gap: 4, padding: "4px 10px 10px" }}>
        {([["gifts", "Гифты"], ["offers", "Офферы"], ["history", "История"]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => { haptic("light"); setTopTab(k); }} style={{
            background: "transparent", border: "none", color: topTab === k ? "#fff" : "#6b7280",
            fontWeight: topTab === k ? 800 : 600, fontSize: 18, padding: "4px 10px 8px", cursor: "pointer", fontFamily: "inherit",
            borderBottom: topTab === k ? "2px solid #fff" : "2px solid transparent",
          }}>{label}</button>
        ))}
      </div>
      {topTab !== "gifts" && <div style={{ textAlign: "center", color: "#6b7280", padding: 48, fontSize: 13 }}>{topTab === "offers" ? "Офферы скоро" : "История скоро"}</div>}
      {topTab === "gifts" && (
        <>
          <div style={{ display: "flex", margin: "0 14px 12px", background: "rgba(255,255,255,0.06)", borderRadius: 999, padding: 3 }}>
            <button type="button" onClick={() => setTab("gifts")} style={{ flex: 1, padding: "9px 0", borderRadius: 999, border: "none", background: tab === "gifts" ? "#fff" : "transparent", color: tab === "gifts" ? "#0b0b0d" : "#9ca3af", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Не выставл. {items.length}</button>
            <button type="button" onClick={() => setTab("listed")} style={{ flex: 1, padding: "9px 0", borderRadius: 999, border: "none", background: tab === "listed" ? "#fff" : "transparent", color: tab === "listed" ? "#0b0b0d" : "#9ca3af", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Выставл. {listed.length}</button>
          </div>
          <div style={{ padding: "0 14px 10px" }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Быстрый поиск" style={{ width: "100%", boxSizing: "border-box", height: 42, borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.06)", color: "#f3f4f6", padding: "0 14px", fontSize: 14, fontFamily: "inherit" }} />
          </div>
          {loading && <div style={{ textAlign: "center", color: "#6b7280", padding: 40, fontSize: 13 }}>Загрузка…</div>}
          {!loading && grid.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 20px" }}>
              <div style={{ fontSize: 56, marginBottom: 8 }}>🦩</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#f3f4f6", marginBottom: 6 }}>Если подарков нет</div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>{tab === "gifts" ? "Купите их на маркетплейсе" : "Нет лотов на продаже"}</div>
            </div>
          )}
          {!loading && grid.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 14px 24px" }}>
              {grid.map((item, i) => {
                const src = giftImg(item);
                const showPrice = tab === "listed" ? item.listPriceTon : item.valueTon;
                return (
                  <button key={item.id} type="button" onClick={() => { haptic("light"); setSelected(item); setPrice(item.listPriceTon ? String(item.listPriceTon) : String(item.valueTon || "")); }} style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: 18, padding: 0, overflow: "hidden", cursor: "pointer", fontFamily: "inherit", textAlign: "left", background: CARD_BG[i % CARD_BG.length] }}>
                    <div style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                      {isTg(item) ? <TgGiftThumb item={item} size={140} /> : src ? <img src={src} alt="" style={{ width: "82%", height: "82%", objectFit: "contain" }} loading="lazy" /> : <span style={{ fontSize: 40 }}>🎁</span>}
                    </div>
                    <div style={{ padding: "0 10px 12px" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.nameRu || item.nameEn || "Gift"}</div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2, marginBottom: 8 }}>{isTg(item) ? [item.model, item.symbol].filter(Boolean).join(" · ") : `#${String(item.id).slice(-5)}`}</div>
                      <div style={{ display: "inline-flex", background: "#0098EA", borderRadius: 999, padding: "6px 12px", fontSize: 13, fontWeight: 800, color: "#fff" }}>{fmtPrice(showPrice)} TON</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setSelected(null)}>
          <div style={{ width: "100%", maxWidth: 480, background: "#121214", borderRadius: "22px 22px 0 0", padding: "10px 16px 28px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 12px" }} />
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              {isTg(selected) ? (
                <div style={{ width: 120, height: 120, margin: "0 auto", borderRadius: 16, overflow: "hidden" }}><TgGiftThumb item={selected} size={120} /></div>
              ) : giftImg(selected) ? (
                <img src={giftImg(selected)!} alt="" style={{ width: 100, height: 100, objectFit: "contain" }} />
              ) : <div style={{ fontSize: 48 }}>🎁</div>}
              <div style={{ fontSize: 17, fontWeight: 800, marginTop: 6 }}>{selected.nameRu || selected.nameEn || "Gift"}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{isTg(selected) ? [selected.model, selected.backdrop, selected.symbol].filter(Boolean).join(" · ") : `#${String(selected.id).slice(-6)}`}</div>
            </div>
            {tab === "gifts" ? (
              <>
                <label style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600 }}>Цена продажи (TON)</label>
                <input type="number" step="any" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Например 2.5" style={{ width: "100%", boxSizing: "border-box", margin: "6px 0 14px", background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px", color: "#f1f5f9", fontSize: 15, fontFamily: "inherit" }} />
                <button type="button" disabled={busy} onClick={() => void listForSale(selected)} style={{ width: "100%", padding: "13px 0", borderRadius: 14, border: "none", background: "#0098EA", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", opacity: busy ? 0.7 : 1 }}>{busy ? "…" : "Выставить на маркет"}</button>
              </>
            ) : (
              <button type="button" disabled={busy} onClick={() => void unlist(selected)} style={{ width: "100%", padding: "13px 0", borderRadius: 14, border: "none", background: "#ea580c", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", opacity: busy ? 0.7 : 1 }}>{busy ? "…" : "Снять с продажи"}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
