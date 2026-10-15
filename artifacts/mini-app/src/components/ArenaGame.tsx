import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetUserProfile,
  getGetUserProfileQueryKey,
} from "@workspace/api-client-react";
import { useTelegram } from "@/lib/telegram";

/** Circular PvP drum — style inspired by rollsgame_bot */
const SIZE = 300;
const CX = SIZE / 2;
const CY = SIZE / 2;
const OUTER_R = 138;
const INNER_R = 52;
const AVATAR_R = (OUTER_R + INNER_R) / 2;

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
  winnerSector: { startDeg: number; endDeg: number } | null;
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

const COLORS = [
  "#7c5cff",
  "#f59e0b",
  "#22c55e",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#eab308",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
];

const COMMISSION = 0.05;
const MIN_STAKE = 0.1;
const DEFAULT_BETS = [0.1, 0.5, 1, 5, 10];
const SPIN_MS = 6200;

function initials(name: string | null | undefined, id: string) {
  return (name || id || "?").replace(/^@/, "").slice(0, 2).toUpperCase();
}
function colorFor(i: number) {
  return COLORS[i % COLORS.length];
}

/** Degrees: 0 at top, clockwise (matches pointer at top) */
function polar(deg: number, r: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

function arcPath(startDeg: number, endDeg: number, rOut: number, rIn: number) {
  const sweep = endDeg - startDeg;
  if (sweep <= 0.05) return "";
  // Full circle special-case
  if (sweep >= 359.9) {
    return [
      `M ${CX} ${CY - rOut}`,
      `A ${rOut} ${rOut} 0 1 1 ${CX - 0.01} ${CY - rOut}`,
      `L ${CX - 0.01} ${CY - rIn}`,
      `A ${rIn} ${rIn} 0 1 0 ${CX} ${CY - rIn}`,
      "Z",
    ].join(" ");
  }
  const large = sweep > 180 ? 1 : 0;
  const [x1, y1] = polar(startDeg, rOut);
  const [x2, y2] = polar(endDeg, rOut);
  const [x3, y3] = polar(endDeg, rIn);
  const [x4, y4] = polar(startDeg, rIn);
  return [
    `M ${x1} ${y1}`,
    `A ${rOut} ${rOut} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rIn} ${rIn} 0 ${large} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

function buildSectors(players: ArenaPlayer[]) {
  const total = players.reduce((s, p) => s + Math.max(0, p.stake), 0) || 1;
  let angle = 0;
  return players.map((p, i) => {
    const share = Math.max(0, p.stake) / total;
    const sweep = share * 360;
    const startDeg = angle;
    const endDeg = angle + sweep;
    const midDeg = startDeg + sweep / 2;
    angle = endDeg;
    const [ax, ay] = polar(midDeg, AVATAR_R);
    return {
      ...p,
      share,
      startDeg,
      endDeg,
      midDeg,
      color: colorFor(i),
      index: i,
      ax,
      ay,
      path: arcPath(startDeg, endDeg, OUTER_R, INNER_R),
    };
  });
}

function payoutOf(stake: number, pool: number) {
  return stake > 0 && pool > 0 ? (pool * (1 - COMMISSION) * stake) / stake : 0;
}

export default function ArenaGame({
  telegramId,
  tonBalance,
  onBalanceChange,
  onClose,
  onOpenHistory,
}: Props) {
  const { photoUrl } = useTelegram();
  const qc = useQueryClient();
  const { data: profile } = useGetUserProfile(telegramId ?? "", {
    query: { enabled: !!telegramId, refetchInterval: 5000 },
  } as Parameters<typeof useGetUserProfile>[1]);
  const balanceTon = Number(
    (profile as { ton?: string | number } | undefined)?.ton ?? tonBalance ?? 0,
  );
  const balanceTonyx = Number(
    (profile as { tonyxCoins?: string | number; tonyx?: string | number } | undefined)
      ?.tonyxCoins ??
      (profile as { tonyx?: string | number } | undefined)?.tonyx ??
      0,
  );
  const [betCurrency, setBetCurrency] = useState<"ton" | "tonyx">("ton");
  const balance = betCurrency === "ton" ? balanceTon : balanceTonyx;
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
    chance: number;
  } | null>(null);
  const [freezeSectors, setFreezeSectors] = useState<ReturnType<typeof buildSectors> | null>(null);
  const [freezePool, setFreezePool] = useState(0);
  const [customBet, setCustomBet] = useState("");
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoStake, setAutoStake] = useState(0.1);
  const [wheelRot, setWheelRot] = useState(0);
  const [countdown, setCountdown] = useState(0);

  const autoPlayRef = useRef(false);
  const autoStakeRef = useRef(0.1);
  const phaseRef = useRef<Phase>("lobby");
  const arenaIdRef = useRef<number | null>(null);
  const settledRef = useRef<Set<number>>(new Set());
  const rafRef = useRef<number | null>(null);
  const wheelBaseRef = useRef(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    autoPlayRef.current = autoPlay;
  }, [autoPlay]);
  useEffect(() => {
    autoStakeRef.current = autoStake;
  }, [autoStake]);

  function flash(msg: string, type: "ok" | "err" = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2200);
  }

  function runSpinAnimation(data: ArenaState) {
    const sectors = buildSectors(data.players);
    setFreezeSectors(sectors);
    setFreezePool(data.totalPool);
    setPhase("spin");
    arenaIdRef.current = data.id;

    const winner = sectors.find((s) => s.telegramId === data.winnerId) ?? sectors[0];
    if (!winner) {
      setPhase("lobby");
      return;
    }

    // Align winner mid under fixed pointer at top (0°)
    const turns = 5 + Math.floor(Math.random() * 3);
    const target =
      wheelBaseRef.current - turns * 360 - winner.midDeg;

    const start = performance.now();
    const from = wheelBaseRef.current;
    const delta = target - from;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / SPIN_MS);
      const e = easeOutCubic(t);
      const rot = from + delta * e;
      setWheelRot(rot);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        wheelBaseRef.current = rot;
        const stake = winner.stake;
        const pool = data.totalPool;
        const net = pool * (1 - COMMISSION);
        const payout = stake > 0 ? (net * stake) / stake : 0;
        // actual: winner takes whole pool minus commission
        const winAmount = net;
        const mult = stake > 0 ? winAmount / stake : 1;
        setWinnerData({
          name: winner.username || winner.telegramId,
          payout: winAmount,
          mult,
          photo: winner.photoUrl,
          chance: winner.share * 100,
        });
        setPhase("winner");
        setTimeout(() => {
          setPhase("lobby");
          setWinnerData(null);
          setFreezeSectors(null);
          setArena(null);
          fetchState();
          refreshBalance();
        }, 4500);
      }
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

  // Countdown from startAt
  useEffect(() => {
    if (phase !== "lobby" || !arena?.startAt || arena.status !== "starting") {
      setCountdown(0);
      return;
    }
    const tick = () => {
      const ms = new Date(arena.startAt!).getTime() - Date.now();
      setCountdown(Math.max(0, Math.ceil(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [arena?.startAt, arena?.status, phase]);

  useEffect(() => {
    if (arena?.status !== "starting" || !arena.startAt) return;
    const ms = new Date(arena.startAt).getTime() - Date.now();
    if (ms > 35000) return;
    const t = setTimeout(() => fetchState(), Math.max(0, ms + 60));
    return () => clearTimeout(t);
  }, [arena?.status, arena?.startAt, fetchState]);

  // Auto-play
  useEffect(() => {
    if (!autoPlay || phase !== "lobby" || busy) return;
    if (arena?.status === "finished") return;
    const id = setInterval(() => {
      if (!autoPlayRef.current || phaseRef.current !== "lobby") return;
      placeBet(autoStakeRef.current);
    }, 4000);
    return () => clearInterval(id);
  }, [autoPlay, phase, busy, arena?.status]);

  const liveSectors = useMemo(
    () => buildSectors(arena?.players ?? []),
    [arena?.players],
  );
  const sectors = freezeSectors ?? liveSectors;
  const pool = freezeSectors ? freezePool : arena?.totalPool ?? 0;

  async function placeBet(amount: number) {
    if (!telegramId) {
      flash("Откройте в Telegram", "err");
      return;
    }
    if (phase !== "lobby") {
      flash("Дождитесь окончания игры", "err");
      return;
    }
    if (arena?.status === "finished") {
      flash("Игра завершена, подождите…", "err");
      return;
    }
    if (!amount || amount < MIN_STAKE) {
      flash(`Мин. ${MIN_STAKE}`, "err");
      return;
    }
    if (amount > balance + 1e-9) {
      flash("Недостаточно средств", "err");
      return;
    }
    setBusy(true);
    try {
      const me = arena?.players.find((p) => p.telegramId === telegramId);
      const url = me ? "/api/mini/games/arena/increase" : "/api/mini/games/arena/join";
      const body = me
        ? { telegramId, additionalStake: amount, currency: betCurrency }
        : { telegramId, stake: amount, currency: betCurrency };
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
      setArena(d);
      flash(me ? "Ставка увеличена" : "Вы в игре!", "ok");
      refreshBalance();
    } catch {
      flash("Сеть недоступна", "err");
    } finally {
      setBusy(false);
    }
  }

  const centerLabel = (() => {
    if (phase === "spin") return "ИГРА";
    if (phase === "winner") return "ИГРА";
    if (arena?.status === "starting" && countdown > 0)
      return String(countdown).padStart(2, "0");
    if (sectors.length === 0) return "Ожидание";
    if (arena?.status === "waiting") return "Ожидание";
    return "Ожидание";
  })();

  const centerSub =
    phase === "spin" || phase === "winner"
      ? null
      : arena?.status === "starting" && countdown > 0
        ? `00:${String(countdown).padStart(2, "0")}`
        : null;

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "radial-gradient(ellipse at 50% 20%, #1a0a2e 0%, #0a0612 55%, #050308 100%)",
        color: "#e2e8f0",
        paddingBottom: 120,
        fontFamily: "inherit",
      }}
    >
      {/* top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "none",
            color: "#cbd5e1",
            borderRadius: 10,
            padding: "8px 12px",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          ✕ Закрыть
        </button>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: "#fbbf24",
              background: "rgba(251,191,36,0.12)",
              border: "1px solid rgba(251,191,36,0.25)",
              borderRadius: 999,
              padding: "5px 10px",
            }}
          >
            {balanceTon.toFixed(3)} TON
          </span>
          {onOpenHistory && (
            <button
              type="button"
              onClick={onOpenHistory}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "none",
                color: "#94a3b8",
                borderRadius: 10,
                padding: "8px 10px",
                cursor: "pointer",
              }}
            >
              🕐
            </button>
          )}
        </div>
      </div>

      {/* bank */}
      <div style={{ textAlign: "center", marginBottom: 6 }}>
        <div
          style={{
            display: "inline-block",
            background: "rgba(124,92,255,0.18)",
            border: "1px solid rgba(124,92,255,0.35)",
            borderRadius: 999,
            padding: "8px 18px",
            fontWeight: 800,
            fontSize: 14,
            color: "#e9d5ff",
          }}
        >
          ВСЕГО {pool.toFixed(2)} TON
        </div>
      </div>

      {/* WHEEL */}
      <div
        style={{
          position: "relative",
          width: SIZE,
          height: SIZE,
          margin: "8px auto 12px",
        }}
      >
        {/* fixed pointer */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 2,
            transform: "translateX(-50%)",
            zIndex: 5,
            width: 0,
            height: 0,
            borderLeft: "12px solid transparent",
            borderRight: "12px solid transparent",
            borderTop: "18px solid #0f0a1a",
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 4,
            transform: "translateX(-50%)",
            zIndex: 6,
            width: 0,
            height: 0,
            borderLeft: "9px solid transparent",
            borderRight: "9px solid transparent",
            borderTop: "14px solid #e2e8f0",
          }}
        />

        {/* rotating disk */}
        <div
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: "50%",
            transform: `rotate(${wheelRot}deg)`,
            willChange: "transform",
            boxShadow:
              "0 0 0 3px rgba(124,92,255,0.25), 0 20px 50px rgba(0,0,0,0.55)",
            background: "#12081f",
            position: "relative",
          }}
        >
          <svg width={SIZE} height={SIZE} style={{ display: "block" }}>
            {/* empty ring when no players */}
            {!sectors.length && (
              <circle
                cx={CX}
                cy={CY}
                r={OUTER_R}
                fill="#1e1233"
                stroke="rgba(124,92,255,0.2)"
                strokeWidth={2}
              />
            )}
            {sectors.map((s) => (
              <path
                key={s.telegramId}
                d={s.path}
                fill={s.color}
                stroke="rgba(0,0,0,0.25)"
                strokeWidth={1}
                opacity={0.95}
              />
            ))}
            {/* inner hole */}
            <circle cx={CX} cy={CY} r={INNER_R} fill="#0a0612" />
          </svg>

          {/* avatars on sectors */}
          {sectors.map((s) => {
            const size = Math.max(28, Math.min(40, 26 + s.share * 40));
            return (
              <div
                key={`av-${s.telegramId}`}
                style={{
                  position: "absolute",
                  left: s.ax,
                  top: s.ay,
                  width: size,
                  height: size,
                  marginLeft: -size / 2,
                  marginTop: -size / 2,
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: `2px solid ${s.color}`,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
                  background: "#1e1233",
                  // counter-rotate so face stays upright
                  transform: `rotate(${-wheelRot}deg)`,
                }}
              >
                {s.photoUrl || (s.telegramId === telegramId ? photoUrl : null) ? (
                  <img
                    src={
                      s.photoUrl ||
                      (s.telegramId === telegramId ? photoUrl! : "")
                    }
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 800,
                      color: "#fff",
                      background: s.color,
                    }}
                  >
                    {initials(s.username, s.telegramId)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* center hub (fixed, not rotating) */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: INNER_R * 2 - 4,
            height: INNER_R * 2 - 4,
            borderRadius: "50%",
            background: "#0a0612",
            border: "2px solid rgba(255,255,255,0.08)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 4,
            boxShadow: "inset 0 0 20px rgba(0,0,0,0.6)",
          }}
        >
          {centerSub ? (
            <span
              style={{
                fontSize: 22,
                fontWeight: 900,
                color: "#f8fafc",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {centerSub}
            </span>
          ) : (
            <span
              style={{
                fontSize: phase === "spin" || phase === "winner" ? 16 : 13,
                fontWeight: 900,
                color:
                  phase === "spin" || phase === "winner" ? "#4ade80" : "#e2e8f0",
                letterSpacing: 0.5,
              }}
            >
              {centerLabel}
            </span>
          )}
        </div>
      </div>

      {/* winner banner */}
      {phase === "winner" && winnerData && (
        <div
          style={{
            margin: "0 16px 12px",
            padding: 14,
            borderRadius: 16,
            background: "linear-gradient(135deg, rgba(34,197,94,0.2), rgba(124,92,255,0.15))",
            border: "1px solid rgba(34,197,94,0.4)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 12, color: "#86efac", fontWeight: 700 }}>
            Победитель
          </div>
          <div style={{ fontSize: 16, fontWeight: 900, marginTop: 4 }}>
            @{winnerData.name.replace(/^@/, "")}
          </div>
          <div style={{ fontSize: 13, color: "#fbbf24", fontWeight: 800, marginTop: 4 }}>
            +{winnerData.payout.toFixed(2)} TON · x{winnerData.mult.toFixed(2)} ·{" "}
            {winnerData.chance.toFixed(1)}%
          </div>
        </div>
      )}

      {toast && (
        <div
          style={{
            margin: "0 16px 10px",
            padding: "10px 14px",
            borderRadius: 12,
            background:
              toast.type === "ok"
                ? "rgba(34,197,94,0.18)"
                : "rgba(239,68,68,0.18)",
            color: toast.type === "ok" ? "#4ade80" : "#f87171",
            fontSize: 13,
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* betting controls */}
      {phase === "lobby" && (
        <div style={{ padding: "0 16px" }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 10,
              justifyContent: "center",
            }}
          >
            {DEFAULT_BETS.map((v) => (
              <button
                key={v}
                type="button"
                disabled={busy}
                onClick={() => placeBet(v)}
                style={{
                  flex: 1,
                  maxWidth: 64,
                  padding: "10px 0",
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.2)",
                  background: "rgba(30,18,51,0.9)",
                  color: "#e2e8f0",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {v}
              </button>
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => placeBet(Math.max(MIN_STAKE, Math.floor(balance * 1000) / 1000))}
              style={{
                flex: 1.2,
                maxWidth: 80,
                padding: "10px 0",
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg,#7c5cff,#a855f7)",
                color: "#fff",
                fontWeight: 900,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              All In
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input
              value={customBet}
              onChange={(e) => setCustomBet(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="Своя ставка"
              style={{
                flex: 1,
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid rgba(148,163,184,0.2)",
                background: "rgba(15,10,25,0.9)",
                color: "#f1f5f9",
                fontSize: 14,
                fontWeight: 700,
                outline: "none",
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => placeBet(Number(customBet))}
              style={{
                padding: "12px 16px",
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg,#f59e0b,#fbbf24)",
                color: "#1a0a00",
                fontWeight: 900,
                fontSize: 13,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              + В PvP
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setBetCurrency((c) => (c === "ton" ? "tonyx" : "ton"))}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: 12,
                border: "1px solid rgba(148,163,184,0.2)",
                background: "rgba(30,18,51,0.7)",
                color: "#cbd5e1",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {betCurrency === "ton" ? "💎 TON" : "🪙 TONYX"}
            </button>
            <button
              type="button"
              onClick={() => setAutoPlay((v) => !v)}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: 12,
                border: autoPlay
                  ? "1px solid rgba(34,197,94,0.5)"
                  : "1px solid rgba(148,163,184,0.2)",
                background: autoPlay
                  ? "rgba(34,197,94,0.15)"
                  : "rgba(30,18,51,0.7)",
                color: autoPlay ? "#4ade80" : "#cbd5e1",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {autoPlay ? "● Автоплей" : "+ Автоплей"}
            </button>
          </div>

          {/* players list */}
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
            {sectors.length} игрок{sectors.length === 1 ? "" : sectors.length < 5 ? "а" : "ов"}
            {arena?.id ? ` · Игра #${arena.id}` : ""}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sectors.map((s) => (
              <div
                key={s.telegramId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 14,
                  background: "rgba(30,18,51,0.75)",
                  border: `1px solid ${s.color}44`,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    overflow: "hidden",
                    border: `2px solid ${s.color}`,
                    background: s.color,
                    flexShrink: 0,
                  }}
                >
                  {(s.photoUrl || (s.telegramId === telegramId ? photoUrl : null)) ? (
                    <img
                      src={
                        s.photoUrl ||
                        (s.telegramId === telegramId ? photoUrl! : "")
                      }
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {initials(s.username, s.telegramId)}
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 13,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    @{(s.username || s.telegramId).replace(/^@/, "")}
                    {s.telegramId === telegramId ? " · вы" : ""}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    {(s.share * 100).toFixed(1)}%
                  </div>
                </div>
                <div style={{ fontWeight: 900, fontSize: 13, color: "#fbbf24" }}>
                  {s.stake.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === "spin" && (
        <div
          style={{
            textAlign: "center",
            color: "#a78bfa",
            fontWeight: 700,
            fontSize: 14,
            marginTop: 8,
          }}
        >
          PvP начался
        </div>
      )}
    </div>
  );
}
