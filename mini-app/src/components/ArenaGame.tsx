import { useState, useEffect, useRef } from "react";
import { haptic, hapticNotify } from "@/lib/telegram";
import FairnessModal, { type FairData } from "./FairnessModal";

/* ── Types ── */
interface ArenaPlayer {
  telegramId: string;
  username: string | null;
  stake: number;
  chance: number;
}

interface ArenaState {
  id: number;
  status: "waiting" | "starting" | "finished";
  totalPool: number;
  playerCount: number;
  players: ArenaPlayer[];
  winnerId: string | null;
  winnerUsername: string | null;
  startAt: string | null;
  finishedAt: string | null;
  fair?: FairData;
}

interface StatEntry {
  username: string | null;
  payout: number;
  totalPool: number;
  playerCount: number;
}

/* ── Constants ── */
const ARENA_COLORS = [
  "#5BE12C", "#FF4136", "#FF9F00", "#00C0FF",
  "#B044FF", "#FFEB3B", "#FF69B4", "#00FFB2",
  "#FF6E40", "#39CCCC",
];
const col = (i: number) => ARENA_COLORS[i % ARENA_COLORS.length];

const QUICK_STAKES = [0.1, 0.5, 1, 2, 5, 10];

/* ── Helpers ── */
function pName(p: ArenaPlayer) {
  return p.username ? `@${p.username}` : `#${p.telegramId.slice(-5)}`;
}
function fmtTimer(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
function fmtTON(v: number) {
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/, "");
}

/* ── Square Arena helpers ── */
const SQ = 290;
const CX = SQ / 2;
const CY = SQ / 2;
const HW = SQ / 2;
const HH = SQ / 2;
const BALL_R  = 9;

function squarePoint(deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const t = ax < 1e-9 ? HH / ay : ay < 1e-9 ? HW / ax : Math.min(HW / ax, HH / ay);
  return [CX + t * dx, CY + t * dy];
}

function squareSectorPoints(startDeg: number, endDeg: number, steps = 48): string {
  const pts: [number, number][] = [[CX, CY]];
  for (let i = 0; i <= steps; i++) {
    const a = startDeg + ((endDeg - startDeg) * i) / steps;
    pts.push(squarePoint(a));
  }
  return pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

function sectorAvatarPos(startDeg: number, endDeg: number, fraction = 0.58): [number, number] {
  const mid = (startDeg + endDeg) / 2;
  const [px, py] = squarePoint(mid);
  return [CX + (px - CX) * fraction, CY + (py - CY) * fraction];
}

function sectorCentroid(startDeg: number, endDeg: number): [number, number] {
  const N = 32;
  let sx = CX, sy = CY;
  let count = 1;
  for (let i = 0; i <= N; i++) {
    const a = startDeg + (endDeg - startDeg) * i / N;
    const [px, py] = squarePoint(a);
    sx += px; sy += py; count++;
  }
  return [sx / count, sy / count];
}

interface Sector {
  points: string;
  color: string;
  startDeg: number;
  endDeg: number;
  avatarX: number;
  avatarY: number;
  player: ArenaPlayer;
  idx: number;
}

/* ── Toast ── */
function Toast({ msg, type }: { msg: string; type: "success" | "error" | "info" }) {
  const bg = type === "success" ? "rgba(22,163,74,0.97)"
    : type === "error" ? "rgba(220,38,38,0.97)"
    : "rgba(30,64,175,0.97)";
  return (
    <div style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
      background: bg, color: "#fff", padding: "12px 22px", borderRadius: 12,
      fontSize: 14, fontWeight: 600, zIndex: 9999, maxWidth: "88vw",
      boxShadow: "0 8px 28px rgba(0,0,0,0.55)", whiteSpace: "pre-line", textAlign: "center",
    }}>{msg}</div>
  );
}

