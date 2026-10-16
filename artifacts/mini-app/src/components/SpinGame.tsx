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
const SPIN_MS = 7500;
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
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: "50%",
          transform: `rotate(${rotateDeg}deg)`,
          transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.08, 0.85, 0.12, 1)` : "none",
          willChange: "transform",
          boxShadow: spinning
            ? "0 0 0 3px rgba(251,191,36,0.45), 0 0 40px rgba(124,92,255,0.35), 0 20px 50px rgba(0,0,0,0.55)"
            : "0 0 0 3px rgba(124,92,255,0.28), 0 20px 50px rgba(0,0,0,0.55)",
          background: "#12081f",
          position: "relative",
        }}
      >
        <svg width={SIZE} height={SIZE} style={{ display: "block" }}>
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

      <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: INNER_R * 2 - 6, height: INNER_R * 2 - 6, borderRadius: "50%", background: "linear-gradient(160deg, #15101f, #0a0612)", border: "2px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 6, boxShadow: "inset 0 0 24px rgba(0,0,0,0.65), 0 0 20px rgba(124,92,255,0.15)" }}>
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
        currentDegRef.current = (currentDegRef.current + dt * 0.36) % 360;
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
    // Same stop for ALL clients (stopFrac from server fairness hash)
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
      onBalanceChange();
      hapticNotify("success");
      flash(me ? "Ставка увеличена" : "Вы в игре!", "ok");
    } catch {
      flash("Сеть недоступна", "err");
    } finally {
      setBusy(false);
    }
  }

  const players = round?.players ?? [];
  const sectors = useMemo(() => buildSectors(players), [players]);
  const isIn = players.some((p) => p.telegramId === telegramId);
  const myP = players.find((p) => p.telegramId === telegramId);
  const pool = round?.totalPool ?? 0;
  const canBet = !spinning && (round?.status === "waiting" || round?.status === "starting");

  const centerLabel = (() => {
    if (spinning) return "ИГРА";
    if (winnerBanner) return "ИГРА";
    if (round?.status === "starting" && countdown !== null && countdown > 0)
      return `00:${String(countdown).padStart(2, "0")}`;
    if (!players.length) return "Ожидание";
    if (round?.status === "waiting") return "Ожидание";
    return "Ожидание";
  })();

  return (
    <div style={{ minHeight: "100%", padding: "8px 0 24px", fontFamily: "inherit", background: "radial-gradient(ellipse at 50% 0%, #1a0a2e 0%, transparent 55%)" }}>
      <style>{`@keyframes spinWinIn { 0% { opacity: 0; transform: scale(0.85) translateY(12px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }`}</style>

      {toast && (
        <div style={{ position: "fixed", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: toast.type === "ok" ? "rgba(5,150,105,0.96)" : "rgba(220,38,38,0.96)", color: "#fff", borderRadius: 12, padding: "11px 18px", fontSize: 13, fontWeight: 700, boxShadow: "0 8px 28px rgba(0,0,0,0.45)" }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 14px 8px" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#c4b5fd", letterSpacing: 0.3 }}>PvP Spin</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setShowFairness(true)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "7px 10px", color: "#94a3b8", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>🔐</button>
          <button type="button" onClick={() => setShowHistory(true)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "7px 10px", color: "#94a3b8", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>🕐</button>
        </div>
      </div>

      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <div style={{ display: "inline-block", background: "rgba(124,92,255,0.18)", border: "1px solid rgba(124,92,255,0.4)", borderRadius: 999, padding: "8px 20px", fontWeight: 900, fontSize: 15, color: "#e9d5ff", boxShadow: "0 0 24px rgba(124,92,255,0.15)" }}>
          ВСЕГО {pool.toFixed(2)} TON
        </div>
      </div>

      <PremiumWheel players={players} rotateDeg={rotateDeg} spinning={spinning} myId={telegramId} myPhoto={photoUrl} centerLabel={centerLabel} centerGreen={spinning || !!winnerBanner} />

      {winnerBanner && (
        <div style={{ margin: "14px 16px 0", padding: 16, borderRadius: 18, background: "linear-gradient(135deg, rgba(34,197,94,0.22), rgba(124,92,255,0.18))", border: "1px solid rgba(34,197,94,0.45)", textAlign: "center", animation: "spinWinIn 0.45s ease-out both" }}>
          <div style={{ fontSize: 12, color: "#86efac", fontWeight: 800 }}>Победитель</div>
          <div style={{ fontSize: 17, fontWeight: 900, marginTop: 4 }}>@{winnerBanner.name.replace(/^@/, "")}</div>
          <div style={{ fontSize: 14, color: "#fbbf24", fontWeight: 900, marginTop: 6 }}>
            +{winnerBanner.payout.toFixed(2)} TON · x{winnerBanner.mult.toFixed(2)} · {winnerBanner.chance.toFixed(1)}%
          </div>
        </div>
      )}

      {spinning && (
        <div style={{ textAlign: "center", marginTop: 12, color: "#a78bfa", fontWeight: 800, fontSize: 14 }}>PvP начался</div>
      )}

      {canBet && (
        <div style={{ padding: "16px 16px 0" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, justifyContent: "center" }}>
            {QUICK_BETS.map((v) => (
              <button key={v} type="button" disabled={busy} onClick={() => placeBet(v)} style={{ flex: 1, maxWidth: 64, padding: "12px 0", borderRadius: 14, border: "1px solid rgba(148,163,184,0.18)", background: "rgba(30,18,51,0.95)", color: "#e2e8f0", fontWeight: 900, fontSize: 13, cursor: "pointer" }}>{v}</button>
            ))}
            <button type="button" disabled={busy} onClick={() => placeBet(Math.max(MIN_STAKE, Math.floor(tonBalance * 1000) / 1000))} style={{ flex: 1.3, maxWidth: 88, padding: "12px 0", borderRadius: 14, border: "none", background: "linear-gradient(135deg,#7c5cff,#a855f7)", color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 16px rgba(124,92,255,0.35)" }}>All In</button>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <input value={customBet} onChange={(e) => setCustomBet(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Своя ставка" style={{ flex: 1, padding: "13px 14px", borderRadius: 14, border: "1px solid rgba(148,163,184,0.2)", background: "rgba(15,10,25,0.95)", color: "#f1f5f9", fontSize: 14, fontWeight: 700, outline: "none" }} />
            <button type="button" disabled={busy} onClick={() => placeBet(Number(customBet) || stake)} style={{ padding: "13px 18px", borderRadius: 14, border: "none", background: "linear-gradient(135deg,#f59e0b,#fbbf24)", color: "#1a0a00", fontWeight: 900, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
              {isIn ? "+ Добавить" : "+ В PvP"}
            </button>
          </div>

          <div style={{ marginTop: 10, fontSize: 11, color: "#64748b", textAlign: "center" }}>
            Баланс {tonBalance.toFixed(3)} TON{myP ? ` · ваш шанс ${myP.chance.toFixed(1)}%` : ""}
          </div>
        </div>
      )}

      {sectors.length > 0 && (
        <div style={{ padding: "16px 16px 0" }}>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800, marginBottom: 8, letterSpacing: 0.06 }}>
            {sectors.length} игрок{sectors.length === 1 ? "" : sectors.length < 5 ? "а" : "ов"}{round?.id ? ` · #${round.id}` : ""}
          </div>
          {sectors.map((s) => {
            const isMe = s.telegramId === telegramId;
            const isWin = round?.status === "finished" && round.winnerId === s.telegramId;
            const photo = s.photoUrl || (isMe ? photoUrl : null) || null;
            return (
              <div key={s.telegramId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 14, marginBottom: 7, background: isMe ? "rgba(124,92,255,0.12)" : "rgba(30,18,51,0.8)", border: `1px solid ${isWin ? "rgba(34,197,94,0.5)" : isMe ? "rgba(124,92,255,0.4)" : s.color + "33"}` }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", overflow: "hidden", border: `2px solid ${s.color}`, background: s.color, flexShrink: 0 }}>
                  {photo ? (
                    <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "#fff" }}>{initials(s.username, s.telegramId)}</div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isWin ? "#4ade80" : "#f1f5f9" }}>
                    {isWin ? "🏆 " : ""}@{(s.username || s.telegramId).replace(/^@/, "")}{isMe ? " · вы" : ""}
                  </div>
                  <div style={{ height: 4, marginTop: 5, borderRadius: 99, background: "rgba(51,65,85,0.5)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(s.share * 100, 1)}%`, height: "100%", background: s.color, borderRadius: 99 }} />
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 13, color: "#fbbf24" }}>{s.stake.toFixed(2)}</div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>{(s.share * 100).toFixed(1)}%</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {lastWinner && !winnerBanner && !spinning && (
        <div style={{ margin: "14px 16px 0", padding: "10px 14px", borderRadius: 12, background: "rgba(15,23,42,0.6)", fontSize: 12, color: "#94a3b8" }}>
          Последний: <span style={{ color: "#e2e8f0", fontWeight: 700 }}>@{lastWinner.username ?? lastWinner.telegramId}</span> · +{lastWinner.payout.toFixed(2)} TON
        </div>
      )}

      {showHistory && (
        <SpinHistoryModal
          onClose={() => setShowHistory(false)}
          onReplay={(item) => {
            setShowHistory(false);
            if (spinningRef.current) return;
            startSpin({
              id: item.id,
              status: "finished",
              totalPool: item.totalPool,
              players: item.players,
              winnerId: item.winnerId,
              winnerUsername: item.winnerUsername,
              startAt: null,
              finishedAt: item.finishedAt,
              stopFrac: item.stopFrac ?? 0.5,
              fair: item.fair,
            });
          }}
        />
      )}

      {showFairness && round?.fair && (
        <FairnessModal
          fair={round.fair}
          status={round.status}
          gameType="spin"
          gameId={round.id}
          onClose={() => setShowFairness(false)}
          onClientSeedChanged={(seed) => setRound((r) => (r ? { ...r, fair: { ...r.fair!, clientSeed: seed } } : r))}
        />
      )}
    </div>
  );
}
