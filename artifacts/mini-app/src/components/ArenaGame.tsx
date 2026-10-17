import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetUserProfile,
  getGetUserProfileQueryKey,
} from "@workspace/api-client-react";
import { useTelegram } from "@/lib/telegram";

/* ── Portals-style Arena: vertical stake strips + bouncing puck ── */

const W = 340;
const H = 340;
const BALL_R = 11;
const MARGIN = 4;
const COMMISSION = 0.2;
const MIN_STAKE = 0.1;
const DEFAULT_BETS = [0.1, 0.5, 1, 5, 10];
const SPIN_MS = 6500;

const COLORS = [
  "#5BE12C", "#FF4136", "#FF9F00", "#00C0FF",
  "#B044FF", "#FFEB3B", "#FF69B4", "#00FFB2",
  "#FF6E40", "#39CCCC",
];

interface ArenaPlayer {
  telegramId: string;
  username: string | null;
  stake: number;
  chance: number;
  photoUrl?: string | null;
}

interface ArenaState {
  id: number;
  status: "waiting" | "starting" | "finished";
  totalPool: number;
  players: ArenaPlayer[];
  winnerId: string | null;
  winnerUsername: string | null;
  startAt: string | null;
}

type Phase = "lobby" | "spin" | "winner";

interface Props {
  telegramId: string;
  tonBalance: number;
  onBalanceChange?: (v?: number) => void;
  onClose: () => void;
  onOpenHistory?: () => void;
}

type Strip = ArenaPlayer & {
  color: string;
  index: number;
  share: number;
  x0: number;
  x1: number;
  midX: number;
};

function initials(name: string | null | undefined, id: string) {
  return (name || id || "?").replace(/^@/, "").slice(0, 2).toUpperCase();
}
function colorFor(i: number) {
  return COLORS[i % COLORS.length];
}
function payoutOf(stake: number, pool: number) {
  return Math.round((stake + (pool - stake) * (1 - COMMISSION)) * 1000) / 1000;
}

function buildStrips(players: ArenaPlayer[]): Strip[] {
  const total = players.reduce((s, p) => s + Math.max(0, p.stake), 0) || 1;
  let acc = 0;
  return players.map((p, i) => {
    const share = Math.max(0, p.stake) / total;
    const x0 = acc * W;
    acc += share;
    const x1 = acc * W;
    return {
      ...p,
      color: colorFor(i),
      index: i,
      share,
      x0,
      x1,
      midX: (x0 + x1) / 2,
    };
  });
}

