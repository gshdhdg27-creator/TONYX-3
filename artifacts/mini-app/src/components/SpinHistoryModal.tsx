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

type TabId = "all" | "lucky" | "big" | "mine";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "all", label: "Все", icon: "☰" },
  { id: "lucky", label: "Везучие", icon: "🍀" },
  { id: "big", label: "Большие", icon: "💰" },
  { id: "mine", label: "Мои", icon: "👑" },
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

export default function SpinHistoryModal({ onClose, onReplay, telegramId }: Props) {
  const [tab, setTab] = useState<TabId>("all");
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
        .filter((r) => r.totalPool > 0 && r.winnerPayout / Math.max(r.totalPool, 0.001) >= 1.5)
        .sort((a, b) => b.winnerPayout / Math.max(b.totalPool, 0.001) - a.winnerPayout / Math.max(a.totalPool, 0.001));
    } else if (tab === "big") {
      list = list
        .filter((r) => r.totalPool >= 3 || r.winnerPayout >= 2)
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
          <div style={{ fontWeight: 900, fontSize: 16 }}>
            {detail ? `Раунд #${detail.id}` : "История раундов"}
          </div>
          <button
            type="button"
            onClick={() => (detail ? setDetail(null) : onClose())}
            style={{ border: "none", background: "transparent", color: "#94a3b8", fontSize: 18, cursor: "pointer" }}
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
                    padding: "6px 10px",
                    borderRadius: 12,
                    border:
                      tab === t.id
                        ? "1px solid rgba(167,139,250,0.55)"
                        : "1px solid rgba(255,255,255,0.1)",
                    background:
                      tab === t.id ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.04)",
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
                boxSizing: "border-box",
              }}
            />
          </>
        )}

        {loading ? (
          <div style={{ opacity: 0.7, padding: 20, textAlign: "center" }}>Загрузка…</div>
        ) : err ? (
          <div style={{ color: "#fecaca", padding: 16, textAlign: "center" }}>{err}</div>
        ) : detail ? (
          <div>
            <div style={{ marginBottom: 12, fontSize: 13, opacity: 0.85 }}>
              {fmtTime(detail.finishedAt)} · банк {detail.totalPool} TON
            </div>
            <div style={{ fontWeight: 800, color: "#4ade80", marginBottom: 10, fontSize: 15 }}>
              🏆 Победитель: @{detail.winnerUsername || detail.winnerId}
              {detail.winnerPayout ? ` · +${detail.winnerPayout} TON` : ""}
            </div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>Участники и ставки:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {(detail.players || []).map((p) => {
                const isW = p.telegramId === detail.winnerId;
                const nfts = p.nftStakes ?? [];
                const initials = (p.username || p.telegramId || "?").replace(/^@/, "").slice(0, 2).toUpperCase();
                const avatar = (p.photoUrl && String(p.photoUrl).startsWith("http"))
                  ? p.photoUrl
                  : (p.username
                    ? `https://t.me/i/userpic/320/${encodeURIComponent(String(p.username).replace(/^@/, ""))}.jpg`
                    : null);
                return (
                  <div
                    key={p.telegramId}
                    style={{
                      padding: "12px",
                      borderRadius: 16,
                      background: isW
                        ? "linear-gradient(135deg, rgba(34,197,94,0.18), rgba(34,197,94,0.06))"
                        : "rgba(255,255,255,0.04)",
                      border: isW ? "1px solid rgba(34,197,94,0.45)" : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
                        background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 900, fontSize: 12, border: isW ? "2px solid #4ade80" : "2px solid transparent",
                      }}>
                        {avatar
                          ? <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                          : initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>@{(p.username || p.telegramId || "").replace(/^@/, "")}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                          {isW
                            ? <span style={{ color: "#4ade80" }}>Победитель <span style={{ opacity: 0.85 }}>{(p.chance ?? 0).toFixed(2)}%</span></span>
                            : <span style={{ color: "#94a3b8" }}>{(p.chance ?? 0).toFixed(2)}%</span>}
                        </div>
                      </div>
                      <div style={{ fontWeight: 900, fontSize: 15, color: isW ? "#4ade80" : "#e2e8f0" }}>
                        {Number(p.stake).toFixed(2)} TON
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                      {nfts.length > 0 ? nfts.map((n) => (
                        <div key={n.inventoryId} style={{
                          width: 48, height: 48, borderRadius: 12, overflow: "hidden", position: "relative",
                          background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.35)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {n.imageUrl
                            ? <img src={n.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <span>🎁</span>}
                          <span style={{ position: "absolute", left: 4, bottom: 3, fontSize: 10, fontWeight: 900, color: "#fff", textShadow: "0 1px 2px #000" }}>{n.valueTon}</span>
                        </div>
                      )) : (
                        <div style={{
                          width: 48, height: 48, borderRadius: 12,
                          background: "linear-gradient(145deg,#3b82f6,#1d4ed8)",
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        }}>
                          <span style={{ fontSize: 16 }}>💎</span>
                          <span style={{ fontSize: 10, fontWeight: 900, color: "#fff" }}>{Number(p.stake).toFixed(0)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  onReplay(detail);
                }}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 12,
                  border: "1px solid rgba(167,139,250,0.45)",
                  background: "rgba(167,139,250,0.2)",
                  color: "#e9d5ff",
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
                  padding: "12px",
                  borderRadius: 12,
                  border: "1px solid rgba(74,222,128,0.4)",
                  background: "rgba(34,197,94,0.15)",
                  color: "#86efac",
                  fontWeight: 800,
                  cursor: detail.fair ? "pointer" : "not-allowed",
                  opacity: detail.fair ? 1 : 0.5,
                }}
              >
                ✓ Честность
              </button>
            </div>
            {detail.fair && (
              <div style={{ marginTop: 12, fontSize: 11, opacity: 0.7, fontFamily: "monospace", wordBreak: "break-all" }}>
                hash: {detail.fair.hash || detail.fair.serverSeedHash || "—"}
              </div>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ opacity: 0.7, padding: 20, textAlign: "center" }}>Пока пусто</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((h) => (
              <div
                key={h.id}
                onClick={() => setDetail(h)}
                style={{
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>Раунд #{h.id} <span style={{ fontWeight: 600, opacity: 0.55, fontSize: 11 }}>· детали</span></div>
                    <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
                      @{h.winnerUsername || h.winnerId || "—"} · банк {h.totalPool} TON
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>
                      {fmtTime(h.finishedAt)}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReplay(h);
                      }}
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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFairItem(h);
                      }}
                      disabled={!h.fair}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(74,222,128,0.35)",
                        background: "rgba(34,197,94,0.12)",
                        color: "#86efac",
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: h.fair ? "pointer" : "not-allowed",
                        opacity: h.fair ? 1 : 0.45,
                        whiteSpace: "nowrap",
                      }}
                    >
                      ✓ Честность
                    </button>
                  </div>
                </div>
              </div>
            ))}
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
