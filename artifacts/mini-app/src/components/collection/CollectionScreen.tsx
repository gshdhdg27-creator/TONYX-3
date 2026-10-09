import { useEffect, useState } from "react";
import { useGameStore } from "../../store/gameStore";
import {
  inventoryApi,
  type InventoryCollection,
} from "@/lib/inventoryApi";
import { haptic, hapticNotify } from "@/lib/telegram";

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
      if (!selectedId && d.collections?.length) {
        setSelectedId(d.collections[0].id);
      }
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

  async function onClaim() {
    if (!selected || !selected.canClaim || claiming) return;
    setClaiming(true);
    setMsg(null);
    try {
      const r = await inventoryApi.claim(selected.id);
      hapticNotify("success");
      setMsg(`Получено: ${r.nameRu} → в инвентарь`);
      await load();
    } catch (e) {
      hapticNotify("error");
      setMsg(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="collection-screen" style={{ paddingBottom: 24 }}>
      <div className="collection-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
        <span className="collection-title" style={{ fontWeight: 800, fontSize: 16 }}>🏆 NFT Collection</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setView("home")} type="button">
          ← Назад
        </button>
      </div>

      {msg && (
        <div style={{ margin: "0 16px 10px", padding: "8px 12px", borderRadius: 10, background: "rgba(34,197,94,0.15)", color: "#4ade80", fontSize: 12 }}>
          {msg}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 24, color: "#64748b", textAlign: "center" }}>Загрузка…</div>
      ) : (
        <div className="scroll-area" style={{ padding: "0 12px" }}>
          {/* list of collections */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {list.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { haptic("light"); setSelectedId(c.id); }}
                style={{
                  textAlign: "left",
                  borderRadius: 14,
                  padding: 12,
                  border: selectedId === c.id ? "1px solid rgba(168,85,247,0.7)" : "1px solid rgba(30,58,143,0.35)",
                  background: selectedId === c.id ? "rgba(124,58,237,0.2)" : "rgba(15,23,42,0.9)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "#e2e8f0",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{c.nameRu}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{c.owned}/9 · ≈{c.valueTon} TON</div>
                {c.canClaim && (
                  <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, color: "#4ade80" }}>МОЖНО ЗАБРАТЬ</div>
                )}
              </button>
            ))}
          </div>

          {/* selected puzzle 3x3 */}
          {selected && (
            <div style={{
              background: "rgba(15,23,42,0.95)",
              border: "1px solid rgba(168,85,247,0.3)",
              borderRadius: 18,
              padding: 16,
              marginBottom: 16,
            }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{selected.nameRu}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
                {selected.owned}/9 частей · ≈ {selected.valueTon} TON
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
                maxWidth: 280,
                margin: "0 auto 16px",
              }}>
                {Array.from({ length: 9 }).map((_, i) => {
                  const lit = (selected.pieces[i] ?? 0) >= 1;
                  return (
                    <div
                      key={i}
                      style={{
                        aspectRatio: "1",
                        borderRadius: 12,
                        border: lit ? "1px solid rgba(168,85,247,0.6)" : "1px solid rgba(51,65,85,0.5)",
                        background: lit
                          ? "linear-gradient(135deg,#7c3aed,#a855f7)"
                          : "rgba(30,41,59,0.8)",
                        filter: lit ? "none" : "grayscale(1) brightness(0.45)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        color: lit ? "#fff" : "#64748b",
                        fontWeight: 800,
                      }}
                    >
                      {lit ? "✦" : i + 1}
                    </div>
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
                  borderRadius: 12,
                  border: "none",
                  fontFamily: "inherit",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: selected.canClaim ? "pointer" : "not-allowed",
                  background: selected.canClaim
                    ? "linear-gradient(135deg,#16a34a,#22c55e)"
                    : "rgba(51,65,85,0.5)",
                  color: selected.canClaim ? "#fff" : "#64748b",
                  opacity: claiming ? 0.7 : 1,
                }}
              >
                {claiming
                  ? "…"
                  : selected.canClaim
                    ? "Забрать в инвентарь"
                    : `Собери 9/9 (есть ${selected.owned})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
