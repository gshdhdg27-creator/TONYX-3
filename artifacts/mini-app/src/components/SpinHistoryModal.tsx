import { useEffect, useMemo, useState } from "react";
import FairnessModal, { type FairData } from "@/components/FairnessModal";

export type SpinHistoryItem = {
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
  stopFrac?: number;
  fair?: {
    serverSeed: string | null;
    serverSeedHash: string | null;
    clientSeed: string | null;
    nonce: number | null;
    hash: string | null;
  };
};

type TabId = "all" | "lucky" | "big" | "mine";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "all", label: "Все", icon: "✕" },
  { id: "lucky", label: "Везучие", icon: "🍀" },
  { id: "big", label: "Большие", icon: "💰" },
  { id: "mine", label: "Мои", icon: "👑" },
];

type Props = {
  onClose: () => void;
  onReplay: (item: SpinHistoryItem) => void;
  telegramId?: string;
};

export default function SpinHistoryModal({ onClose, onReplay, telegramId }: Props) {
  const [tab, setTab] = useState<TabId>("all");
  const [items, setItems] = useState<SpinHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/mini/games/spin/history?limit=80");
        const data = await res.json();
        if (!cancelled) setItems(data.rooms ?? data.history ?? []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    let list = [...items];
    if (search.trim()) {
      const q = search.trim();
      list = list.filter((r) => String(r.id).includes(q));
    }
    if (tab === "mine" && telegramId) {
      list = list.filter((r) => r.winnerId === telegramId || r.players?.some((p) => p.telegramId === telegramId));
    } else if (tab === "lucky") {
      list = list
        .filter((r) => r.totalPool > 0 && r.winnerPayout / Math.max(r.totalPool, 0.001) >= 2)
        .sort((a, b) => b.winnerPayout - a.winnerPayout);
    } else if (tab === "big") {
      list = list
        .filter((r) => r.totalPool >= 5 || r.winnerPayout >= 3)
        .sort((a, b) => b.totalPool - a.totalPool);
    }
    return list;
  }, [items, tab, search, telegramId]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(8,4,16,0.72)",
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
          maxHeight: "88vh",
          borderRadius: "20px 20px 0 0",
          background: "linear-gradient(180deg,#1a1028,#12081f)",
          border: "1px solid rgba(255,255,255,0.1)",
          padding: 14,
          overflow: "auto",
          color: "#f1f5f9",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>История раундов</div>
          <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", color: "#94a3b8", fontSize: 18, cursor: "pointer" }}>
            ✕
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: "6px 10px",
                borderRadius: 12,
                border: tab === t.id ? "1px solid rgba(167,139,250,0.55)" : "1px solid rgba(255,255,255,0.1)",
                background: tab === t.id ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.04)",
                color: "#f1f5f9",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по номеру раунда"
          style={{
            width: "100%",
            marginBottom: 10,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.25)",
            color: "#f1f5f9",
            outline: "none",
          }}
        />

        {loading ? (
          <div style={{ opacity: 0.7, padding: 20, textAlign: "center" }}>Загрузка…</div>
        ) : filtered.length === 0 ? (
          <div style={{ opacity: 0.7, padding: 20, textAlign: "center" }}>Пока пусто</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((h) => (
              <div
                key={h.id}
                style={{
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>Раунд #{h.id}</div>
                    <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
                      {h.winnerUsername || h.winnerId || "—"} · банк {h.totalPool} TON
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onReplay(h)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(167,139,250,0.4)",
                      background: "rgba(167,139,250,0.15)",
                      color: "#e9d5ff",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ▶ Повтор
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
