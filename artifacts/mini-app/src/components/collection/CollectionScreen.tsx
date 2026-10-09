import { useEffect, useState } from "react";
import { useGameStore } from "../../store/gameStore";
import {
  inventoryApi,
  type InventoryCollection,
} from "@/lib/inventoryApi";
import { haptic, hapticNotify } from "@/lib/telegram";

const IMG: Record<string, string> = {
  hypno_lollipop: "/nft/hypno_lollipop.jpg",
  liberty_figure: "/nft/liberty_figure.jpg",
  bday_candle: "/nft/bday_candle.jpg",
  moon_pendant: "/nft/moon_pendant.jpg",
  telegram_premium: "/nft/telegram_premium.jpg",
  snoop_cigar: "/nft/snoop_cigar.jpg",
  royal_dogg: "/nft/royal_dogg.jpg",
  electric_skull: "/nft/electric_skull.jpg",
  neko_helmet: "/nft/neko_helmet.jpg",
  heroic_helmet: "/nft/heroic_helmet.jpg",
};

function pieceStyle(index: number, lit: boolean, src: string): React.CSSProperties {
  const col = index % 3;
  const row = Math.floor(index / 3);
  return {
    aspectRatio: "1",
    borderRadius: 10,
    border: lit ? "1px solid rgba(250,204,21,0.7)" : "1px solid rgba(51,65,85,0.45)",
    backgroundImage: src ? `url(${src})` : "none",
    backgroundSize: "300% 300%",
    backgroundPosition: `${col * 50}% ${row * 50}%`,
    filter: lit ? "none" : "grayscale(1) brightness(0.35)",
    boxShadow: lit ? "0 0 14px rgba(168,85,247,0.55)" : "none",
    transition: "filter 0.45s ease, box-shadow 0.45s ease, transform 0.35s ease",
    transform: lit ? "scale(1)" : "scale(0.98)",
  };
}

export default function CollectionScreen() {
  const setView = useGameStore((s) => s.setView);
  const [list, setList] = useState<InventoryCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const d = await inventoryApi.get();
      setList(d.collections ?? []);
      if (!selectedId && d.collections?.length) setSelectedId(d.collections[0].id);
    } catch {
      setMsg("Не удалось загрузить коллекцию");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = list.find((c) => c.id === selectedId) ?? null;
  const imgSrc = selected ? IMG[selected.id] ?? selected.imageUrl ?? "" : "";

  async function onClaim() {
    if (!selected?.canClaim || claiming) return;
    setClaiming(true);
    setMsg(null);
    try {
      const r = await inventoryApi.claim(selected.id);
      hapticNotify("success");
      setMsg(`✨ ${r.nameRu} в инвентаре!`);
      await load();
    } catch (e) {
      hapticNotify("error");
      setMsg(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="collection-screen" style={{ paddingBottom: 28 }}>
      <style>{`
        @keyframes nftPieceIn {
          0% { transform: scale(0.6); opacity: 0.3; }
          60% { transform: scale(1.08); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
        <span style={{ fontWeight: 800, fontSize: 16, color: "#e2e8f0" }}>🏆 NFT Collection</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setView("home")}>
          ← Назад
        </button>
      </div>

      {msg && (
        <div style={{
          margin: "0 16px 10px", padding: "10px 12px", borderRadius: 12,
          background: "rgba(34,197,94,0.18)", color: "#4ade80", fontSize: 13, fontWeight: 700,
        }}>
          {msg}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 32, color: "#64748b", textAlign: "center" }}>Загрузка…</div>
      ) : (
        <div style={{ padding: "0 12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {list.map((c) => {
              const src = IMG[c.id] ?? c.imageUrl ?? "";
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { haptic("light"); setSelectedId(c.id); }}
                  style={{
                    textAlign: "left",
                    borderRadius: 16,
                    padding: 0,
                    overflow: "hidden",
                    border: selectedId === c.id ? "2px solid #a855f7" : "1px solid rgba(30,58,143,0.4)",
                    background: "#0f172a",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    color: "#e2e8f0",
                  }}
                >
                  <div style={{
                    height: 100,
                    backgroundImage: src ? `url(${src})` : "none",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    filter: c.owned > 0 ? "none" : "grayscale(0.85) brightness(0.5)",
                  }} />
                  <div style={{ padding: "8px 10px" }}>
                    <div style={{ fontSize: 12, fontWeight: 800 }}>{c.nameRu}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{c.owned}/9 · ≈{c.valueTon} TON</div>
                  </div>
                </button>
              );
            })}
          </div>

          {selected && (
            <div style={{
              background: "rgba(15,23,42,0.98)",
              border: "1px solid rgba(168,85,247,0.35)",
              borderRadius: 20,
              padding: 16,
            }}>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 2, color: "#f1f5f9" }}>{selected.nameRu}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 14 }}>
                {selected.owned}/9 · ≈ {selected.valueTon} TON
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 6,
                maxWidth: 300,
                margin: "0 auto 16px",
              }}>
                {Array.from({ length: 9 }).map((_, i) => {
                  const lit = (selected.pieces[i] ?? 0) >= 1;
                  return (
                    <div
                      key={i}
                      style={{
                        ...pieceStyle(i, lit, imgSrc),
                        animation: lit ? "nftPieceIn 0.55s ease" : "none",
                      }}
                    />
                  );
                })}
              </div>

              <button
                type="button"
                disabled={!selected.canClaim || claiming}
                onClick={onClaim}
                style={{
                  width: "100%",
                  padding: "14px 0",
                  borderRadius: 14,
                  border: "none",
                  fontFamily: "inherit",
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: selected.canClaim ? "pointer" : "not-allowed",
                  background: selected.canClaim
                    ? "linear-gradient(135deg,#16a34a,#22c55e)"
                    : "rgba(51,65,85,0.55)",
                  color: selected.canClaim ? "#fff" : "#64748b",
                }}
              >
                {claiming
                  ? "…"
                  : selected.canClaim
                    ? "🎁 Забрать в инвентарь"
                    : `Собери 9/9 (есть ${selected.owned})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
