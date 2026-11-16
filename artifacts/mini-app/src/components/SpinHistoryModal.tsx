import { useEffect, useMemo, useState } from "react";
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

interface LuckyPlayer {
  telegramId: string;
  username: string | null;
  photoUrl?: string | null;
  mult: number;
  payout: number;
  chance: number;
  roomId?: number;
  finishedAt?: string | null;
}

type TabId = "yours" | "lucky" | "top" | "grand";

interface Props {
  onClose: () => void;
  onReplay: (item: SpinHistoryItem) => void;
  telegramId?: string;
}

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "yours", label: "Твои", icon: "✕" },
  { id: "lucky", label: "Лаки", icon: "🍀" },
  { id: "top", label: "Топ", icon: "💰" },
  { id: "grand", label: "Гранд", icon: "👑" },
];

function formatTime(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function shortHash(h?: string | null) {
  if (!h) return "—";
  if (h.length <= 14) return h;
  return `${h.slice(0, 6)}…${h.slice(-6)}`;
}

function multOf(item: SpinHistoryItem) {
  const wp = item.players?.find((p) => p.telegramId === item.winnerId);
  if (!wp || wp.stake <= 0) return 1;
  return item.winnerPayout / wp.stake;
}

function chanceOf(item: SpinHistoryItem) {
  const wp = item.players?.find((p) => p.telegramId === item.winnerId);
  if (!wp || item.totalPool <= 0) return 0;
  return (wp.stake / item.totalPool) * 100;
}

export default function SpinHistoryModal({ onClose, onReplay, telegramId }: Props) {
  const [tab, setTab] = useState<TabId>("top");
  const [items, setItems] = useState<SpinHistoryItem[]>([]);
  const [lucky, setLucky] = useState<LuckyPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<SpinHistoryItem | null>(null);
  const [fairItem, setFairItem] = useState<SpinHistoryItem | null>(null);
  const [legitOk, setLegitOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [hRes, lRes] = await Promise.all([
          fetch("/api/mini/games/spin/history?limit=60"),
          fetch("/api/mini/games/spin/lucky-players").catch(() => null),
        ]);
        if (hRes.ok) {
          const d = await hRes.json();
          if (!cancelled) setItems(d.rooms ?? []);
        }
        if (lRes && lRes.ok) {
          const d = await lRes.json();
          if (!cancelled) setLucky(d.players ?? d.lucky ?? []);
        }
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

  const filtered = useMemo(() => {
    const q = search.trim().replace(/^#/, "");
    let list = [...items];

    if (q) {
      list = list.filter((r) => String(r.id).includes(q));
    }

    if (tab === "yours" && telegramId) {
      list = list.filter((r) => r.players?.some((p) => p.telegramId === telegramId));
    } else if (tab === "top") {
      list = list.sort((a, b) => b.winnerPayout - a.winnerPayout);
    } else if (tab === "grand") {
      list = list
        .filter((r) => r.totalPool >= 5 || multOf(r) >= 3)
        .sort((a, b) => b.totalPool - a.totalPool);
    } else if (tab === "lucky") {
      if (lucky.length > 0) return [];
      list = list
        .filter((r) => multOf(r) >= 2)
        .sort((a, b) => multOf(b) - multOf(a));
    }

    return list;
  }, [items, tab, search, telegramId, lucky]);

  const showLuckyList = tab === "lucky" && lucky.length > 0;

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          background: "rgba(0,0,0,0.85)",
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
            background: "#000000",
            borderRadius: "22px 22px 0 0",
            border: "1px solid rgba(255,255,255,0.08)",
            padding: "14px 12px 28px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 -12px 40px rgba(0,0,0,0.7)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, padding: "0 4px" }}>
            <div style={{ fontWeight: 900, fontSize: 18, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
              PvP История
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "none",
                borderRadius: 12,
                color: "#94a3b8",
                width: 36,
                height: 36,
                fontWeight: 800,
                cursor: "pointer",
                fontSize: 16,
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", paddingBottom: 2 }}>
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTab(t.id);
                    setDetail(null);
                    setLegitOk(false);
                  }}
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "8px 14px",
                    borderRadius: 20,
                    border: active ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.08)",
                    background: active
                      ? "linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.06))"
                      : "rgba(255,255,255,0.04)",
                    color: active ? "#f8fafc" : "#94a3b8",
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    boxShadow: active ? "0 0 12px rgba(255,255,255,0.08)" : "none",
                  }}
                >
                  <span style={{ fontSize: 12 }}>{t.icon}</span>
                  {t.label}
                </button>
              );
            })}
          </div>

          <div style={{ position: "relative", marginBottom: 12 }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 14,
                opacity: 0.5,
              }}
            >
              🔍
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по номеру игры"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "11px 14px 11px 36px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "#0a0a0c",
                color: "#f1f5f9",
                fontSize: 14,
                fontFamily: "inherit",
                outline: "none",
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingRight: 2 }}>
            {loading && (
              <div style={{ textAlign: "center", color: "#64748b", padding: 32, fontWeight: 600 }}>Загрузка…</div>
            )}

            {!loading && showLuckyList && lucky.length === 0 && (
              <div style={{ textAlign: "center", color: "#64748b", padding: 32 }}>Пока нет лаки-игр</div>
            )}

            {!loading && !showLuckyList && filtered.length === 0 && (
              <div style={{ textAlign: "center", color: "#64748b", padding: 32 }}>
                {tab === "yours" ? "Ты ещё не играл" : "Пока нет игр"}
              </div>
            )}

            {!loading &&
              showLuckyList &&
              lucky.map((lp, i) => (
                <div
                  key={`${lp.telegramId}-${i}`}
                  style={{
                    background: "#0c0c0e",
                    border: "1px solid rgba(74,222,128,0.18)",
                    borderRadius: 16,
                    padding: "12px 12px",
                    marginBottom: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        background: "linear-gradient(135deg,#22c55e,#16a34a)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 900,
                        color: "#fff",
                        overflow: "hidden",
                        flexShrink: 0,
                      }}
                    >
                      {lp.photoUrl ? (
                        <img src={lp.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        (lp.username || lp.telegramId || "?").replace(/^@/, "").slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: "#f1f5f9" }}>
                        @{(lp.username || lp.telegramId || "?").replace(/^@/, "").slice(0, 18)}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                        шанс {lp.chance?.toFixed?.(1) ?? "—"}%
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 900, fontSize: 15, color: "#4ade80" }}>
                        +{(lp.payout ?? 0).toFixed?.(2) ?? lp.payout} TON
                      </div>
                      <div style={{ fontSize: 12, color: "#fbbf24", fontWeight: 800 }}>
                        x{(lp.mult ?? 1).toFixed?.(2) ?? lp.mult}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

            {!loading &&
              !showLuckyList &&
              filtered.map((h) => {
                const mult = multOf(h);
                const chance = chanceOf(h);
                const isGrand = h.totalPool >= 5 || mult >= 3;
                return (
                  <div
                    key={h.id}
                    onClick={() => {
                      setDetail(h);
                      setLegitOk(false);
                    }}
                    style={{
                      background: isGrand ? "#0e0c08" : "#0c0c0e",
                      border: isGrand
                        ? "1px solid rgba(251,191,36,0.28)"
                        : "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 16,
                      padding: "12px 12px",
                      marginBottom: 8,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          background: isGrand ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.08)",
                          color: isGrand ? "#fbbf24" : "#cbd5e1",
                          fontWeight: 800,
                          fontSize: 12,
                          padding: "4px 10px",
                          borderRadius: 10,
                        }}
                      >
                        {isGrand ? "👑 Гранд" : "Классика"}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>
                        #{h.id} · {formatTime(h.finishedAt)}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: "50%",
                          background: "linear-gradient(135deg,#222,#111)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 900,
                          color: "#fff",
                          overflow: "hidden",
                          flexShrink: 0,
                        }}
                      >
                        {(() => {
                          const wp = h.players?.find((p) => p.telegramId === h.winnerId);
                          if (wp?.photoUrl) {
                            return <img src={wp.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
                          }
                          return (h.winnerUsername || h.winnerId || "?").replace(/^@/, "").slice(0, 2).toUpperCase();
                        })()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: "#f1f5f9" }}>
                          @{(h.winnerUsername || h.winnerId || "?").replace(/^@/, "").slice(0, 16)}
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                          {chance.toFixed(2)}%
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 900, fontSize: 15, color: isGrand ? "#fbbf24" : "#4ade80" }}>
                          +{h.winnerPayout.toFixed(2)} TON
                        </div>
                        <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 800 }}>x{mult.toFixed(2)}</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
                      <div
                        style={{
                          background: "rgba(59,130,246,0.2)",
                          color: "#93c5fd",
                          fontWeight: 800,
                          fontSize: 12,
                          padding: "4px 10px",
                          borderRadius: 10,
                        }}
                      >
                        💎 {h.totalPool.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", marginLeft: "auto" }}>
                        {h.playerCount || h.players?.length || 0} игр. →
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {detail && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10010,
            background: "rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          onClick={() => {
            setDetail(null);
            setLegitOk(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              maxHeight: "90vh",
              background: "#000000",
              borderRadius: "22px 22px 0 0",
              border: "1px solid rgba(255,255,255,0.08)",
              padding: "16px 14px 24px",
              overflow: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18, color: "#f1f5f9" }}>Ролл #{detail.id}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{formatTime(detail.finishedAt)}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetail(null);
                  setLegitOk(false);
                }}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "none",
                  borderRadius: 10,
                  color: "#94a3b8",
                  width: 34,
                  height: 34,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              <div
                style={{
                  background: "#0a0a0c",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 12, color: "#94a3b8" }}>
                  Hash: <span style={{ color: "#e2e8f0", fontFamily: "monospace" }}>{shortHash(detail.fair?.hash ?? detail.fair?.serverSeedHash)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const v = detail.fair?.hash ?? detail.fair?.serverSeedHash ?? "";
                    if (v) navigator.clipboard?.writeText(v).catch(() => null);
                  }}
                  style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14 }}
                >
                  🔗
                </button>
              </div>
              <div
                style={{
                  background: "#0a0a0c",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 12, color: "#94a3b8" }}>
                  Seed: <span style={{ color: "#e2e8f0", fontFamily: "monospace" }}>{shortHash(detail.fair?.serverSeed)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const v = detail.fair?.serverSeed ?? "";
                    if (v) navigator.clipboard?.writeText(v).catch(() => null);
                  }}
                  style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14 }}
                >
                  🔗
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => window.open("https://github.com/gshdhdg27-creator/TONYX-3", "_blank")}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#cbd5e1",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                ↻ Github скрипт
              </button>
              <button
                type="button"
                onClick={() => setFairItem(detail)}
                disabled={!detail.fair}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#e2e8f0",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: detail.fair ? "pointer" : "not-allowed",
                  opacity: detail.fair ? 1 : 0.5,
                  fontFamily: "inherit",
                }}
              >
                ℹ Информация о ролле
              </button>
            </div>

            <div
              style={{
                background: "linear-gradient(135deg,rgba(34,197,94,0.12),rgba(255,255,255,0.04))",
                border: "1px solid rgba(74,222,128,0.25)",
                borderRadius: 16,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>Победитель</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg,#22c55e,#16a34a)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    color: "#fff",
                    overflow: "hidden",
                  }}
                >
                  {(() => {
                    const wp = detail.players?.find((p) => p.telegramId === detail.winnerId);
                    if (wp?.photoUrl) return <img src={wp.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
                    return (detail.winnerUsername || detail.winnerId || "?").replace(/^@/, "").slice(0, 2).toUpperCase();
                  })()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#f1f5f9" }}>
                    @{(detail.winnerUsername || detail.winnerId || "?").replace(/^@/, "")}
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>{chanceOf(detail).toFixed(2)}%</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 900, fontSize: 16, color: "#4ade80" }}>
                    +{detail.winnerPayout.toFixed(2)} TON
                  </div>
                  <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 800 }}>x{multOf(detail).toFixed(2)}</div>
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <span
                  style={{
                    background: "rgba(59,130,246,0.25)",
                    color: "#93c5fd",
                    fontWeight: 800,
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 10,
                  }}
                >
                  💎 {(detail.players?.find((p) => p.telegramId === detail.winnerId)?.stake ?? 0).toFixed(2)}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {(detail.players || [])
                .filter((p) => p.telegramId !== detail.winnerId)
                .map((p) => (
                  <div
                    key={p.telegramId}
                    style={{
                      background: "#0c0c0e",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 12,
                      padding: "10px 12px",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "rgba(40,40,44,0.9)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: 11,
                        color: "#fff",
                        overflow: "hidden",
                        flexShrink: 0,
                      }}
                    >
                      {p.photoUrl ? (
                        <img src={p.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        (p.username || p.telegramId || "?").replace(/^@/, "").slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#e2e8f0" }}>
                        @{(p.username || p.telegramId || "?").replace(/^@/, "").slice(0, 16)}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{(p.chance ?? 0).toFixed(2)}%</div>
                    </div>
                    <div
                      style={{
                        background: "rgba(59,130,246,0.2)",
                        color: "#93c5fd",
                        fontWeight: 800,
                        fontSize: 12,
                        padding: "4px 10px",
                        borderRadius: 10,
                      }}
                    >
                      💎 {p.stake.toFixed(2)}
                    </div>
                  </div>
                ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  onReplay(detail);
                  setDetail(null);
                }}
                style={{
                  flex: 1,
                  padding: "14px 0",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#e2e8f0",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                ▶ Повтор
              </button>
              <button
                type="button"
                onClick={() => {
                  setLegitOk(true);
                  setFairItem(detail);
                }}
                style={{
                  flex: 1,
                  padding: "14px 0",
                  borderRadius: 14,
                  border: "none",
                  background: legitOk
                    ? "linear-gradient(135deg,#16a34a,#22c55e)"
                    : "linear-gradient(135deg,#2563eb,#3b82f6)",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: legitOk ? "0 0 20px rgba(34,197,94,0.35)" : "0 0 20px rgba(59,130,246,0.3)",
                }}
              >
                {legitOk ? "✓ Legit" : "✓ Legit Check"}
              </button>
            </div>
          </div>
        </div>
      )}

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