/* ── Stat Card ── */
function StatCard({
  label, username, amount, badge, onClick,
}: { label: string; username: string | null; amount: number; badge?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: 1, background: "#111827", border: "1px solid #1F2937",
        borderRadius: 12, padding: "9px 12px", minWidth: 0,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={{ fontSize: 10, color: "#4B5563", fontWeight: 600, letterSpacing: "0.07em", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        {badge && (
          <div style={{
            width: 22, height: 22, borderRadius: "50%",
            background: "linear-gradient(135deg,#6366F1,#8B5CF6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, fontWeight: 800, color: "#fff", flexShrink: 0,
          }}>{badge}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "#D1D5DB", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {username ? `@${username}` : "—"}
          </div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#F59E0B", whiteSpace: "nowrap", flexShrink: 0 }}>
          +{fmtTON(amount)} ▽
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════ */
export default function ArenaGame({
  telegramId, tonBalance, onBalanceChange, onClose, onOpenHistory,
}: {
  telegramId: string;
  tonBalance: number;
  onBalanceChange: () => void;
  onClose: () => void;
  onOpenHistory?: () => void;
}) {
  const [arena, setArena] = useState<ArenaState | null>(null);
  const [topGame, setTopGame] = useState<StatEntry | null>(null);
  const [lastGame, setLastGame] = useState<StatEntry | null>(null);

  /* ── Unified stake state ── */
  const [joinStake, setJoinStake] = useState(0.5);
  const [joinInput, setJoinInput] = useState("0.5");
  const [increaseAmt, setIncreaseAmt] = useState(0.5);
  const [increaseInput, setIncreaseInput] = useState("0.5");
  const [showIncreasePanel, setShowIncreasePanel] = useState(false);

  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [animPhase, setAnimPhase] = useState<"idle" | "revealed" | "payout">("idle");
  const [pendingResult, setPendingResult] = useState<{ won: boolean; payout: number; name: string } | null>(null);
  const [onlineCount, setOnlineCount] = useState(15 + Math.floor(Math.random() * 12));
  const [showFairness, setShowFairness] = useState(false);

  const prevStatusRef = useRef<string | null>(null);
  const prevArenaIdRef = useRef<number | null>(null);

  const ballStateRef      = useRef<"IDLE" | "RUNNING">("IDLE");
  const ballCircleRef     = useRef<SVGCircleElement | null>(null);
  const ballGlowRef       = useRef<SVGCircleElement | null>(null);
  const ballPosRef        = useRef({ x: CX, y: CY });
  const ballVelRef        = useRef({ vx: 0, vy: 0 });
  const ballTargetRef     = useRef<{ x: number; y: number } | null>(null);
  const ballStoppedRef    = useRef(false);
  const runStartTimeRef   = useRef<number | null>(null);
  const rafRef            = useRef<number | null>(null);
  const prevCountdownRef  = useRef<number | null>(null);
  const sectorsRef        = useRef<Sector[]>([]);
  const onBallStopRef     = useRef<(() => void) | null>(null);
  const cancelTimersRef   = useRef<(() => void) | null>(null);

  const flash = (msg: string, type: "success" | "error" | "info" = "info") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3200);
  };

  /* ── Helpers for stake input sync ── */
  const setJoin = (v: number) => {
    const rounded = Math.round(v * 1000) / 1000;
    setJoinStake(rounded);
    setJoinInput(String(rounded));
  };
  const setIncrease = (v: number) => {
    const rounded = Math.round(v * 1000) / 1000;
    setIncreaseAmt(rounded);
    setIncreaseInput(String(rounded));
  };

  /* ── Online count flicker ── */
  useEffect(() => {
    const t = setInterval(() => {
      setOnlineCount(prev => Math.max(8, prev + Math.floor(Math.random() * 5) - 2));
    }, 7000);
    return () => clearInterval(t);
  }, []);

  /* ── Detect finish ── */
  const handleUpdate = (fresh: ArenaState) => {
    const prev = prevStatusRef.current;
    const prevId = prevArenaIdRef.current;

    if (
      (prev === "starting" || prev === "waiting") &&
      fresh.status === "finished" &&
      fresh.winnerId &&
      prevId === fresh.id
    ) {
      const wp = fresh.players.find(p => p.telegramId === fresh.winnerId);
      if (wp) {
        const others = fresh.totalPool - wp.stake;
        const payout = Math.round((wp.stake + others * 0.80) * 1000) / 1000;
        const result = { won: fresh.winnerId === telegramId, payout, name: pName(wp) };
        setPendingResult(result);
        fetchStats();

        cancelTimersRef.current?.();
        onBallStopRef.current = () => {
          hapticNotify(result.won ? "success" : "error");
          setAnimPhase("revealed");
          let t1: ReturnType<typeof setTimeout>;
          let t2: ReturnType<typeof setTimeout>;
          cancelTimersRef.current = () => { clearTimeout(t1); clearTimeout(t2); };
          t1 = setTimeout(() => {
            setAnimPhase("payout");
            onBalanceChange();
            t2 = setTimeout(() => {
              setAnimPhase("idle");
              setPendingResult(null);
              onBallStopRef.current = null;
              cancelTimersRef.current = null;
            }, 4000);
          }, 1500);
        };
      }
    }

    prevStatusRef.current = fresh.status;
    if (fresh.status !== "finished") prevArenaIdRef.current = fresh.id;
    setArena(fresh);

    if (fresh.status === "starting" && fresh.startAt) {
      const secs = Math.max(0, Math.ceil((new Date(fresh.startAt).getTime() - Date.now()) / 1000));
      setCountdown(secs);
    } else if (fresh.status === "waiting") {
      setCountdown(null);
    }
  };

  const fetchArena = async () => {
    try {
      const r = await fetch("/api/mini/games/arena/state");
      if (r.ok) handleUpdate(await r.json());
    } catch { /* offline */ }
  };

  const fetchStats = async () => {
    try {
      const [bigR, lastR] = await Promise.all([
        fetch("/api/mini/games/arena/biggest-winner"),
        fetch("/api/mini/games/arena/last-winner"),
      ]);
      if (bigR.ok) { const d = await bigR.json(); if (d.winner) setTopGame(d.winner); }
      if (lastR.ok) { const d = await lastR.json(); if (d.winner) setLastGame(d.winner); }
    } catch { /* offline */ }
  };

  useEffect(() => {
    fetchArena();
    fetchStats();
    const id = setInterval(fetchArena, 2500);
    return () => clearInterval(id);
  }, []);

  /* ── Countdown tick ── */
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => (c !== null && c > 0 ? c - 1 : 0)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  /* ── Ball animation RAF loop ── */
  useEffect(() => {
    let active = true;
    const EDGE = 2;
    const FREE_MS    = 3500;
    const ATTRACT_MS = 4500;

    const place = (nx: number, ny: number) => {
      ballPosRef.current = { x: nx, y: ny };
      ballCircleRef.current?.setAttribute("cx", nx.toFixed(2));
      ballCircleRef.current?.setAttribute("cy", ny.toFixed(2));
      ballGlowRef.current?.setAttribute("cx",   nx.toFixed(2));
      ballGlowRef.current?.setAttribute("cy",   ny.toFixed(2));
    };

    const wallBounce = (nx: number, ny: number, vx: number, vy: number) => {
      if (nx - BALL_R <= EDGE)      { nx = BALL_R + EDGE;      vx =  Math.abs(vx); }
      if (nx + BALL_R >= SQ - EDGE) { nx = SQ - BALL_R - EDGE; vx = -Math.abs(vx); }
      if (ny - BALL_R <= EDGE)      { ny = BALL_R + EDGE;      vy =  Math.abs(vy); }
      if (ny + BALL_R >= SQ - EDGE) { ny = SQ - BALL_R - EDGE; vy = -Math.abs(vy); }
      return { nx, ny, vx, vy };
    };

    const step = () => {
      if (!active) return;

      if (ballStateRef.current === "IDLE") {
        place(CX, CY);
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      if (ballStoppedRef.current) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      const elapsed = runStartTimeRef.current !== null
        ? performance.now() - runStartTimeRef.current
        : 0;

      const pos = ballPosRef.current;
      let { vx, vy } = ballVelRef.current;

      if (elapsed >= ATTRACT_MS && ballTargetRef.current) {
        const tgt = ballTargetRef.current;
        const dx  = tgt.x - pos.x;
        const dy  = tgt.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 2) {
          ballStoppedRef.current = true;
          ballVelRef.current = { vx: 0, vy: 0 };
          place(tgt.x, tgt.y);
          const cb = onBallStopRef.current;
          onBallStopRef.current = null;
          cb?.();
          rafRef.current = requestAnimationFrame(step);
          return;
        }

        vx = dx * 0.10;
        vy = dy * 0.10;
        ballVelRef.current = { vx, vy };
        place(pos.x + vx, pos.y + vy);
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      // suppress unused warning
      void FREE_MS;

      vx *= 0.995;
      vy *= 0.995;
      const b = wallBounce(pos.x + vx, pos.y + vy, vx, vy);
      ballVelRef.current = { vx: b.vx, vy: b.vy };
      place(b.nx, b.ny);
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /* ── Ball state transitions ── */
  useEffect(() => {
    const launchBall = () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3.5 + Math.random() * 1.5;
      ballStateRef.current   = "RUNNING";
      ballStoppedRef.current = false;
      ballPosRef.current     = { x: CX, y: CY };
      ballVelRef.current     = { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
      runStartTimeRef.current = performance.now();
    };

    if (prevCountdownRef.current !== null && prevCountdownRef.current > 0 && countdown === 0) {
      launchBall();
    }

    if (arena?.status === "finished" && arena?.winnerId && !ballTargetRef.current) {
      const win = sectorsRef.current.find(s => s.player.telegramId === arena.winnerId);
      if (win) {
        const [tx, ty] = sectorCentroid(win.startDeg, win.endDeg);
        ballTargetRef.current = { x: tx, y: ty };
      }
      if (ballStateRef.current === "IDLE") launchBall();
    }

    if (arena?.status === "waiting") {
      cancelTimersRef.current?.();
      cancelTimersRef.current  = null;
      onBallStopRef.current    = null;
      ballStateRef.current     = "IDLE";
      ballPosRef.current       = { x: CX, y: CY };
      ballVelRef.current       = { vx: 0, vy: 0 };
      ballTargetRef.current    = null;
      ballStoppedRef.current   = false;
      runStartTimeRef.current  = null;
      setAnimPhase("idle");
      setPendingResult(null);
    }

    prevCountdownRef.current = countdown;
  }, [countdown, arena?.status, arena?.winnerId]);

  /* ── Join ── */
  const join = async () => {
    if (!joinStake || joinStake < 0.1) { flash("Минимальная ставка 0.1 TON", "error"); return; }
    if (joinStake > tonBalance) { flash("Недостаточно TON", "error"); return; }
    setBusy(true); haptic("heavy");
    try {
      const r = await fetch("/api/mini/games/arena/join", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, stake: joinStake }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? "Ошибка", "error"); return; }
      handleUpdate(d);
      onBalanceChange();
      hapticNotify("success");
      flash("✅ Вы в арене!", "success");
    } catch { flash("Ошибка сети", "error"); }
    finally { setBusy(false); }
  };

  /* ── Increase ── */
  const increaseStake = async () => {
    if (increaseAmt <= 0) { flash("Укажи сумму", "error"); return; }
    if (increaseAmt > tonBalance) { flash("Недостаточно TON", "error"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/mini/games/arena/increase", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, additionalStake: increaseAmt }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? "Ошибка", "error"); return; }
      handleUpdate(d);
      onBalanceChange();
      flash(`+${increaseAmt} TON к ставке`, "success");
      setShowIncreasePanel(false);
    } catch { flash("Ошибка сети", "error"); }
    finally { setBusy(false); }
  };

  const players = arena?.players ?? [];
  const totalPool = arena?.totalPool ?? 0;
  const isIn = players.some(p => p.telegramId === telegramId);
  const myP = players.find(p => p.telegramId === telegramId);
  const isStarting = arena?.status === "starting";
  const isFinished = arena?.status === "finished";

  /* ── Build square sectors ── */
  const sectors: Sector[] = [];
  if (players.length > 0) {
    let acc = 0;
    players.forEach((p, i) => {
      const frac = totalPool > 0 ? p.stake / totalPool : 1 / players.length;
      const startDeg = acc * 360;
      const endDeg = (acc + frac) * 360;
      const [ax, ay] = sectorAvatarPos(startDeg, endDeg);
      sectors.push({
        points: squareSectorPoints(startDeg, endDeg),
        color: col(i),
        startDeg,
        endDeg,
        avatarX: ax,
        avatarY: ay,
        player: p,
        idx: i,
      });
      acc += frac;
    });
  }
  sectorsRef.current = sectors;

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#0B0F14",
      display: "flex", flexDirection: "column",
      zIndex: 100,
      fontFamily: "'Inter', system-ui, sans-serif",
      overflowY: "auto",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        @keyframes fadeScaleIn { from{opacity:0;transform:scale(0.85)} to{opacity:1;transform:scale(1)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulseGlow { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes timerPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
        @keyframes winnerSectorPulse { 0%,100%{opacity:0.20} 50%{opacity:0.55} }
      `}</style>

      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* ── Result Overlay ── */}
      {pendingResult && animPhase !== "idle" && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#111827", borderRadius: 24, padding: "36px 44px", textAlign: "center",
            border: `2px solid ${pendingResult.won ? "#4ADE80" : "#F43F5E"}`,
            boxShadow: `0 0 60px ${pendingResult.won ? "rgba(74,222,128,0.4)" : "rgba(244,63,94,0.35)"}`,
            animation: "fadeScaleIn 0.35s ease",
          }}>
            <div style={{ fontSize: 54, marginBottom: 10 }}>
              {pendingResult.won ? "🏆" : "😔"}
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: pendingResult.won ? "#4ADE80" : "#F43F5E", marginBottom: 6 }}>
              {pendingResult.won ? "ПОБЕДА!" : "Не повезло"}
            </div>
            {animPhase === "payout" && pendingResult.won && (
              <div style={{ fontSize: 30, fontWeight: 900, color: "#FBBF24", marginBottom: 4, animation: "fadeScaleIn 0.4s ease" }}>
                +{pendingResult.payout} TON
              </div>
            )}
            <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
              {pendingResult.won
                ? animPhase === "payout" ? "Выигрыш зачислен на баланс" : "Шарик в вашем секторе!"
                : `Победил ${pendingResult.name}`}
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ROW 1 ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px 8px",
        background: "#0d1117",
        borderBottom: "1px solid #161B22",
        flexShrink: 0,
      }}>
        <button
          onClick={() => { haptic("light"); onClose(); }}
          style={{
            background: "none", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
            color: "#9CA3AF", fontSize: 14, fontWeight: 600, fontFamily: "inherit",
            padding: "4px 0",
          }}
        >
          <span style={{ fontSize: 16 }}>✕</span> Закрыть
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%", background: "#22C55E",
            boxShadow: "0 0 8px rgba(34,197,94,0.8)",
            animation: "pulseGlow 2s ease-in-out infinite",
          }} />
          <span style={{ fontSize: 13, color: "#9CA3AF", fontWeight: 500 }}>{onlineCount} онлайн</span>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setShowFairness(true)}
            style={{
              background: "#161B22", border: "1px solid #21262D", borderRadius: 8,
              width: 34, height: 34, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#9CA3AF", fontSize: 16,
            }}
          >🔐</button>
          <button
            onClick={() => onOpenHistory?.()}
            style={{
              background: "#161B22", border: "1px solid #21262D", borderRadius: 8,
              width: 34, height: 34, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#9CA3AF", fontSize: 16,
            }}
          >📋</button>
        </div>
      </div>

      {/* ── HEADER ROW 2 — Balance ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        padding: "8px 16px",
        background: "#0d1117",
        flexShrink: 0,
      }}>
        <div style={{
          background: "#161B22", border: "1px solid #21262D",
          borderRadius: 20, padding: "6px 14px",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 13 }}>▽</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#E5E7EB" }}>
            {tonBalance.toFixed(2)} TON
          </span>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px 24px" }}>

        {/* ── STAT CARDS (clickable → history) ── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <StatCard
            label="ТОП ИГРА"
            username={topGame?.username ?? null}
            amount={topGame?.payout ?? 0}
            badge={topGame ? (topGame.username ?? "?").slice(0, 2).toUpperCase() : undefined}
            onClick={onOpenHistory}
          />
          <StatCard
            label="ПОСЛЕДНЯЯ ИГРА"
            username={lastGame?.username ?? null}
            amount={lastGame?.payout ?? 0}
            badge={lastGame ? (lastGame.username ?? "?").slice(0, 2).toUpperCase() : undefined}
            onClick={onOpenHistory}
          />
        </div>

        {/* ── ARENA BLOCK ── */}
        <div style={{
          background: "#0d1117", border: "1px solid #161B22",
          borderRadius: 18, overflow: "hidden", marginBottom: 12,
        }}>
          {/* Arena header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px",
            borderBottom: "1px solid #161B22",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13 }}>▽</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#F59E0B" }}>
                Тотал {fmtTON(totalPool)} TON
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {isStarting ? (
                <>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 8px rgba(34,197,94,0.8)", animation: "pulseGlow 1.2s ease-in-out infinite" }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#22C55E" }}>В эфире</span>
                  {countdown !== null && countdown > 0 && (
                    <span style={{
                      marginLeft: 8, fontSize: 14, fontWeight: 900,
                      color: countdown <= 5 ? "#F87171" : "#fff",
                      fontVariantNumeric: "tabular-nums",
                      animation: countdown <= 5 ? "timerPulse 0.8s ease-in-out infinite" : "none",
                    }}>{fmtTimer(countdown)}</span>
                  )}
                </>
              ) : isFinished ? (
                <span style={{ fontSize: 13, fontWeight: 600, color: "#6B7280" }}>Завершено</span>
              ) : (
                <>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#F59E0B", animation: "pulseGlow 2s ease-in-out infinite" }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#F59E0B" }}>Ожидание игроков</span>
                </>
              )}
            </div>
          </div>

          {/* ── ARENA SQUARE ── */}
          <div style={{
            display: "flex", justifyContent: "center", alignItems: "center",
            padding: "14px 14px 12px",
            background: "#0d1117",
          }}>
            <div style={{
              position: "relative",
              width: SQ, height: SQ,
              flexShrink: 0,
              borderRadius: 16,
              overflow: "hidden",
              boxShadow: "0 0 0 1px #1F2937, 0 8px 32px rgba(0,0,0,0.5)",
            }}>
              <svg width={SQ} height={SQ} style={{ position: "absolute", inset: 0, display: "block" }}>
                <rect x={0} y={0} width={SQ} height={SQ} fill="#111827" />

                {players.length > 0 && sectors.map(s => (
                  <polygon
                    key={s.player.telegramId}
                    points={s.points}
                    fill={s.color}
                    opacity={0.92}
                  />
                ))}

                {sectors.length >= 2 && sectors.map(s => {
                  const [ex, ey] = squarePoint(s.startDeg);
                  return (
                    <line
                      key={`div-${s.player.telegramId}`}
                      x1={CX} y1={CY}
                      x2={ex} y2={ey}
                      stroke="#0d1117" strokeWidth={3}
                    />
                  );
                })}

                {animPhase !== "idle" && sectors.map(s => {
                  if (arena?.winnerId !== s.player.telegramId) return null;
                  return (
                    <polygon
                      key={`win-${s.player.telegramId}`}
                      points={s.points}
                      fill={s.color}
                      opacity={0.35}
                      style={{ animation: "winnerSectorPulse 0.7s ease-in-out infinite" }}
                    />
                  );
                })}

                {players.length >= 1 && (
                  <>
                    <circle
                      ref={ballGlowRef}
                      cx={CX} cy={CY}
                      r={BALL_R + 6}
                      fill="white"
                      opacity={0.15}
                    />
                    <circle
                      ref={ballCircleRef}
                      cx={CX} cy={CY}
                      r={BALL_R}
                      fill="white"
                      stroke="rgba(0,0,0,0.3)"
                      strokeWidth={1.5}
                      style={{ filter: "drop-shadow(0 2px 10px rgba(255,255,255,0.8))" }}
                    />
                  </>
                )}
              </svg>

              {sectors.map(s => {
                const isWinner = animPhase !== "idle" && arena?.winnerId === s.player.telegramId;
                const isMe = s.player.telegramId === telegramId;
                const AV = isWinner ? 44 : 36;
                return (
                  <div key={s.player.telegramId} style={{
                    position: "absolute",
                    left: s.avatarX - AV / 2,
                    top: s.avatarY - AV / 2,
                    width: AV, height: AV,
                    borderRadius: "50%",
                    background: isWinner ? s.color : s.color + "30",
                    border: `${isWinner ? 3 : 2}px solid ${isWinner ? "#fff" : s.color}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexDirection: "column",
                    boxShadow: isWinner
                      ? `0 0 0 3px ${s.color}, 0 0 24px ${s.color}`
                      : isMe
                      ? `0 0 14px ${s.color}99`
                      : "none",
                    zIndex: isWinner ? 20 : 10,
                    transition: "all 0.4s ease",
                  }} />
                );
              })}
            </div>
          </div>
        </div>

        {/* ── ACTION ROW ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          marginBottom: 10,
        }}>
          {isIn && myP ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                background: "#111827", border: "1px solid #1F2937",
                borderRadius: 20, padding: "6px 14px",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <span style={{ fontSize: 13 }}>▽</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#E5E7EB" }}>
                  {fmtTON(myP.stake)}
                </span>
              </div>
              {arena?.status === "waiting" && (
                <button
                  onClick={() => setShowIncreasePanel(v => !v)}
                  style={{
                    background: "#1D4ED8", border: "none", borderRadius: 10,
                    width: 34, height: 34, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, color: "#fff",
                  }}
                >+</button>
              )}
            </div>
          ) : (
            <div style={{
              background: "#111827", border: "1px solid #1F2937",
              borderRadius: 20, padding: "6px 14px",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <span style={{ fontSize: 13 }}>▽</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#4B5563" }}>0</span>
            </div>
          )}
        </div>

        {/* ── INCREASE STAKE PANEL ── */}
        {isIn && showIncreasePanel && arena?.status === "waiting" && (
          <div style={{
            background: "#0d1117", border: "1px solid #1D4ED855",
            borderRadius: 14, padding: "12px", marginBottom: 10,
            animation: "slideUp 0.2s ease",
          }}>
            <div style={{ fontSize: 11, color: "#4B5563", fontWeight: 600, marginBottom: 8 }}>Добавить к ставке</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {[0.1, 0.5, 1, 2, 5].map(v => (
                <button
                  key={v}
                  onClick={() => setIncrease(v)}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                    background: increaseAmt === v ? "#1D4ED8" : "#161B22",
                    color: increaseAmt === v ? "#fff" : "#6B7280",
                    fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}
                >+{v}</button>
              ))}
            </div>
            <div style={{ position: "relative", marginBottom: 8 }}>
              <input
                value={increaseInput}
                onChange={e => {
                  setIncreaseInput(e.target.value);
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v > 0) setIncreaseAmt(Math.round(v * 1000) / 1000);
                }}
                placeholder="Своя сумма..."
                type="number" step="0.1" min="0.1"
                style={{
                  width: "100%", background: "#161B22",
                  border: "1px solid #21262D", borderRadius: 8,
                  padding: "9px 46px 9px 12px", color: "#E5E7EB",
                  fontSize: 13, outline: "none", boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#4B5563", fontWeight: 700 }}>TON</span>
            </div>
            <button
              onClick={increaseStake}
              disabled={busy || increaseAmt <= 0 || increaseAmt > tonBalance}
              style={{
                width: "100%", padding: "11px", borderRadius: 10, border: "none",
                background: busy || increaseAmt <= 0 || increaseAmt > tonBalance ? "#1F2937" : "linear-gradient(135deg,#1D4ED8,#3B82F6)",
                color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            >{busy ? "..." : `Добавить +${increaseAmt} TON`}</button>
          </div>
        )}

        {/* ── JOIN FORM (not in game) ── */}
        {!isIn && !isFinished && (
          <div style={{ marginBottom: 12 }}>
            {/* Quick stake buttons */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              {QUICK_STAKES.map(v => (
                <button
                  key={v}
                  onClick={() => setJoin(v)}
                  style={{
                    flex: "1 1 auto", minWidth: 44, padding: "9px 4px", borderRadius: 10, border: "none",
                    background: joinStake === v
                      ? "linear-gradient(135deg,#D97706,#F59E0B)"
                      : "#111827",
                    color: joinStake === v ? "#fff" : "#4B5563",
                    fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                    boxShadow: joinStake === v ? "0 0 12px rgba(245,158,11,0.4)" : "none",
                    transition: "all 0.15s",
                  }}
                >{v}</button>
              ))}
            </div>

            {/* Manual input */}
            <div style={{ position: "relative", marginBottom: 10 }}>
              <input
                value={joinInput}
                onChange={e => {
                  setJoinInput(e.target.value);
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v > 0) setJoinStake(Math.round(v * 1000) / 1000);
                }}
                onFocus={() => {
                  /* deselect quick button when typing */
                }}
                placeholder="Своя сумма..."
                type="number" step="0.1" min="0.1"
                style={{
                  width: "100%", background: "#0d1117",
                  border: "1px solid #21262D", borderRadius: 10,
                  padding: "10px 52px 10px 14px", color: "#E5E7EB",
                  fontSize: 14, outline: "none", boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#4B5563", fontWeight: 700 }}>TON</span>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={join}
                disabled={busy || joinStake < 0.1 || joinStake > tonBalance}
                style={{
                  flex: 1, padding: "14px 0", borderRadius: 12, border: "none",
                  background: busy || joinStake < 0.1 || joinStake > tonBalance
                    ? "#1F2937"
                    : "linear-gradient(135deg,#D97706,#F59E0B)",
                  color: joinStake > tonBalance ? "#6B7280" : "#fff",
                  fontSize: 15, fontWeight: 800,
                  cursor: busy || joinStake < 0.1 || joinStake > tonBalance ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {busy ? "..." : joinStake > tonBalance ? "Недостаточно TON" : `➕ Войти · ${fmtTON(joinStake)} TON`}
              </button>
            </div>
          </div>
        )}

        {/* ── Already in the arena ── */}
        {isIn && myP && (
          <div style={{
            background: "rgba(29,78,216,0.1)", border: "1px solid rgba(29,78,216,0.3)",
            borderRadius: 14, padding: "12px 16px", marginBottom: 12,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 11, color: "#1D4ED8", fontWeight: 600 }}>Ваша ставка</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#fff" }}>
                {fmtTON(myP.stake)} <span style={{ fontSize: 13, color: "#6B7280" }}>TON</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#6B7280" }}>Шанс победы</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#4ADE80" }}>{myP.chance.toFixed(1)}%</div>
            </div>
          </div>
        )}

        {/* If-win preview */}
        {isIn && myP && totalPool > myP.stake && (
          <div style={{
            background: "#0d1117", border: "1px solid #161B22",
            borderRadius: 12, padding: "10px 14px", marginBottom: 12,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ fontSize: 12, color: "#4B5563" }}>💡 Если победишь</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#4ADE80" }}>
              +{(myP.stake + (totalPool - myP.stake) * 0.80).toFixed(3)} TON
            </div>
          </div>
        )}

        {/* Finished — new game incoming */}
        {isFinished && (
          <div style={{
            textAlign: "center", padding: "14px 0", marginBottom: 12,
            color: "#4B5563", fontSize: 13,
          }}>
            ⏳ Новая игра начинается…
          </div>
        )}

        {/* ── PLAYER LIST ── */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 10,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#E5E7EB" }}>
            Игроки <span style={{ color: "#4B5563" }}>· {players.length}</span>
          </div>
          {arena && (
            <div style={{ fontSize: 11, color: "#374151", fontWeight: 600, letterSpacing: "0.04em" }}>
              ИГРА #{arena.id.toString().padStart(6, "0")}
            </div>
          )}
        </div>

        {players.length === 0 && (
          <div style={{ textAlign: "center", padding: "24px 0", color: "#374151", fontSize: 13 }}>
            Нет игроков. Будь первым!
          </div>
        )}

        {players.map((p, i) => {
          const isMe = p.telegramId === telegramId;
          const isWin = isFinished && arena?.winnerId === p.telegramId;
          const c = col(i);
          return (
            <div key={p.telegramId} style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "#0d1117",
              border: `1px solid ${isWin ? c + "88" : isMe ? "#21262D" : "#161B22"}`,
              borderRadius: 14, padding: "11px 14px", marginBottom: 8,
              animation: "slideUp 0.25s ease",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                background: c + "30", border: `2px solid ${c}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 800, color: c,
              }}>
                {(p.username ?? p.telegramId).slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: isWin ? c : "#D1D5DB" }}>
                  {p.username ? `@${p.username}` : `#${p.telegramId.slice(-5)}`}
                  {isMe && <span style={{ color: "#60A5FA", fontSize: 11 }}> · ты</span>}
                  {isWin && " 🏆"}
                </div>
                <div style={{ display: "flex", gap: 3, marginTop: 4, height: 3, borderRadius: 2, overflow: "hidden", background: "#1F2937" }}>
                  <div style={{ width: `${p.chance}%`, background: c, borderRadius: 2 }} />
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#F59E0B" }}>{fmtTON(p.stake)} TON</div>
                <div style={{ fontSize: 11, color: "#4B5563" }}>{p.chance.toFixed(1)}%</div>
              </div>
            </div>
          );
        })}
      </div>

      {showFairness && arena?.fair && (
        <FairnessModal
          fair={arena.fair}
          status={arena.status}
          gameType="arena"
          gameId={arena.id}
          onClose={() => setShowFairness(false)}
          onClientSeedChanged={(seed) => setArena(a => a ? { ...a, fair: { ...a.fair!, clientSeed: seed } } : a)}
        />
      )}
    </div>
  );
}
