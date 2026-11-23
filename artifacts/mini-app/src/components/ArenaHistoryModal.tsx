import { useEffect, useMemo, useState } from "react";
import FairnessModal, { type FairData } from "@/components/FairnessModal";

export type ArenaHistoryItem = {
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
  onReplay: (item: ArenaHistoryItem) => void;
  telegramId?: string;
};

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}.${mm} · ${hh}:${mi}`;
  } catch {
    return iso;
  }
}

function fmtFull(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}.${mm}.${yyyy} · ${hh}:${mi}`;
  } catch {
    return iso;
  }
}

function avatarSrc(photoUrl?: string | null, username?: string | null): string | null {
  if (photoUrl && String(photoUrl).startsWith("http")) return photoUrl;
  const u = (username || "").replace(/^@/, "").trim();
  if (u) return `https://t.me/i/userpic/320/${encodeURIComponent(u)}.jpg`;
  return null;
}

function initials(name: string | null | undefined, id: string) {
  return (name || id || "?").replace(/^@/, "").slice(0, 1).toUpperCase();
}

function winnerMult(item: ArenaHistoryItem): number {
  const wp = item.players?.find((p) => p.telegramId === item.winnerId);
  if (!wp || !wp.stake || wp.stake <= 0) return 0;
  return item.winnerPayout / wp.stake;
}

function winnerChance(item: ArenaHistoryItem): number {
  const wp = item.players?.find((p) => p.telegramId === item.winnerId);
  if (wp?.chance != null) return Number(wp.chance);
  if (!wp || item.totalPool <= 0) return 0;
  return (wp.stake / item.totalPool) * 100;
}

function shortHash(h?: string | null) {
  if (!h) return "—";
  if (h.length <= 12) return h;
  return `${h.slice(0, 4)}…${h.slice(-4)}`;
}

function fmtAmt(n: number) {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  const s = n.toFixed(2);
  return s.replace(/\.?0+$/, "");
}

