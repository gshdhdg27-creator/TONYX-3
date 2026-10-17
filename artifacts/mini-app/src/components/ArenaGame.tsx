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

/**
 * Premium Portals-like Arena (original implementation — not Portals source).
 * Vertical stake strips + high-energy bouncing puck + glass UI.
 */

const W = 352;
const H = 352;
const BALL_R = 13;
const MARGIN = 6;
const COMMISSION = 0.2;
const MIN_STAKE = 0.1;
const DEFAULT_BETS = [0.1, 0.5, 1, 2, 5, 10];
const SPIN_MS = 7200;

const COLORS = [
  "#22c55e", "#ef4444", "#f59e0b", "#06b6d4",
  "#a855f7", "#eab308", "#ec4899", "#14b8a6",
  "#f97316", "#3b82f6",
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

function haptic(type: "light" | "medium" | "heavy" = "light") {
  try {
    (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(type);
  } catch {
    /* */
  }
}
function hapticNotify(type: "success" | "error" | "warning") {
  try {
    (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(type);
  } catch {
    /* */
  }
}

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

const CSS = `
@keyframes arPulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
@keyframes arGlow {
  0%, 100% { box-shadow: 0 0 20px rgba(34,197,94,0.25), 0 0 60px rgba(34,197,94,0.08); }
  50% { box-shadow: 0 0 32px rgba(34,197,94,0.45), 0 0 90px rgba(34,197,94,0.18); }
}
@keyframes arPop {
  0% { opacity: 0; transform: translateY(16px) scale(0.94); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes arShine {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.ar-board {
  position: relative;
  border-radius: 22px;
  overflow: hidden;
  background: #08080f;
}
.ar-board::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 22px;
  pointer-events: none;
  box-shadow:
    inset 0 0 0 3px rgba(255,255,255,0.12),
    inset 0 0 0 6px rgba(0,0,0,0.35),
    inset 0 0 40px rgba(0,0,0,0.25);
  z-index: 4;
}
.ar-strip-gloss {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(255,255,255,0.22) 0%,
    rgba(255,255,255,0.05) 18%,
    transparent 42%,
    rgba(0,0,0,0.12) 100%
  );
  pointer-events: none;
}
.ar-puck-shadow {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(0,0,0,0.45) 0%, transparent 70%);
  pointer-events: none;
  z-index: 5;
  transform: translate(-50%, -50%);
}
`;

export default function ArenaGame({
  telegramId,
  tonBalance,
  onBalanceChange,
  onClose,
}: Props) {
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
  const [puckPos, setPuckPos] = useState({ x: W / 2, y: H / 2 });
  const [trail, setTrail] = useState<{ x: number; y: number; id: number }[]>([]);
  const [flashWall, setFlashWall] = useState(false);

  const rafRef = useRef<number | null>(null);
  const settledRef = useRef<Set<number>>(new Set());
  const phaseRef = useRef<Phase>("lobby");
  const arenaIdRef = useRef<number | null>(null);
  const trailId = useRef(0);
  const lastHitRef = useRef(0);

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

  function resetAnim() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setPuckPos({ x: W / 2, y: H / 2 });
    setWinnerData(null);
    setFreezeStrips(null);
    setFreezePool(0);
    setBoardZoom(1);
    setZoomOrigin("50% 50%");
    setPuckVisible(false);
    setTrail([]);
    setFlashWall(false);
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
    haptic("medium");

    const pad = 14;
    const stripW = Math.max(8, winner.x1 - winner.x0);
    const tx =
      winner.x0 +
      Math.min(stripW / 2, pad) +
      Math.random() * Math.max(4, stripW - Math.min(stripW / 2, pad) * 2);
    const ty = pad + Math.random() * (H - pad * 2);

    let x = MARGIN + BALL_R + Math.random() * (W - 2 * (MARGIN + BALL_R));
    let y = MARGIN + BALL_R + Math.random() * (H - 2 * (MARGIN + BALL_R));
    // Fast Portals-like start speed
    const dir = Math.random() * Math.PI * 2;
    let vx = Math.cos(dir) * (18 + Math.random() * 6);
    let vy = Math.sin(dir) * (18 + Math.random() * 6);
    setPuckPos({ x, y });

    const startTime = performance.now();
    let last = startTime;
    let lastTrail = 0;
    const lo = MARGIN + BALL_R;
    const hiX = W - MARGIN - BALL_R;
    const hiY = H - MARGIN - BALL_R;

    const hitWall = () => {
      const now = performance.now();
      if (now - lastHitRef.current > 80) {
        lastHitRef.current = now;
        haptic("light");
        setFlashWall(true);
        setTimeout(() => setFlashWall(false), 70);
      }
    };

    const step = (now: number) => {
      const elapsed = now - startTime;
      const raw = Math.min(1, elapsed / SPIN_MS);

      if (raw >= 1) {
        setPuckPos({ x: tx, y: ty });
        setZoomOrigin(`${(tx / W) * 100}% ${(ty / H) * 100}%`);
        setBoardZoom(1.65);
        setPhase("winner");
        hapticNotify("success");
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
        }, 3800);
        return;
      }

      const dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000));
      last = now;

      // Energy curve: long high-speed chaos, then soft settle
      let friction = 0.999;
      if (raw > 0.35) friction = 0.994;
      if (raw > 0.55) friction = 0.985;
      if (raw > 0.72) friction = 0.955;
      if (raw > 0.88) friction = 0.88;
      vx *= Math.pow(friction, dt * 60);
      vy *= Math.pow(friction, dt * 60);

      // Keep minimum speed until late phase so it keeps bouncing like Portals
      if (raw < 0.7) {
        const spd = Math.hypot(vx, vy);
        const minSpd = 8 - raw * 6;
        if (spd < minSpd && spd > 0.1) {
          vx = (vx / spd) * minSpd;
          vy = (vy / spd) * minSpd;
        }
      }

      // Homing only in the last stretch
      if (raw > 0.68) {
        const t = (raw - 0.68) / 0.32;
        const pull = t * t * 4.5;
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
        vx = Math.abs(vx) * 0.96;
        hitWall();
      }
      if (x > hiX) {
        x = hiX;
        vx = -Math.abs(vx) * 0.96;
        hitWall();
      }
      if (y < lo) {
        y = lo;
        vy = Math.abs(vy) * 0.96;
        hitWall();
      }
      if (y > hiY) {
        y = hiY;
        vy = -Math.abs(vy) * 0.96;
        hitWall();
      }

      setPuckPos({ x, y });

      if (now - lastTrail > 28) {
        lastTrail = now;
        const id = ++trailId.current;
        setTrail((prev) => [...prev.slice(-28), { x, y, id }]);
      }

      if (raw > 0.8) {
        const k = (raw - 0.8) / 0.2;
        const ease = 1 - Math.pow(1 - k, 2);
        setZoomOrigin(`${(x / W) * 100}% ${(y / H) * 100}%`);
        setBoardZoom(1 + ease * 0.6);
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
    haptic("light");
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
      ? "Шайба в игре…"
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
      <style>{CSS}</style>

      {/* Ambient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 80% 40% at 50% 0%, rgba(34,197,94,0.12) 0%, transparent 60%), radial-gradient(ellipse 50% 30% at 80% 20%, rgba(168,85,247,0.08) 0%, transparent 70%)",
        }}
      />

      {/* Header */}
      <div style={header}>
        <button type="button" onClick={onClose} style={backBtn}>
          ←
        </button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div
            style={{
              fontSize: 10,
              color: "#86efac",
              fontWeight: 800,
              letterSpacing: "0.14em",
            }}
          >
            ARENA
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1.1,
            }}
          >
            {pool.toFixed(2)}
            <span
              style={{
                color: "#4ade80",
                fontSize: 13,
                marginLeft: 6,
                fontWeight: 800,
              }}
            >
              TON
            </span>
          </div>
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <span
          style={{
            ...statusPill,
            animation: phase === "spin" ? "arPulse 1s ease-in-out infinite" : undefined,
          }}
        >
          {statusLabel}
        </span>
      </div>

      {/* Board */}
      <div style={boardWrap}>
        <div
          className="ar-board"
          style={{
            width: W,
            height: H,
            transform: `scale(${boardZoom})`,
            transformOrigin: zoomOrigin,
            transition:
              phase === "winner"
                ? "transform 0.55s cubic-bezier(0.22,1,0.36,1)"
                : "none",
            boxShadow: flashWall
              ? "0 0 0 2px rgba(255,255,255,0.45), 0 0 40px rgba(255,255,255,0.2)"
              : "0 0 0 1px rgba(255,255,255,0.1), 0 24px 60px rgba(0,0,0,0.55)",
          }}
        >
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
                zIndex: 2,
              }}
            >
              Сделайте первую ставку
            </div>
          ) : (
            strips.map((s) => {
              const width = Math.max(2, s.x1 - s.x0);
              const av = Math.min(52, Math.max(26, width - 10));
              return (
                <div
                  key={s.telegramId}
                  style={{
                    position: "absolute",
                    left: s.x0,
                    top: 0,
                    width,
                    height: "100%",
                    background: `linear-gradient(180deg, ${s.color} 0%, ${s.color}cc 100%)`,
                    borderRight: "1px solid rgba(0,0,0,0.28)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    paddingTop: 14,
                    boxSizing: "border-box",
                    overflow: "hidden",
                    zIndex: 1,
                  }}
                >
                  <div className="ar-strip-gloss" />
                  <div
                    style={{
                      width: av,
                      height: av,
                      borderRadius: "50%",
                      border: "3px solid #fff",
                      overflow: "hidden",
                      background: "#0a0a12",
                      boxShadow:
                        "0 6px 18px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                      fontSize: av * 0.32,
                      color: "#fff",
                      flexShrink: 0,
                      zIndex: 1,
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
                  {width > 48 && (
                    <>
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 12,
                          fontWeight: 900,
                          color: "#fff",
                          textShadow: "0 2px 6px rgba(0,0,0,0.55)",
                          maxWidth: width - 8,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          textAlign: "center",
                          zIndex: 1,
                        }}
                      >
                        {(s.username || s.telegramId)
                          .replace(/^@/, "")
                          .slice(0, 10)}
                      </div>
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 11,
                          fontWeight: 800,
                          color: "rgba(255,255,255,0.95)",
                          textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                          zIndex: 1,
                        }}
                      >
                        {(s.chance || s.share * 100).toFixed(1)}%
                      </div>
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 10,
                          fontWeight: 700,
                          color: "rgba(255,255,255,0.75)",
                          zIndex: 1,
                        }}
                      >
                        {s.stake.toFixed(2)}
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}

          {/* Trail + puck */}
          {(puckVisible || phase === "spin" || phase === "winner") && (
            <>
              {/* floor shadow under puck */}
              <div
                className="ar-puck-shadow"
                style={{
                  left: puckPos.x,
                  top: puckPos.y + BALL_R + 4,
                  width: BALL_R * 2.4,
                  height: BALL_R * 0.7,
                }}
              />
              <svg
                width={W}
                height={H}
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  zIndex: 6,
                }}
              >
                <defs>
                  <radialGradient id="puckGrad" cx="35%" cy="30%" r="65%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="55%" stopColor="#e8e8ef" />
                    <stop offset="100%" stopColor="#9ca3af" />
                  </radialGradient>
                  <filter id="puckBlur" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2.5" result="b" />
                    <feMerge>
                      <feMergeNode in="b" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {trail.map((t, i) => {
                  const k = (i + 1) / trail.length;
                  return (
                    <circle
                      key={t.id}
                      cx={t.x}
                      cy={t.y}
                      r={2 + k * 5}
                      fill="#fff"
                      opacity={0.05 + k * 0.4}
                    />
                  );
                })}
                {/* outer glow */}
                <circle
                  cx={puckPos.x}
                  cy={puckPos.y}
                  r={BALL_R + 10}
                  fill="rgba(255,255,255,0.12)"
                />
                <circle
                  cx={puckPos.x}
                  cy={puckPos.y}
                  r={BALL_R + 4}
                  fill="rgba(255,255,255,0.2)"
                />
                {/* main puck */}
                <circle
                  cx={puckPos.x}
                  cy={puckPos.y}
                  r={BALL_R}
                  fill="url(#puckGrad)"
                  stroke="rgba(0,0,0,0.2)"
                  strokeWidth={1.2}
                  filter="url(#puckBlur)"
                />
                {/* highlight */}
                <ellipse
                  cx={puckPos.x - 3}
                  cy={puckPos.y - 4}
                  rx={5}
                  ry={3.5}
                  fill="rgba(255,255,255,0.75)"
                />
              </svg>
            </>
          )}
        </div>
      </div>

      {/* Players card */}
      <div style={playersCard}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 13 }}>
            Игроки · {arena?.players.length ?? 0}
          </span>
          <span style={{ fontSize: 11, color: "#64748b" }}>
            раунд #{arena?.id ?? "—"}
          </span>
        </div>
        {(arena?.players ?? []).length === 0 && (
          <div style={{ color: "#64748b", fontSize: 13, padding: "6px 0" }}>
            Пока никого — будь первым
          </div>
        )}
        {(arena?.players ?? []).map((p, i) => (
          <div key={p.telegramId} style={playerRow}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: colorFor(i),
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 900,
                  border: "2px solid rgba(255,255,255,0.3)",
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
                    <span style={{ color: "#4ade80", marginLeft: 5 }}>вы</span>
                  ) : null}
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                  {Number(p.chance).toFixed(1)}% шанс
                </div>
              </div>
            </div>
            <div style={{ fontWeight: 900, color: "#4ade80", fontSize: 14 }}>
              {p.stake.toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {/* Bets */}
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
            background: "linear-gradient(135deg,rgba(239,68,68,0.25),rgba(239,68,68,0.12))",
            color: "#fca5a5",
            border: "1px solid rgba(239,68,68,0.3)",
            opacity: busy || phase !== "lobby" ? 0.4 : 1,
          }}
        >
          MAX
        </button>
      </div>

      <div style={balanceLine}>
        Баланс <b style={{ color: "#e2e8f0" }}>{balanceTon.toFixed(2)} TON</b>
        {meIn ? " · можно докинуть" : ""}
      </div>

      {/* Winner */}
      {phase === "winner" && winnerData && (
        <div style={winnerOverlay}>
          <div
            style={{
              ...winnerSheet,
              borderTop: `3px solid ${winnerData.color}`,
              animation: "arPop 0.35s ease-out",
            }}
          >
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                margin: "0 auto 14px",
                border: `3px solid ${winnerData.color}`,
                overflow: "hidden",
                background: "#111",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: 24,
                boxShadow: `0 0 32px ${winnerData.color}55`,
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
                fontSize: 22,
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
                marginBottom: 16,
              }}
            >
              забирает банк
            </div>
            <div
              style={{
                textAlign: "center",
                fontSize: 32,
                fontWeight: 900,
                color: "#4ade80",
              }}
            >
              +{winnerData.payout.toFixed(2)} TON
            </div>
            <div
              style={{
                textAlign: "center",
                color: "#94a3b8",
                fontSize: 14,
                marginTop: 6,
                fontWeight: 700,
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
  position: "relative",
  minHeight: "100dvh",
  padding: "8px 0 110px",
  background: "#06060c",
  color: "#fff",
  fontFamily: "inherit",
  overflow: "hidden",
};
const header: CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "4px 14px 6px",
  position: "relative",
  zIndex: 1,
};
const backBtn: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(15,23,42,0.85)",
  color: "#e2e8f0",
  fontSize: 18,
  cursor: "pointer",
  fontFamily: "inherit",
};
const statusPill: CSSProperties = {
  display: "inline-block",
  padding: "6px 16px",
  borderRadius: 999,
  background: "rgba(34,197,94,0.12)",
  border: "1px solid rgba(34,197,94,0.25)",
  color: "#86efac",
  fontSize: 12,
  fontWeight: 800,
};
const boardWrap: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  margin: "0 12px 6px",
  position: "relative",
  zIndex: 1,
};
const playersCard: CSSProperties = {
  margin: "16px 14px 0",
  background: "linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))",
  borderRadius: 18,
  padding: "14px 14px",
  border: "1px solid rgba(255,255,255,0.08)",
  position: "relative",
  zIndex: 1,
};
const playerRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 0",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
};
const betRow: CSSProperties = {
  margin: "16px 14px 0",
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "center",
  position: "relative",
  zIndex: 1,
};
const chip: CSSProperties = {
  padding: "12px 15px",
  borderRadius: 14,
  border: "1px solid rgba(34,197,94,0.28)",
  background: "rgba(34,197,94,0.12)",
  color: "#4ade80",
  fontWeight: 900,
  fontSize: 14,
  cursor: "pointer",
  fontFamily: "inherit",
};
const balanceLine: CSSProperties = {
  textAlign: "center",
  marginTop: 12,
  fontSize: 12,
  color: "#94a3b8",
  fontWeight: 600,
  position: "relative",
  zIndex: 1,
};
const winnerOverlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.62)",
  backdropFilter: "blur(6px)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  zIndex: 500,
};
const winnerSheet: CSSProperties = {
  width: "100%",
  maxWidth: 420,
  background: "linear-gradient(180deg,#0f1f16,#0a120e)",
  borderRadius: "24px 24px 0 0",
  padding: "26px 18px 40px",
};
const toastStyle: CSSProperties = {
  position: "fixed",
  top: 70,
  left: "50%",
  transform: "translateX(-50%)",
  color: "#fff",
  padding: "11px 18px",
  borderRadius: 14,
  fontWeight: 700,
  zIndex: 700,
  boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
};
