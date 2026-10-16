import { useEffect, useState } from "react";
import FairnessModal, { type FairData } from "@/components/FairnessModal";

export interface SpinHistoryItem {
  id: number;
  winnerId: string | null;
  winnerUsername: string | null;
  winnerPayout: number;
  totalPool: number;
  playerCount: number;
  players: Array<{
    telegramId: string;
    username: string | null;
    stake: number;
    chance: number;
    photoUrl?: string | null;
  }>;
  finishedAt: string | null;
  stopFrac?: number | null;
  fair?: FairData;
}

interface Props {
  onClose: () => void;
  onReplay: (item: SpinHistoryItem) => void;
}

export default function SpinHistoryModal({ onClose, onReplay }: Props) {
  const [items, setItems] = useState<SpinHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fairItem, setFairItem] = useState<SpinHistoryItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/mini/games/spin/history?limit=30");
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setItems(d.rooms ?? []);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          background: "rgba(0,0,0,0.72)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
        }}
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            maxWidth: 480,
            maxHeight: "78vh",
            background: "linear-gradient(180deg,#1a1028,#0d0818)",
            borderRadius: "20px 20px 0 0",
            border: "1px solid rgba(124,92,255,0.25)",
            padding: "16px 14px 28px",
            overflow: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 900, fontSize: 16, color: "#e9d5ff" }}>История Spin</div>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "none",
                borderRadius: 10,
                color: "#94a3b8",
                padding: "6px 12px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>

          {loading && <div style={{ textAlign: "center", color: "#64748b", padding: 24 }}>Загрузка…</div>}
          {!loading && items.length === 0 && (
            <div style={{ textAlign: "center", color: "#64748b", padding: 24 }}>Пока нет игр</div>
          )}

          {items.map((h) => {
            const time = h.finishedAt
              ? new Date(h.finishedAt).toLocaleString("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "";
            return (
              <div
                key={h.id}
                style={{
                  background: "rgba(30,18,51,0.9)",
                  border: "1px solid rgba(148,163,184,0.12)",
                  borderRadius: 14,
                  padding: "12px 12px",
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "#f1f5f9" }}>
                    🏆 @{(h.winnerUsername || h.winnerId || "?").replace(/^@/, "")}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    #{h.id} · {time}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
                  Банк <span style={{ color: "#fbbf24", fontWeight: 800 }}>{h.totalPool.toFixed(2)} TON</span>
                  {" · "}
                  Выплата <span style={{ color: "#4ade80", fontWeight: 800 }}>+{h.winnerPayout.toFixed(2)}</span>
                  {" · "}
                  {h.playerCount} игр.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setFairItem(h)}
                    disabled={!h.fair}
                    style={{
                      flex: 1,
                      padding: "9px 0",
                      borderRadius: 11,
                      border: "1px solid rgba(124,92,255,0.35)",
                      background: "rgba(124,92,255,0.12)",
                      color: "#c4b5fd",
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: "pointer",
                      opacity: h.fair ? 1 : 0.5,
                    }}
                  >
                    🔐 Честность
                  </button>
                  <button
                    type="button"
                    onClick={() => onReplay(h)}
                    style={{
                      flex: 1,
                      padding: "9px 0",
                      borderRadius: 11,
                      border: "none",
                      background: "linear-gradient(135deg,#7c5cff,#a855f7)",
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    ▶ Повтор
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {fairItem?.fair && (
        <FairnessModal
          fair={{
            serverSeedHash: fairItem.fair.serverSeedHash ?? "",
            serverSeed: fairItem.fair.serverSeed ?? null,
            clientSeed: fairItem.fair.clientSeed ?? "default",
            nonce: fairItem.fair.nonce ?? 1,
            hash: fairItem.fair.hash ?? null,
          }}
          status="finished"
          gameType="spin"
          gameId={fairItem.id}
          onClose={() => setFairItem(null)}
        />
      )}
    </>
  );
}
