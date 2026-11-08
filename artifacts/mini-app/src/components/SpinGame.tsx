import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import FairnessModal, { type FairData } from "@/components/FairnessModal";
import SpinHistoryModal from "@/components/SpinHistoryModal";
import { haptic, hapticNotify, useTelegram } from "@/lib/telegram";

interface SpinPlayer {
  telegramId: string;
  username: string | null;
  stake: number;
  chance: number;
  photoUrl?: string | null;
}

interface SpinRound {
  id: number;
  status: "waiting" | "starting" | "finished";
  totalPool: number;
  players: SpinPlayer[];
  winnerId: string | null;
  winnerUsername: string | null;
  startAt: string | null;
  finishedAt: string | null;
  stopFrac?: number | null;
  fair?: FairData;
}

interface LastWinner {
  telegramId: string;
  username: string | null;
  payout: number;
  totalPool: number;
  finishedAt: string | null;
}

const SECTOR_COLORS = [
  "#7c5cff", "#f59e0b", "#22c55e", "#ef4444", "#06b6d4",
  "#ec4899", "#eab308", "#8b5cf6", "#14b8a6", "#f97316",
  "#a855f7", "#3b82f6", "#10b981", "#f43f5e", "#6366f1",
];
const COMMISSION = 0.2;
const MIN_STAKE = 0.1;
const QUICK_BETS = [0.1, 0.5, 1, 5, 10];
const SPIN_MS = 12200;
const AVATAR_MIN_SHARE = 0.03;

const SIZE = 300;
const CX = SIZE / 2;
const CY = SIZE / 2;
const OUTER_R = 138;
const INNER_R = 52;
const AVATAR_R = (OUTER_R + INNER_R) / 2;

let _ctx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!_ctx) _ctx = new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return _ctx;
}
function soundRatchet(volume = 0.12) {
  try {
    const c = getCtx();
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.012), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = Math.min(0.3, volume);
    src.connect(g);
    g.connect(c.destination);
    src.start();
  } catch { /* ignore */ }
}
function soundTick() {
  try {
    const c = getCtx();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.connect(g);
    g.connect(c.destination);
    osc.frequency.value = 880;
    g.gain.setValueAtTime(0.12, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.04);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 0.045);
  } catch { /* ignore */ }
}
function soundFanfare() {
  try {
    const c = getCtx();
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.connect(g);
      g.connect(c.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      const t = c.currentTime + i * 0.14;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.2, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
      osc.start(t);
      osc.stop(t + 0.85);
    });
  } catch { /* ignore */ }
}

function polar(deg: number, r: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

function arcPath(startDeg: number, endDeg: number, rOut: number, rIn: number) {
  const sweep = endDeg - startDeg;
  if (sweep <= 0.05) return "";
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

function buildSectors(players: SpinPlayer[]) {
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
      color: SECTOR_COLORS[i % SECTOR_COLORS.length],
      ax,
      ay,
      path: arcPath(startDeg, endDeg, OUTER_R, INNER_R),
    };
  });
}

function useCountdown(startAt: string | null): number | null {
  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    if (!startAt) {
      setSecs(null);
      return;
    }
    const update = () =>
      setSecs(Math.max(0, Math.ceil((new Date(startAt).getTime() - Date.now()) / 1000)));
    update();
    const iv = setInterval(update, 200);
    return () => clearInterval(iv);
  }, [startAt]);
  return secs;
}

function initials(name: string | null | undefined, id: string) {
  return (name || id || "?").replace(/^@/, "").slice(0, 2).toUpperCase();
}

