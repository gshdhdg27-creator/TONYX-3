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
    nftStakes?: Array<{
      inventoryId: number;
      itemId: string;
      valueTon: number;
      nameRu?: string;
      imageUrl?: string | null;
    }>;
  }>;
  finishedAt: string | null;
  stopFrac?: number;
  fair?: FairData | null;
};

type TabId = "date" | "lucky" | "big" | "mine";

const TABS: { id: TabId; label: string }[] = [
  { id: "date", label: "По дате" },
  { id: "lucky", label: "Везучие" },
  { id: "big", label: "Крупные" },
  { id: "mine", label: "Мои игры" },
];

type Props = {
  onClose: () => void;
  onReplay: (item: SpinHistoryItem) => void;
  telegramId?: string;
};

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function winnerMult(item: SpinHistoryItem): number {
  const wp = item.players?.find((p) => p.telegramId === item.winnerId);
  if (!wp || !wp.stake || wp.stake <= 0) return 0;
  return item.winnerPayout / wp.stake;
}

export default function SpinHistoryModal({ onClose, onReplay, telegramId }: Props) {
  const [tab, setTab] = useState<TabId>("date");
  const [items, setItems] = useState<SpinHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<SpinHistoryItem | null>(null);
  const [fairItem, setFairItem] = useState<SpinHistoryItem | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch("/api/mini/games/spin/history?limit=80");
        if (!res.ok) {
          if (!cancelled) setErr(`Ошибка ${res.status}`);
          return;
        }
        const data = await res.json();
        const list: SpinHistoryItem[] = data.rooms ?? data.history ?? [];
        if (!cancelled) setItems(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setErr("Не удалось загрузить историю");
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
      list = list.filter(
        (r) =>
          r.winnerId === telegramId ||
          r.players?.some((p) => p.telegramId === telegramId)
      );
    } else if (tab === "lucky") {
      list = list
        .filter((r) => winnerMult(r) >= 1.4)
        .sort((a, b) => winnerMult(b) - winnerMult(a));
    } else if (tab === "big") {
      list = list
        .filter((r) => r.totalPool >= 2 || r.winnerPayout >= 1.5)
        .sort((a, b) => b.totalPool - a.totalPool);
    } else {
      list = list.sort((a, b) => b.id - a.id);
    }
    return list;
  }, [items, tab, search, telegramId]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(8,4,16,0.78)",
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
          maxHeight: "90vh",
          borderRadius: "20px 20px 0 0",
          background: "linear-gradient(180deg,#14141c,#0c0c12)",
          border: "1px solid rgba(255,255,255,0.08)",
          padding: "14px 14px 28px",
          overflow: "auto",
          color: "#f1f5f9",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 17 }}>
            {detail ? `Игра #${detail.id}` : "История игр"}
          </div>
          <button
            type="button"
            onClick={() => (detail ? setDetail(null) : onClose())}
            style={{
              border: "none",
              background: "rgba(255,255,255,0.06)",
              color: "#94a3b8",
              fontSize: 16,
              cursor: "pointer",
              width: 34,
              height: 34,
              borderRadius: 10,
            }}
          >
            {detail ? "←" : "✕"}
          </button>
        </div>

        {!detail && (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 20,
                    border: "none",
                    background: tab === t.id ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.04)",
                    color: tab === t.id ? "#fff" : "#94a3b8",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по ID игры"
              style={{
                width: "100%",
                marginBottom: 12,
                padding: "11px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.28)",
                color: "#f1f5f9",
                outline: "none",
                boxSizing: "border-box",
                fontSize: 13,
                fontWeight: 600,
              }}
            />
          </>
        )}

        {loading ? (
          <div style={{ opacity: 0.7, padding: 24, textAlign: "center" }}>Загрузка…</div>
        ) : err ? (
          <div style={{ color: "#fecaca", padding: 16, textAlign: "center" }}>{err}</div>
        ) : detail ? (
          <div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>{fmtTime(detail.finishedAt)}</div>
            <div style={{ fontWeight: 800, color: "#4ade80", marginBottom: 10 }}>
              🏆 @{detail.winnerUsername || detail.winnerId}
              {detail.winnerPayout ? ` · +${detail.winnerPayout} TON` : ""}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {(detail.players || []).map((p) => {
                const isW = p.telegramId === detail.winnerId;
                return (
                  <div
                    key={p.telegramId}
                    style={{
                      padding: 12,
                      borderRadius: 16,
                      background: isW ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)",
                      border: isW ? "1px solid rgba(34,197,94,0.45)" : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>@{(p.username || p.telegramId || "").replace(/^@/, "")}</div>
                        <div style={{ fontSize: 12, color: isW ? "#4ade80" : "#94a3b8" }}>
                          {isW ? "Победитель " : ""}{(p.chance ?? 0).toFixed(2)}%
                        </div>
                      </div>
                      <div style={{ fontWeight: 900, color: isW ? "#4ade80" : "#e2e8f0" }}>
                        {Number(p.stake).toFixed(2)} TON
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => onReplay(detail)}
                style={{
                  flex: 1,
                  padding: "13px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#e2e8f0",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                ▶ Повтор
              </button>
              <button
                type="button"
                onClick={() => setFairItem(detail)}
                disabled={!detail.fair}
                style={{
                  flex: 1,
                  padding: "13px",
                  borderRadius: 14,
                  border: "none",
                  background: "#3b82f6",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: detail.fair ? "pointer" : "not-allowed",
                  opacity: detail.fair ? 1 : 0.5,
                }}
              >
                Legit Check
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ opacity: 0.65, padding: 28, textAlign: "center", fontWeight: 600 }}>Пока пусто</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((h) => {
              const mult = winnerMult(h);
              const wp = h.players?.find((p) => p.telegramId === h.winnerId);
              const chance = wp?.chance ?? (h.totalPool > 0 && wp ? (wp.stake / h.totalPool) * 100 : 0);
              return (
                <div
                  key={h.id}
                  style={{
                    padding: 14,
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.035)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <div
                      style={{
                        background: "rgba(59,130,246,0.22)",
                        color: "#93c5fd",
                        fontWeight: 900,
                        fontSize: 13,
                        padding: "4px 10px",
                        borderRadius: 10,
                      }}
                    >
                      {mult > 0 ? `${mult.toFixed(2)}x` : "—"}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>#{h.id}</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>
                        @{(h.winnerUsername || h.winnerId || "?").replace(/^@/, "").slice(0, 18)}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{fmtTime(h.finishedAt)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 900, fontSize: 14 }}>
                        {Number(h.winnerPayout || h.totalPool).toFixed(2)} TON
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>Шанс {Number(chance).toFixed(2)}%</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => onReplay(h)}
                      style={{
                        flex: 1,
                        padding: "11px 8px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.05)",
                        color: "#e2e8f0",
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Открыть повтор
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetail(h)}
                      style={{
                        flex: 1,
                        padding: "11px 8px",
                        borderRadius: 12,
                        border: "none",
                        background: "#3b82f6",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Проверка честности
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {fairItem?.fair && (
        <div onClick={(e) => e.stopPropagation()}>
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
        </div>
      )}
    </div>
  );
}
