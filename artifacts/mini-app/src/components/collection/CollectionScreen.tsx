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

const DESC: Record<string, string> = {
  hypno_lollipop: "Гипнотический леденец. Редкий Telegram Gift.",
  liberty_figure: "Факел свободы. Классический коллекционный подарок.",
  bday_candle: "Праздничный торт. Собери пазл и забери NFT.",
  moon_pendant: "Кулон луны и звезды. Стильный редкий дроп.",
  telegram_premium: "Символ Premium. Ценный коллекционный NFT.",
  snoop_cigar: "Легендарная сигара. Культовый Telegram Gift.",
  royal_dogg: "Королевский пёс TONYX. Эксклюзив проекта.",
  electric_skull: "Электрический череп. Эпический дроп.",
  neko_helmet: "Неко-шлем. Яркий и редкий коллекционный предмет.",
  heroic_helmet: "Героический шлем. Один из самых дорогих подарков.",
};

export default function CollectionScreen() {
  const setView = useGameStore((s) => s.setView);
  const [list, setList] = useState<InventoryCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const d = await inventoryApi.get();
      setList(d.collections ?? []);
    } catch {
      setMsg("Не удалось загрузить коллекцию");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onClaim(nftId: string) {
    if (claimingId) return;
    setClaimingId(nftId);
    setMsg(null);
    try {
      const r = await inventoryApi.claim(nftId);
      hapticNotify("success");
      setMsg(`✨ ${r.nameRu} добавлен в инвентарь`);
      await load();
    } catch (e) {
      hapticNotify("error");
      setMsg(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <div className="collection-screen" style={{ minHeight: "100%", paddingBottom: 120 }}>
      <style>{`
        @keyframes nftPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.35); }
          50% { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
        }
      `}</style>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px", position: "sticky", top: 0, zIndex: 5,
        background: "rgba(11,15,20,0.92)", backdropFilter: "blur(8px)",
      }}>
        <span style={{ fontWeight: 800, fontSize: 17, color: "#f1f5f9" }}>🏆 NFT Collection</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setView("home")}>
          ← Назад
        </button>
      </div>

      {msg && (
        <div style={{
          margin: "0 16px 12px", padding: "12px 14px", borderRadius: 14,
          background: "rgba(34,197,94,0.16)", color: "#4ade80",
          fontSize: 13, fontWeight: 700,
        }}>
          {msg}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, color: "#64748b", textAlign: "center" }}>Загрузка…</div>
      ) : (
        <div style={{ padding: "4px 14px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {list.map((c) => {
            const src = IMG[c.id] ?? c.imageUrl ?? "";
            const can = c.canClaim;
            const busy = claimingId === c.id;
            const progress = Math.round((c.owned / 9) * 100);

            return (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  gap: 14,
                  background: "linear-gradient(145deg, rgba(17,24,39,0.98), rgba(15,23,42,0.95))",
                  border: can
                    ? "1px solid rgba(34,197,94,0.55)"
                    : "1px solid rgba(168,85,247,0.28)",
                  borderRadius: 20,
                  padding: 12,
                  minHeight: 140,
                  boxShadow: can ? "0 0 24px rgba(34,197,94,0.12)" : "0 8px 24px rgba(0,0,0,0.25)",
                }}
              >
                {/* LEFT — photo */}
                <div style={{
                  width: 120,
                  minWidth: 120,
                  borderRadius: 16,
                  overflow: "hidden",
                  background: "#0b1220",
                  border: "1px solid rgba(148,163,184,0.15)",
                  position: "relative",
                }}>
                  <div style={{
                    width: "100%",
                    height: "100%",
                    minHeight: 120,
                    backgroundImage: src ? `url(${src})` : "none",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    filter: c.owned > 0 ? "none" : "grayscale(0.9) brightness(0.45)",
                    transition: "filter 0.4s ease",
                  }} />
                  {/* mini pieces */}
                  <div style={{
                    position: "absolute", left: 6, right: 6, bottom: 6,
                    display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2,
                  }}>
                    {Array.from({ length: 9 }).map((_, i) => {
                      const lit = (c.pieces[i] ?? 0) >= 1;
                      return (
                        <div key={i} style={{
                          height: 4, borderRadius: 2,
                          background: lit ? "#a855f7" : "rgba(15,23,42,0.75)",
                        }} />
                      );
                    })}
                  </div>
                </div>

                {/* RIGHT — info */}
                <div style={{
                  flex: 1, minWidth: 0,
                  display: "flex", flexDirection: "column", justifyContent: "space-between",
                }}>
                  <div>
                    <div style={{
                      fontSize: 15, fontWeight: 800, color: "#f8fafc",
                      marginBottom: 4, lineHeight: 1.25,
                    }}>
                      {c.nameRu}
                    </div>
                    <div style={{
                      fontSize: 11, color: "#94a3b8", lineHeight: 1.4,
                      marginBottom: 8,
                    }}>
                      {DESC[c.id] ?? "Коллекционный NFT. Собери 9 частей."}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <span style={{
                        fontSize: 12, fontWeight: 800, color: "#fbbf24",
                        background: "rgba(251,191,36,0.12)",
                        border: "1px solid rgba(251,191,36,0.25)",
                        borderRadius: 8, padding: "3px 8px",
                      }}>
                        ≈ {c.valueTon} TON
                      </span>
                      <span style={{
                        fontSize: 12, fontWeight: 700, color: "#c4b5fd",
                      }}>
                        Собрано {c.owned}/9
                      </span>
                    </div>
                  </div>

                  {/* progress bar */}
                  <div style={{ marginTop: 8, marginBottom: 8 }}>
                    <div style={{
                      height: 6, borderRadius: 99, background: "rgba(51,65,85,0.6)", overflow: "hidden",
                    }}>
                      <div style={{
                        width: `${progress}%`, height: "100%",
                        background: can
                          ? "linear-gradient(90deg,#16a34a,#22c55e)"
                          : "linear-gradient(90deg,#7c3aed,#a855f7)",
                        transition: "width 0.4s ease",
                      }} />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!can || busy}
                    onClick={() => { haptic("light"); onClaim(c.id); }}
                    style={{
                      width: "100%",
                      padding: "11px 0",
                      borderRadius: 12,
                      border: "none",
                      fontFamily: "inherit",
                      fontWeight: 800,
                      fontSize: 13,
                      cursor: can ? "pointer" : "not-allowed",
                      color: can ? "#fff" : "#64748b",
                      background: can
                        ? "linear-gradient(135deg,#16a34a,#22c55e)"
                        : "rgba(51,65,85,0.55)",
                      animation: can ? "nftPulse 1.6s ease infinite" : "none",
                      opacity: busy ? 0.7 : 1,
                    }}
                  >
                    {busy ? "…" : can ? "Получить" : "Собери 9/9"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