function PremiumWheel({
  players,
  rotateDeg,
  spinning,
  myId,
  myPhoto,
  centerLabel,
  centerGreen,
}: {
  players: SpinPlayer[];
  rotateDeg: number;
  spinning: boolean;
  myId: string;
  myPhoto?: string | null;
  centerLabel: string;
  centerGreen?: boolean;
}) {
  const sectors = useMemo(() => buildSectors(players), [players]);

  return (
    <div style={{ position: "relative", width: SIZE, height: SIZE, margin: "0 auto" }}>
      <div style={{ position: "absolute", left: "50%", top: 0, transform: "translateX(-50%)", zIndex: 8, width: 0, height: 0, borderLeft: "11px solid transparent", borderRight: "11px solid transparent", borderTop: "16px solid #0f0a1a", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }} />
      <div style={{ position: "absolute", left: "50%", top: 2, transform: "translateX(-50%)", zIndex: 9, width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: "12px solid #f1f5f9" }} />

      <div
        aria-hidden
        style={{
          pointerEvents: "none",
          position: "absolute",
          left: "50%",
          top: "50%",
          width: spinning ? SIZE * 1.55 : SIZE * 0.35,
          height: spinning ? SIZE * 1.55 : SIZE * 0.35,
          marginLeft: spinning ? -(SIZE * 1.55) / 2 : -(SIZE * 0.35) / 2,
          marginTop: spinning ? -(SIZE * 1.55) / 2 : -(SIZE * 0.35) / 2,
          borderRadius: "50%",
          background: spinning
            ? "radial-gradient(circle, rgba(251,191,36,0.45) 0%, rgba(251,191,36,0.22) 25%, rgba(124,92,255,0.2) 50%, transparent 72%)"
            : "radial-gradient(circle, transparent 0%, transparent 100%)",
          opacity: spinning ? 1 : 0,
          transition: spinning
            ? `width ${SPIN_MS * 0.55}ms cubic-bezier(0.15, 0.7, 0.2, 1), height ${SPIN_MS * 0.55}ms cubic-bezier(0.15, 0.7, 0.2, 1), margin ${SPIN_MS * 0.55}ms cubic-bezier(0.15, 0.7, 0.2, 1), opacity 0.9s ease-out, background ${SPIN_MS * 0.4}ms ease-out`
            : "width 0.6s ease, height 0.6s ease, margin 0.6s ease, opacity 0.5s ease",
          zIndex: 0,
          filter: spinning ? "blur(2px)" : "none",
        }}
      />
      <div
        aria-hidden
        style={{
          pointerEvents: "none",
          position: "absolute",
          left: "50%",
          top: "50%",
          width: spinning ? SIZE * 1.25 : SIZE * 0.5,
          height: spinning ? SIZE * 1.25 : SIZE * 0.5,
          marginLeft: spinning ? -(SIZE * 1.25) / 2 : -(SIZE * 0.5) / 2,
          marginTop: spinning ? -(SIZE * 1.25) / 2 : -(SIZE * 0.5) / 2,
          borderRadius: "50%",
          boxShadow: spinning
            ? "0 0 0 2px rgba(251,191,36,0.35), 0 0 30px 10px rgba(251,191,36,0.2), 0 0 60px 20px rgba(124,92,255,0.25)"
            : "0 0 0 0 transparent",
          opacity: spinning ? 1 : 0,
          transition: spinning
            ? `width ${SPIN_MS * 0.65}ms cubic-bezier(0.12, 0.75, 0.15, 1), height ${SPIN_MS * 0.65}ms cubic-bezier(0.12, 0.75, 0.15, 1), margin ${SPIN_MS * 0.65}ms cubic-bezier(0.12, 0.75, 0.15, 1), box-shadow ${SPIN_MS * 0.5}ms ease-out, opacity 0.8s ease-out`
            : "all 0.5s ease",
          zIndex: 0,
        }}
      />

      <div
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: "50%",
          transform: `rotate(${rotateDeg}deg)`,
          transition: spinning
            ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.75, 0.08, 1), box-shadow ${SPIN_MS * 0.45}ms ease-out`
            : "box-shadow 0.7s ease-out",
          willChange: "transform",
          boxShadow: spinning
            ? "0 0 0 4px rgba(251,191,36,0.65), 0 0 22px 6px rgba(251,191,36,0.35), inset 0 0 36px rgba(251,191,36,0.15), 0 20px 50px rgba(0,0,0,0.55)"
            : "0 0 0 3px rgba(124,92,255,0.28), 0 0 0 0 transparent, 0 20px 50px rgba(0,0,0,0.55)",
          background: "#12081f",
          position: "relative",
          zIndex: 2,
        }}
      >
        <svg width={SIZE} height={SIZE} style={{ display: "block", position: "relative", zIndex: 2 }}>
          {!sectors.length && (
            <circle cx={CX} cy={CY} r={OUTER_R} fill="#1e1233" stroke="rgba(124,92,255,0.25)" strokeWidth={2} />
          )}
          {sectors.map((s) => (
            <path key={s.telegramId} d={s.path} fill={s.color} stroke="rgba(0,0,0,0.28)" strokeWidth={1.2} opacity={0.96} />
          ))}
          <circle cx={CX} cy={CY} r={INNER_R} fill="#0a0612" />
        </svg>

        {sectors.map((s) => {
          if (s.share <= AVATAR_MIN_SHARE) return null;
          const size = Math.max(28, Math.min(42, 26 + s.share * 48));
          const photo = s.photoUrl || (s.telegramId === myId ? myPhoto : null) || null;
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
                border: `2.5px solid ${s.color}`,
                boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
                background: s.color,
                transform: `rotate(${-rotateDeg}deg)`,
              }}
            >
              {photo ? (
                <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#fff" }}>
                  {initials(s.username, s.telegramId)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: INNER_R * 2 - 6, height: INNER_R * 2 - 6, borderRadius: "50%", background: "linear-gradient(160deg, #15101f, #0a0612)", border: "2px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 6, boxShadow: centerGreen ? "inset 0 0 24px rgba(0,0,0,0.65), 0 0 32px rgba(251,191,36,0.45), 0 0 48px rgba(124,92,255,0.25)" : "inset 0 0 24px rgba(0,0,0,0.65), 0 0 20px rgba(124,92,255,0.15)", transition: `box-shadow ${SPIN_MS * 0.4}ms ease-out` }}>
        <span style={{ fontSize: centerLabel.length > 6 ? 13 : 20, fontWeight: 900, color: centerGreen ? "#4ade80" : "#f8fafc", letterSpacing: 0.4, fontVariantNumeric: "tabular-nums", textAlign: "center", lineHeight: 1.15 }}>
          {centerLabel}
        </span>
      </div>
    </div>
  );
}

export function JackpotWheel({
  players,
  spinning,
  winnerId,
}: {
  players: SpinPlayer[];
  spinning: boolean;
  winnerId: string | null;
}) {
  const [rotateDeg, setRotateDeg] = useState(0);
  const currentDegRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (spinning) {
      let last = performance.now();
      const tick = (now: number) => {
        const dt = now - last;
        last = now;
        currentDegRef.current = (currentDegRef.current + dt * 0.21) % 360;
        setRotateDeg(currentDegRef.current);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }
    if (winnerId && players.length > 0) {
      const sectors = buildSectors(players);
      const w = sectors.find((s) => s.telegramId === winnerId);
      if (w) {
        const target = -w.midDeg;
        setRotateDeg(target);
        currentDegRef.current = target;
      }
    }
    return undefined;
  }, [spinning, winnerId, players]);

  return (
    <PremiumWheel players={players} rotateDeg={rotateDeg} spinning={spinning} myId="" centerLabel={spinning ? "ИГРА" : "—"} centerGreen={spinning} />
  );
}

interface Props {
  telegramId: string;
  tonBalance: number;
  onBalanceChange: () => void;
  onOpenHistory?: () => void;
}

export default function SpinGame({
  telegramId,
  tonBalance,
  onBalanceChange,
}: Props) {
  const { photoUrl } = useTelegram();
  const [round, setRound] = useState<SpinRound | null>(null);
  const [stake, setStake] = useState(1);
  const [customBet, setCustomBet] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [rotateDeg, setRotateDeg] = useState(0);
  const [winnerBanner, setWinnerBanner] = useState<{ name: string; payout: number; mult: number; chance: number } | null>(null);
  const [showFairness, setShowFairness] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [lastWinner, setLastWinner] = useState<LastWinner | null>(null);

  const rafRef = useRef<number | null>(null);
  const rotateDegRef = useRef(0);
  const seenFinishedId = useRef<number | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const spinningRef = useRef(false);
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spinTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchedIdsRef = useRef<Set<number>>(new Set());

  const flash = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  }, []);

  function finishSpin(data: SpinRound) {
    spinningRef.current = false;
    setSpinning(false);
    soundFanfare();
    const wp = data.players.find((p) => p.telegramId === data.winnerId);
    const ws = wp?.stake ?? 0;
    const payout = Math.round((ws + (data.totalPool - ws) * (1 - COMMISSION)) * 1000) / 1000;
    const mult = ws > 0 ? payout / ws : 1;
    const chance = data.totalPool > 0 ? (ws / data.totalPool) * 100 : 0;
    const name = data.winnerUsername ?? data.winnerId ?? "?";
    setWinnerBanner({ name, payout, mult, chance });
    hapticNotify(data.winnerId === telegramId ? "success" : "error");
    setLastWinner({
      telegramId: data.winnerId!,
      username: data.winnerUsername,
      payout,
      totalPool: data.totalPool,
      finishedAt: new Date().toISOString(),
    });
    setTimeout(() => {
      setWinnerBanner(null);
      onBalanceChange();
      fetchState();
    }, 4500);
  }

  function startSpin(data: SpinRound) {
    if (spinningRef.current) return;
    if (!data.winnerId || !data.players?.length) return;
    spinningRef.current = true;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (spinTimerRef.current) {
      clearTimeout(spinTimerRef.current);
      spinTimerRef.current = null;
    }

    setRound(data);
    setWinnerBanner(null);
    setSpinning(true);

    const players = data.players;
    const sectors = buildSectors(players);
    const winner = sectors.find((s) => s.telegramId === data.winnerId) ?? sectors[0];
    if (!winner) {
      spinningRef.current = false;
      setSpinning(false);
      return;
    }

    const turns = 6 + Math.floor(Math.random() * 2);
    const from = rotateDegRef.current;
    const span = Math.max(0.01, winner.endDeg - winner.startDeg);
    const pad = Math.min(span * 0.1, 3);
    const frac = typeof data.stopFrac === "number" ? Math.min(1, Math.max(0, data.stopFrac)) : 0.5;
    const stopDeg = winner.startDeg + pad + frac * Math.max(0.01, span - pad * 2);
    const adj = (((-stopDeg - from) % 360) + 360) % 360;
    const endAngle = from + turns * 360 + adj;

    setSpinning(false);
    setRotateDeg(from);
    rotateDegRef.current = from;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setSpinning(true);
        setRotateDeg(endAngle);
        rotateDegRef.current = endAngle;

        let ticks = 0;
        const tickIv = setInterval(() => {
          ticks++;
          const progress = ticks / (SPIN_MS / 90);
          if (progress >= 1) {
            clearInterval(tickIv);
            return;
          }
          soundRatchet(0.06 + (1 - progress) * 0.14);
        }, 90);
        spinTickRef.current = tickIv;

        spinTimerRef.current = setTimeout(() => {
          if (spinTickRef.current) {
            clearInterval(spinTickRef.current);
            spinTickRef.current = null;
          }
          finishSpin(data);
        }, SPIN_MS + 80);
      });
    });
  }

  const fetchState = useCallback(async () => {
    try {
      const r = await fetch("/api/mini/games/spin/state");
      if (!r.ok) return;
      const data: SpinRound = await r.json();

      if (data.id && (data.status === "waiting" || data.status === "starting")) {
        watchedIdsRef.current.add(data.id);
      }

      const isFreshFinished =
        data.status === "finished" &&
        !!data.winnerId &&
        (data.players?.length ?? 0) >= 2 &&
        data.id !== seenFinishedId.current &&
        !spinningRef.current;

      if (isFreshFinished) {
        seenFinishedId.current = data.id;
        startSpin(data);
      } else if (!spinningRef.current) {
        setRound(data);
      }
      prevStatusRef.current = data.status;
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetch("/api/mini/games/spin/last-winner")
      .then((r) => r.json())
      .then((lw) => {
        if (lw?.winner) setLastWinner(lw.winner);
      })
      .catch(() => null);
    fetchState();
    const iv = setInterval(fetchState, 900);
    return () => {
      clearInterval(iv);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
      if (spinTickRef.current) clearInterval(spinTickRef.current);
    };
  }, [fetchState]);

  const countdown = useCountdown(round?.status === "starting" ? round.startAt : null);

  useEffect(() => {
    if (countdown !== null && countdown <= 5 && countdown > 0 && round?.status === "starting") {
      soundTick();
    }
  }, [countdown, round?.status]);

  useEffect(() => {
    if (countdown === 0 && round?.status === "starting" && !spinningRef.current) {
      const t = setTimeout(() => fetchState(), 200);
      const t2 = setTimeout(() => fetchState(), 800);
      const t3 = setTimeout(() => fetchState(), 1600);
      return () => {
        clearTimeout(t);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [countdown, round?.status, fetchState]);

  async function placeBet(amount: number) {
    if (!telegramId) {
      flash("Откройте в Telegram", "err");
      return;
    }
    if (spinningRef.current) {
      flash("Дождитесь окончания", "err");
      return;
    }
    if (!amount || amount < MIN_STAKE) {
      flash(`Мин. ${MIN_STAKE} TON`, "err");
      return;
    }
    if (amount > tonBalance + 1e-9) {
      flash("Недостаточно TON", "err");
      return;
    }
    setBusy(true);
    haptic("medium");
    try {
      const players = round?.players ?? [];
      const me = players.find((p) => p.telegramId === telegramId);
      const url = me ? "/api/mini/games/spin/increase" : "/api/mini/games/spin/join";
      const body = me ? { telegramId, additionalStake: amount } : { telegramId, stake: amount };
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
      setRound(d);
      setCustomBet("");
      onBalanceChange();
      hapticNotify("success");
    } catch {
      flash("Сеть", "err");
    } finally {
      setBusy(false);
    }
  }

  const players = round?.players ?? [];
  const me = players.find((p) => p.telegramId === telegramId);
  const totalPool = round?.totalPool ?? 0;
  const canBet = !spinning && (round?.status === "waiting" || round?.status === "starting");

  let centerLabel = "—";
  if (spinning) centerLabel = "ИГРА";
  else if (countdown !== null && countdown > 0) centerLabel = String(countdown);
  else if (round?.status === "waiting") centerLabel = "ЖДЁМ";

  const centerGreen = spinning || !!winnerBanner;

  return (
    <div style={{ minHeight: "100%", padding: "8px 0 24px", fontFamily: "inherit", background: "radial-gradient(ellipse at 50% 0%, #1a0a2e 0%, transparent 55%)" }}>
      <PremiumWheel
        players={players}
        rotateDeg={rotateDeg}
        spinning={spinning}
        myId={telegramId}
        myPhoto={photoUrl}
        centerLabel={centerLabel}
        centerGreen={centerGreen}
      />

      {winnerBanner && (
        <div style={{ margin: "14px 16px 0", padding: 16, borderRadius: 18, background: "linear-gradient(135deg, rgba(34,197,94,0.22), rgba(124,92,255,0.18))", border: "1px solid rgba(34,197,94,0.45)", textAlign: "center", animation: "spinWinIn 0.45s ease-out both" }}>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Победитель</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#4ade80" }}>{winnerBanner.name}</div>
          <div style={{ fontSize: 14, color: "#e2e8f0", marginTop: 4 }}>
            +{winnerBanner.payout} TON · x{winnerBanner.mult.toFixed(2)} · {winnerBanner.chance.toFixed(1)}%
          </div>
        </div>
      )}

      {spinning && (
        <div style={{ textAlign: "center", marginTop: 10, fontSize: 13, color: "#fbbf24", fontWeight: 700 }}>Крутится…</div>
      )}

      <div style={{ margin: "16px 16px 0", padding: 14, borderRadius: 16, background: "rgba(15,23,42,0.9)", border: "1px solid rgba(124,92,255,0.25)" }}>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>Банк: <b style={{ color: "#fbbf24" }}>{totalPool.toFixed(2)} TON</b></div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {QUICK_BETS.map((b) => (
            <button
              key={b}
              type="button"
              disabled={!canBet || busy}
              onClick={() => setStake(b)}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: stake === b ? "1px solid #a78bfa" : "1px solid rgba(255,255,255,0.1)",
                background: stake === b ? "rgba(124,92,255,0.25)" : "rgba(255,255,255,0.05)",
                color: "#e2e8f0",
                fontWeight: 700,
                cursor: canBet ? "pointer" : "not-allowed",
                fontFamily: "inherit",
              }}
            >
              {b}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={MIN_STAKE}
          step={0.1}
          value={customBet || stake}
          onChange={(e) => {
            setCustomBet(e.target.value);
            const n = Number(e.target.value);
            if (Number.isFinite(n)) setStake(n);
          }}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "#0f172a",
            color: "#f1f5f9",
            marginBottom: 10,
            fontFamily: "inherit",
          }}
        />
        <button
          type="button"
          disabled={!canBet || busy}
          onClick={() => void placeBet(stake)}
          style={{
            width: "100%",
            padding: "14px 0",
            borderRadius: 12,
            border: "none",
            background: canBet ? "linear-gradient(135deg,#6d28d9,#a78bfa)" : "rgba(100,116,139,0.3)",
            color: "#fff",
            fontWeight: 900,
            fontSize: 15,
            cursor: canBet ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}
        >
          {busy ? "…" : me ? `Добавить ${stake} TON` : `Ставка ${stake} TON`}
        </button>
      </div>

      {players.length > 0 && (
        <div style={{ margin: "12px 16px 0", fontSize: 12, color: "#94a3b8" }}>
          Игроки ({players.length}):{" "}
          {players.map((p) => `${p.username || p.telegramId} ${p.chance.toFixed(0)}%`).join(" · ")}
        </div>
      )}

      {lastWinner && !winnerBanner && !spinning && (
        <div style={{ margin: "12px 16px", fontSize: 12, color: "#64748b", textAlign: "center" }}>
          Последний: {lastWinner.username || lastWinner.telegramId} · {lastWinner.payout} TON
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: 16, right: 16, padding: 12, borderRadius: 12, background: toast.type === "ok" ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)", color: "#fff", textAlign: "center", fontWeight: 700, zIndex: 50 }}>
          {toast.msg}
        </div>
      )}

      {showHistory && <SpinHistoryModal onClose={() => setShowHistory(false)} onReplay={() => setShowHistory(false)} />}
      {showFairness && round?.fair && (
        <FairnessModal onClose={() => setShowFairness(false)} data={round.fair} gameType="spin" />
      )}
    </div>
  );
}