export default function ArenaHistoryModal({ onClose, onReplay, telegramId }: Props) {
  const [tab, setTab] = useState<TabId>("date");
  const [items, setItems] = useState<ArenaHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<ArenaHistoryItem | null>(null);
  const [fairItem, setFairItem] = useState<ArenaHistoryItem | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch("/api/mini/games/arena/history?limit=80");
        if (!res.ok) {
          if (!cancelled) setErr(`Ошибка ${res.status}`);
          return;
        }
        const data = await res.json();
        const list: ArenaHistoryItem[] = data.rooms ?? data.history ?? [];
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
        zIndex: 300,
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
          maxWidth: 440,
          maxHeight: "92vh",
          borderRadius: "18px 18px 0 0",
          background: "#12121a",
          border: "1px solid rgba(255,255,255,0.06)",
          padding: "12px 12px 24px",
          overflow: "auto",
          color: "#f1f5f9",
          fontFamily: "inherit",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            padding: "0 2px",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.01em" }}>
            {detail ? `Игра #${detail.id}` : "История игр"}
          </div>
          <button
            type="button"
            onClick={() => (detail ? setDetail(null) : onClose())}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              border: "none",
              background: "rgba(255,255,255,0.06)",
              color: "#94a3b8",
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {detail ? "←" : "×"}
          </button>
        </div>

        {!detail && (
          <>
            <div
              style={{
                display: "flex",
                gap: 6,
                marginBottom: 10,
                overflowX: "auto",
                WebkitOverflowScrolling: "touch",
                paddingBottom: 2,
              }}
            >
              {TABS.map((t) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    style={{
                      flexShrink: 0,
                      padding: "8px 14px",
                      borderRadius: 999,
                      border: "none",
                      background: active ? "rgba(255,255,255,0.12)" : "transparent",
                      color: active ? "#fff" : "#8b8b9a",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div style={{ position: "relative", marginBottom: 12 }}>
              <span
                style={{
                  position: "absolute",
                  left: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#6b6b7b",
                  fontSize: 14,
                  pointerEvents: "none",
                }}
              >
                ⌕
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по ID игры"
                style={{
                  width: "100%",
                  padding: "12px 14px 12px 38px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.07)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#e8e8f0",
                  outline: "none",
                  boxSizing: "border-box",
                  fontSize: 14,
                  fontWeight: 500,
                }}
              />
            </div>
          </>
        )}

        {loading ? (
          <div style={{ opacity: 0.6, padding: 32, textAlign: "center", fontSize: 14 }}>Загрузка…</div>
        ) : err ? (
          <div style={{ color: "#fca5a5", padding: 20, textAlign: "center", fontSize: 14 }}>{err}</div>
        ) : detail ? (
          <div>
            <div style={{ fontSize: 13, color: "#8b8b9a", marginBottom: 12 }}>{fmtFull(detail.finishedAt)}</div>

            {detail.fair && (
              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => {
                    const v = detail.fair?.hash || detail.fair?.serverSeedHash || "";
                    if (v) navigator.clipboard?.writeText(v).catch(() => {});
                  }}
                  style={{
                    padding: "7px 11px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.04)",
                    color: "#9ca3af",
                    fontSize: 12,
                    fontFamily: "ui-monospace, monospace",
                    cursor: "pointer",
                  }}
                >
                  Хеш: {shortHash(detail.fair.hash || detail.fair.serverSeedHash)} 📋
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const v = detail.fair?.serverSeed || "";
                    if (v) navigator.clipboard?.writeText(v).catch(() => {});
                  }}
                  style={{
                    padding: "7px 11px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.04)",
                    color: "#9ca3af",
                    fontSize: 12,
                    fontFamily: "ui-monospace, monospace",
                    cursor: "pointer",
                  }}
                >
                  Сид: {shortHash(detail.fair.serverSeed)} 📋
                </button>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {(detail.players || []).map((p) => {
                const isW = p.telegramId === detail.winnerId;
                const nfts = p.nftStakes ?? [];
                const av = avatarSrc(p.photoUrl, p.username);
                const ch =
                  p.chance ?? (detail.totalPool > 0 ? (p.stake / detail.totalPool) * 100 : 0);
                return (
                  <div
                    key={p.telegramId}
                    style={{
                      padding: "12px 12px 10px",
                      borderRadius: 16,
                      background: isW ? "rgba(22, 101, 52, 0.28)" : "rgba(255,255,255,0.03)",
                      border: isW ? "1.5px solid rgba(74, 222, 128, 0.55)" : "1px solid rgba(255,255,255,0.06)",
                      boxShadow: isW ? "0 0 0 1px rgba(34,197,94,0.12)" : undefined,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          overflow: "hidden",
                          flexShrink: 0,
                          background: "#2a2a35",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 800,
                          fontSize: 15,
                          color: "#fff",
                          border: isW ? "2px solid #4ade80" : "2px solid transparent",
                        }}
                      >
                        {av ? (
                          <img
                            src={av}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          initials(p.username, p.telegramId)
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          @{(p.username || p.telegramId || "").replace(/^@/, "")}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>
                          {isW ? (
                            <span style={{ color: "#4ade80" }}>
                              Победитель <span style={{ opacity: 0.9 }}>{ch.toFixed(2)}%</span>
                            </span>
                          ) : (
                            <span style={{ color: "#8b8b9a" }}>{ch.toFixed(2)}%</span>
                          )}
                        </div>
                      </div>
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: 15,
                          color: isW ? "#4ade80" : "#e8e8f0",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmtAmt(Number(p.stake))} TON
                      </div>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                      {nfts.length > 0 ? (
                        nfts.map((n) => (
                          <div
                            key={n.inventoryId}
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 12,
                              overflow: "hidden",
                              position: "relative",
                              background: "rgba(59,130,246,0.18)",
                              border: "1px solid rgba(59,130,246,0.28)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {n.imageUrl ? (
                              <img
                                src={n.imageUrl}
                                alt=""
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            ) : (
                              <span style={{ fontSize: 14 }}>🎁</span>
                            )}
                            <span
                              style={{
                                position: "absolute",
                                left: 3,
                                bottom: 2,
                                fontSize: 10,
                                fontWeight: 800,
                                color: "#fff",
                                textShadow: "0 1px 2px #000",
                              }}
                            >
                              {fmtAmt(n.valueTon)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            background: "linear-gradient(145deg,#3b82f6,#1d4ed8)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <span style={{ fontSize: 13, lineHeight: 1 }}>💎</span>
                          <span style={{ fontSize: 10, fontWeight: 800, color: "#fff" }}>
                            {fmtAmt(Number(p.stake))}
                          </span>
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
                onClick={() => onReplay(detail)}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.05)",
                  color: "#e8e8f0",
                  fontWeight: 700,
                  fontSize: 14,
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
                  height: 48,
                  borderRadius: 14,
                  border: "none",
                  background: detail.fair ? "#2563eb" : "rgba(37,99,235,0.3)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: detail.fair ? "pointer" : "not-allowed",
                  opacity: detail.fair ? 1 : 0.5,
                }}
              >
                Legit Check
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ opacity: 0.55, padding: 36, textAlign: "center", fontWeight: 600, fontSize: 14 }}>
            Пока пусто
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((h) => {
              const mult = winnerMult(h);
              const chance = winnerChance(h);
              const wp = h.players?.find((p) => p.telegramId === h.winnerId);
              const av = avatarSrc(wp?.photoUrl, h.winnerUsername);
              const rooms = h.playerCount || h.players?.length || 1;
              const allNfts = (h.players || []).flatMap((p) => p.nftStakes ?? []).slice(0, 5);

              return (
                <div
                  key={h.id}
                  style={{
                    padding: "12px 12px 12px",
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        background: "rgba(37, 99, 235, 0.22)",
                        color: "#93c5fd",
                        fontWeight: 800,
                        fontSize: 13,
                        padding: "4px 10px",
                        borderRadius: 10,
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {mult > 0 ? `${mult.toFixed(2)}x` : "—"}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b6b7b", fontWeight: 600 }}>
                      #{h.id} · {rooms} Комната
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: "50%",
                        background: "#2a2a38",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        color: "#fff",
                        overflow: "hidden",
                        flexShrink: 0,
                        fontSize: 16,
                      }}
                    >
                      {av ? (
                        <img src={av} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        initials(h.winnerUsername, h.winnerId || "?")
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
                        @{(h.winnerUsername || h.winnerId || "?").replace(/^@/, "").slice(0, 18)}
                      </div>
                      <div style={{ fontSize: 12, color: "#8b8b9a", marginTop: 3 }}>{fmtTime(h.finishedAt)}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: "#f1f5f9" }}>
                        {fmtAmt(Number(h.winnerPayout || h.totalPool))} TON
                      </div>
                      <div style={{ fontSize: 12, color: "#8b8b9a", marginTop: 3 }}>
                        Шанс {chance.toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                    {allNfts.length > 0 ? (
                      allNfts.map((n) => (
                        <div
                          key={n.inventoryId}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            overflow: "hidden",
                            position: "relative",
                            background: "rgba(59,130,246,0.16)",
                            border: "1px solid rgba(59,130,246,0.28)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {n.imageUrl ? (
                            <img
                              src={n.imageUrl}
                              alt=""
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : (
                            <span style={{ fontSize: 12 }}>🎁</span>
                          )}
                          <span
                            style={{
                              position: "absolute",
                              left: 2,
                              bottom: 1,
                              fontSize: 9,
                              fontWeight: 800,
                              color: "#fff",
                              textShadow: "0 1px 2px #000",
                            }}
                          >
                            {fmtAmt(n.valueTon)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: "linear-gradient(145deg,#3b82f6,#1d4ed8)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          fontWeight: 800,
                          color: "#fff",
                        }}
                      >
                        {fmtAmt(Number(h.totalPool))}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => onReplay(h)}
                      style={{
                        flex: 1,
                        height: 42,
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(255,255,255,0.05)",
                        color: "#e8e8f0",
                        fontWeight: 650,
                        fontSize: 13,
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
                        height: 42,
                        borderRadius: 12,
                        border: "none",
                        background: "#2563eb",
                        color: "#fff",
                        fontWeight: 650,
                        fontSize: 13,
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
            gameType="arena"
            gameId={fairItem.id}
            onClose={() => setFairItem(null)}
          />
        </div>
      )}
    </div>
  );
}