export default function ArenaGame({
  telegramId,
  tonBalance,
  onBalanceChange,
  onClose,
}: Props) {
  const { photoUrl } = useTelegram();
  const qc = useQueryClient();
  const { data: profile } = useGetUserProfile(telegramId ?? "", {
    query: { enabled: !!telegramId, refetchInterval: 5000 },
  } as Parameters<typeof useGetUserProfile>[1]);

  const balanceTon = Number(
    (profile as { ton?: string | number } | undefined)?.ton ?? tonBalance ?? 0,
  );

  const refreshBalance = useCallback(() => {
    qc.refetchQueries({ queryKey: getGetUserProfileQueryKey(telegramId ?? "") });
    onBalanceChange?.();
  }, [qc, telegramId, onBalanceChange]);

  const [arena, setArena] = useState<ArenaState | null>(null);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [winnerData, setWinnerData] = useState<{
    name: string;
    payout: number;
    mult: number;
    photo?: string | null;
    color: string;
  } | null>(null);
  const [freezeStrips, setFreezeStrips] = useState<Strip[] | null>(null);
  const [freezePool, setFreezePool] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [boardZoom, setBoardZoom] = useState(1);
  const [zoomOrigin, setZoomOrigin] = useState("50% 50%");
  const [puckVisible, setPuckVisible] = useState(false);
  const [trail, setTrail] = useState<{ x: number; y: number; id: number }[]>([]);

  const ballRef = useRef<SVGCircleElement | null>(null);
  const glowRef = useRef<SVGCircleElement | null>(null);
  const posRef = useRef({ x: W / 2, y: H / 2 });
  const rafRef = useRef<number | null>(null);
  const settledRef = useRef<Set<number>>(new Set());
  const phaseRef = useRef<Phase>("lobby");
  const arenaIdRef = useRef<number | null>(null);
  const trailId = useRef(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    arenaIdRef.current = arena?.id ?? null;
  }, [arena?.id]);

  useEffect(() => {
    if (arena?.status !== "starting" || !arena.startAt) {
      setCountdown(0);
      return;
    }
    const update = () => {
      const ms = new Date(arena.startAt!).getTime() - Date.now();
      setCountdown(Math.max(0, Math.ceil(ms / 1000)));
    };
    update();
    const id = setInterval(update, 200);
    return () => clearInterval(id);
  }, [arena?.status, arena?.startAt]);

  const flash = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2200);
  };

  function placeBall(nx: number, ny: number) {
    posRef.current = { x: nx, y: ny };
    ballRef.current?.setAttribute("cx", nx.toFixed(2));
    ballRef.current?.setAttribute("cy", ny.toFixed(2));
    glowRef.current?.setAttribute("cx", nx.toFixed(2));
    glowRef.current?.setAttribute("cy", ny.toFixed(2));
  }

  function resetAnim() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    placeBall(W / 2, H / 2);
    setWinnerData(null);
    setFreezeStrips(null);
    setFreezePool(0);
    setBoardZoom(1);
    setZoomOrigin("50% 50%");
    setPuckVisible(false);
    setTrail([]);
  }

  function runSpinAnimation(data: ArenaState) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const strips = buildStrips(data.players);
    const winner =
      strips.find((s) => s.telegramId === data.winnerId) ?? strips[0];
    if (!winner) return;

    setFreezeStrips(strips);
    setFreezePool(data.totalPool);
    setPhase("spin");
    setWinnerData(null);
    setBoardZoom(1);
    setPuckVisible(true);
    setTrail([]);

    // Target: random point inside winner strip
    const pad = 10;
    const tx =
      winner.x0 +
      pad +
      Math.random() * Math.max(4, winner.x1 - winner.x0 - pad * 2);
    const ty = pad + Math.random() * (H - pad * 2);

    // Random start + velocity
    let x = MARGIN + BALL_R + Math.random() * (W - 2 * (MARGIN + BALL_R));
    let y = MARGIN + BALL_R + Math.random() * (H - 2 * (MARGIN + BALL_R));
    const dir = Math.random() * Math.PI * 2;
    let vx = Math.cos(dir) * (14 + Math.random() * 5);
    let vy = Math.sin(dir) * (14 + Math.random() * 5);
    placeBall(x, y);

    const startTime = performance.now();
    let last = startTime;
    let lastTrail = 0;
    const lo = MARGIN + BALL_R;
    const hiX = W - MARGIN - BALL_R;
    const hiY = H - MARGIN - BALL_R;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const raw = Math.min(1, elapsed / SPIN_MS);

      if (raw >= 1) {
        placeBall(tx, ty);
        setZoomOrigin(`${(tx / W) * 100}% ${(ty / H) * 100}%`);
        setBoardZoom(1.55);
        setPhase("winner");
        const payout = payoutOf(winner.stake, data.totalPool);
        const mult =
          winner.stake > 0
            ? Math.round((payout / winner.stake) * 100) / 100
            : 0;
        setWinnerData({
          name: data.winnerUsername || winner.username || winner.telegramId,
          payout,
          mult,
          photo: winner.photoUrl,
          color: winner.color,
        });
        rafRef.current = null;
        setTimeout(() => {
          setPhase("lobby");
          resetAnim();
          fetchState();
          refreshBalance();
        }, 3600);
        return;
      }

      const dt = Math.min(0.034, Math.max(0.001, (now - last) / 1000));
      last = now;

      // Friction increases over time
      const friction =
        raw < 0.45 ? 0.998 : raw < 0.7 ? 0.985 : raw < 0.88 ? 0.94 : 0.82;
      vx *= Math.pow(friction, dt * 60);
      vy *= Math.pow(friction, dt * 60);

      // Homing into winner strip in final phase
      if (raw > 0.55) {
        const t = (raw - 0.55) / 0.45;
        const pull = t * t * 3.2;
        const dx = tx - x;
        const dy = ty - y;
        const dist = Math.hypot(dx, dy) || 1;
        vx += (dx / dist) * pull;
        vy += (dy / dist) * pull;
      }

      x += vx * dt * 60;
      y += vy * dt * 60;

      if (x < lo) {
        x = lo;
        vx = Math.abs(vx) * 0.92;
      }
      if (x > hiX) {
        x = hiX;
        vx = -Math.abs(vx) * 0.92;
      }
      if (y < lo) {
        y = lo;
        vy = Math.abs(vy) * 0.92;
      }
      if (y > hiY) {
        y = hiY;
        vy = -Math.abs(vy) * 0.92;
      }

      placeBall(x, y);

      // Trail dots
      if (now - lastTrail > 40) {
        lastTrail = now;
        const id = ++trailId.current;
        setTrail((prev) => [...prev.slice(-18), { x, y, id }]);
      }

      // Late zoom
      if (raw > 0.82) {
        const k = (raw - 0.82) / 0.18;
        const ease = 1 - Math.pow(1 - k, 2);
        setZoomOrigin(`${(x / W) * 100}% ${(y / H) * 100}%`);
        setBoardZoom(1 + ease * 0.5);
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
  }

  const fetchState = useCallback(async () => {
    try {
      const r = await fetch("/api/mini/games/arena/state");
      if (!r.ok) return;
      const d = (await r.json()) as ArenaState;
      if (phaseRef.current === "lobby") setArena(d);
      else if (d.status === "finished" && d.id === arenaIdRef.current) setArena(d);

      if (
        d.status === "finished" &&
        d.winnerId &&
        !settledRef.current.has(d.id) &&
        phaseRef.current === "lobby"
      ) {
        settledRef.current.add(d.id);
        setArena(d);
        runSpinAnimation(d);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchState();
    const t = setInterval(fetchState, 700);
    return () => {
      clearInterval(t);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [fetchState]);

  useEffect(() => {
    if (arena?.status !== "starting" || !arena.startAt) return;
    const ms = new Date(arena.startAt).getTime() - Date.now();
    if (ms > 35000) return;
    const t = setTimeout(() => fetchState(), Math.max(0, ms + 80));
    return () => clearTimeout(t);
  }, [arena?.status, arena?.startAt, fetchState]);

  const liveStrips = useMemo(
    () => buildStrips(arena?.players ?? []),
    [arena?.players],
  );
  const strips = freezeStrips ?? liveStrips;
  const pool = freezeStrips ? freezePool : (arena?.totalPool ?? 0);
  const meIn = arena?.players.some((p) => p.telegramId === telegramId);

  async function placeBet(amount: number) {
    if (!telegramId) {
      flash("Откройте в Telegram", "err");
      return;
    }
    if (phase !== "lobby") {
      flash("Дождитесь окончания", "err");
      return;
    }
    if (arena?.status === "finished") {
      flash("Игра завершена…", "err");
      return;
    }
    if (!amount || amount < MIN_STAKE) {
      flash(`Мин. ${MIN_STAKE}`, "err");
      return;
    }
    if (amount > balanceTon + 1e-9) {
      flash("Недостаточно TON", "err");
      return;
    }
    setBusy(true);
    try {
      const me = arena?.players.find((p) => p.telegramId === telegramId);
      const url = me
        ? "/api/mini/games/arena/increase"
        : "/api/mini/games/arena/join";
      const body = me
        ? { telegramId, additionalStake: amount }
        : { telegramId, stake: amount };
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) {
        flash(d.error ?? "Ошибка", "err");
        return;
      }
      setArena(d as ArenaState);
      refreshBalance();
      flash(me ? `+${amount} TON` : `Ставка ${amount} TON`, "ok");
    } catch {
      flash("Сеть", "err");
    } finally {
      setBusy(false);
    }
  }

  const statusLabel =
    phase === "spin"
      ? "Шарик крутится…"
      : phase === "winner"
        ? "Победитель!"
        : arena?.status === "starting"
          ? countdown > 0
            ? `Старт через ${countdown}с`
            : "Скоро старт…"
          : (arena?.players.length ?? 0) < 2
            ? "Ждём игроков…"
            : "Набор ставок";

  return (
    <div style={root}>
      {/* Header */}
      <div style={header}>
        <button type="button" onClick={onClose} style={backBtn}>
          ←
        </button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, letterSpacing: "0.08em" }}>
            ARENA
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em" }}>
            {pool.toFixed(2)}{" "}
            <span style={{ color: "#5BE12C", fontSize: 14 }}>TON</span>
          </div>
        </div>
        <div style={{ width: 40 }} />
      </div>

      {/* Status pill */}
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <span style={statusPill}>{statusLabel}</span>
      </div>

      {/* Board */}
      <div style={boardWrap}>
        <div
          style={{
            width: W,
            height: H,
            borderRadius: 18,
            overflow: "hidden",
            position: "relative",
            background: "#0a0a12",
            transform: `scale(${boardZoom})`,
            transformOrigin: zoomOrigin,
            transition:
              phase === "winner"
                ? "transform 0.5s cubic-bezier(0.22,1,0.36,1)"
                : "none",
            boxShadow:
              "0 0 0 2px rgba(255,255,255,0.08), 0 20px 50px rgba(0,0,0,0.55)",
          }}
        >
          {/* Vertical strips */}
          {strips.length === 0 ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#64748b",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              Сделайте первую ставку
            </div>
          ) : (
            strips.map((s) => {
              const width = Math.max(2, s.x1 - s.x0);
              return (
                <div
                  key={s.telegramId}
                  style={{
                    position: "absolute",
                    left: s.x0,
                    top: 0,
                    width,
                    height: "100%",
                    background: s.color,
                    borderRight: "1px solid rgba(0,0,0,0.25)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    paddingTop: 12,
                    boxSizing: "border-box",
                    overflow: "hidden",
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: Math.min(48, width - 8),
                      height: Math.min(48, width - 8),
                      minWidth: 28,
                      minHeight: 28,
                      borderRadius: "50%",
                      border: "3px solid #fff",
                      overflow: "hidden",
                      background: "#111",
                      boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                      fontSize: 12,
                      color: "#fff",
                      flexShrink: 0,
                    }}
                  >
                    {s.photoUrl ? (
                      <img
                        src={s.photoUrl}
                        alt=""
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      initials(s.username, s.telegramId)
                    )}
                  </div>
                  {width > 42 && (
                    <>
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 11,
                          fontWeight: 900,
                          color: "#fff",
                          textShadow: "0 1px 3px rgba(0,0,0,0.5)",
                          maxWidth: width - 6,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          textAlign: "center",
                        }}
                      >
                        {(s.username || s.telegramId).replace(/^@/, "").slice(0, 10)}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: "rgba(255,255,255,0.9)",
                          textShadow: "0 1px 2px rgba(0,0,0,0.4)",
                        }}
                      >
                        {(s.chance || s.share * 100).toFixed(1)}%
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}

          {/* SVG puck + trail on top */}
          <svg
            width={W}
            height={H}
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              display: puckVisible || phase === "spin" || phase === "winner" ? "block" : "none",
            }}
          >
            {trail.map((t, i) => (
              <circle
                key={t.id}
                cx={t.x}
                cy={t.y}
                r={3 + (i / trail.length) * 4}
                fill="#fff"
                opacity={0.08 + (i / trail.length) * 0.35}
              />
            ))}
            <circle
              ref={glowRef}
              cx={W / 2}
              cy={H / 2}
              r={BALL_R + 8}
              fill="rgba(255,255,255,0.15)"
            />
            <circle
              ref={ballRef}
              cx={W / 2}
              cy={H / 2}
              r={BALL_R}
              fill="#fff"
              stroke="rgba(0,0,0,0.25)"
              strokeWidth={1.5}
              style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.45))" }}
            />
          </svg>
        </div>
      </div>

      {/* Players */}
      <div style={playersCard}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 13 }}>
            Игроки · {arena?.players.length ?? 0}
          </span>
          <span style={{ fontSize: 11, color: "#64748b" }}>
            #{arena?.id ?? "—"}
          </span>
        </div>
        {(arena?.players ?? []).length === 0 && (
          <div style={{ color: "#64748b", fontSize: 13, padding: "8px 0" }}>
            Пока никого — будь первым
          </div>
        )}
        {(arena?.players ?? []).map((p, i) => (
          <div key={p.telegramId} style={playerRow}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: colorFor(i),
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 900,
                  border: "2px solid rgba(255,255,255,0.25)",
                }}
              >
                {p.photoUrl ? (
                  <img
                    src={p.photoUrl}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  initials(p.username, p.telegramId)
                )}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {p.username || p.telegramId.slice(0, 8)}
                  {p.telegramId === telegramId ? (
                    <span style={{ color: "#5BE12C", marginLeft: 4 }}>вы</span>
                  ) : null}
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                  {Number(p.chance).toFixed(1)}% шанс
                </div>
              </div>
            </div>
            <div style={{ fontWeight: 900, color: "#5BE12C", fontSize: 13 }}>
              {p.stake.toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {/* Bet chips */}
      <div style={betRow}>
        {DEFAULT_BETS.map((b) => (
          <button
            key={b}
            type="button"
            disabled={busy || phase !== "lobby"}
            onClick={() => placeBet(b)}
            style={{
              ...chip,
              opacity: busy || phase !== "lobby" ? 0.4 : 1,
            }}
          >
            {b}
          </button>
        ))}
        <button
          type="button"
          disabled={busy || phase !== "lobby" || balanceTon < MIN_STAKE}
          onClick={() => placeBet(Math.round(balanceTon * 1000) / 1000)}
          style={{
            ...chip,
            background: "rgba(255,65,54,0.2)",
            color: "#FF4136",
            opacity: busy || phase !== "lobby" ? 0.4 : 1,
          }}
        >
          MAX
        </button>
      </div>

      <div style={balanceLine}>
        Баланс {balanceTon.toFixed(2)} TON
        {meIn ? " · можно докинуть ставку" : ""}
      </div>

      {/* Winner sheet */}
      {phase === "winner" && winnerData && (
        <div style={winnerOverlay}>
          <div
            style={{
              ...winnerSheet,
              borderTop: `3px solid ${winnerData.color}`,
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                margin: "0 auto 12px",
                border: `3px solid ${winnerData.color}`,
                overflow: "hidden",
                background: "#111",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: 22,
              }}
            >
              {winnerData.photo ? (
                <img
                  src={winnerData.photo}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                initials(winnerData.name, "?")
              )}
            </div>
            <div
              style={{
                textAlign: "center",
                fontSize: 20,
                fontWeight: 900,
                marginBottom: 4,
              }}
            >
              {winnerData.name}
            </div>
            <div
              style={{
                textAlign: "center",
                color: "#94a3b8",
                fontSize: 13,
                marginBottom: 14,
              }}
            >
              забирает банк
            </div>
            <div
              style={{
                textAlign: "center",
                fontSize: 28,
                fontWeight: 900,
                color: "#5BE12C",
              }}
            >
              +{winnerData.payout.toFixed(2)} TON
            </div>
            <div
              style={{
                textAlign: "center",
                color: "#94a3b8",
                fontSize: 13,
                marginTop: 4,
              }}
            >
              ×{winnerData.mult}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          style={{
            ...toastStyle,
            background: toast.type === "err" ? "#7f1d1d" : "#14532d",
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

const root: CSSProperties = {
  minHeight: "100dvh",
  padding: "10px 0 100px",
  background: "radial-gradient(ellipse at 50% 0%, #1a1030 0%, #07070e 55%)",
  color: "#fff",
  fontFamily: "inherit",
};
const header: CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "4px 12px 8px",
};
const backBtn: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(15,23,42,0.8)",
  color: "#e2e8f0",
  fontSize: 18,
  cursor: "pointer",
  fontFamily: "inherit",
};
const statusPill: CSSProperties = {
  display: "inline-block",
  padding: "5px 14px",
  borderRadius: 999,
  background: "rgba(91,225,44,0.12)",
  color: "#8bf56b",
  fontSize: 12,
  fontWeight: 800,
};
const boardWrap: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  margin: "0 12px 4px",
};
const playersCard: CSSProperties = {
  margin: "14px 14px 0",
  background: "rgba(255,255,255,0.04)",
  borderRadius: 16,
  padding: "12px 14px",
  border: "1px solid rgba(255,255,255,0.06)",
};
const playerRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "7px 0",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
};
const betRow: CSSProperties = {
  margin: "14px 14px 0",
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "center",
};
const chip: CSSProperties = {
  padding: "11px 16px",
  borderRadius: 14,
  border: "none",
  background: "rgba(91,225,44,0.15)",
  color: "#5BE12C",
  fontWeight: 900,
  fontSize: 14,
  cursor: "pointer",
  fontFamily: "inherit",
};
const balanceLine: CSSProperties = {
  textAlign: "center",
  marginTop: 10,
  fontSize: 12,
  color: "#94a3b8",
  fontWeight: 600,
};
const winnerOverlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  zIndex: 500,
};
const winnerSheet: CSSProperties = {
  width: "100%",
  maxWidth: 420,
  background: "#0c1a12",
  borderRadius: "22px 22px 0 0",
  padding: "22px 18px 36px",
};
const toastStyle: CSSProperties = {
  position: "fixed",
  top: 70,
  left: "50%",
  transform: "translateX(-50%)",
  color: "#fff",
  padding: "10px 16px",
  borderRadius: 12,
  fontWeight: 700,
  zIndex: 700,
};
