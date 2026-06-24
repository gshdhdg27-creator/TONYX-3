import { useState, useEffect, useRef, useCallback } from "react";
import { haptic, hapticNotify } from "@/lib/telegram";
import FairnessModal, { type FairData } from "./FairnessModal";

/* ── Types ── */
interface ArenaPlayer {
  telegramId: string;
  username: string | null;
  photoUrl?: string | null;
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
  winnerSector: { startDeg: number; endDeg: number } | null;
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
const SQ = 320; // arena square size px
const BALL_R = 10;
const CX = SQ / 2;
const CY = SQ / 2;

// Colors matching screenshots: teal, salmon/red, yellow, purple...
const ARENA_COLORS = [
  "#4ECDC4", // teal
  "#E8756A", // salmon/red
  "#F5C842", // yellow
  "#9B59B6", // purple
  "#3498DB", // blue
  "#2ECC71", // green
  "#E67E22", // orange
  "#E91E63", // pink
  "#00BCD4", // cyan
  "#8BC34A", // lime
];
const col = (i: number) => ARENA_COLORS[i % ARENA_COLORS.length];

function fmtTimer(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
function fmtTON(v: number) {
  if (v === 0) return "0";
  if (v >= 1000) return v.toFixed(0);
  return v % 1 === 0 ? v.toFixed(0) : parseFloat(v.toFixed(3)).toString();
}
function pName(p: ArenaPlayer) {
  return p.username ? `@${p.username}` : `#${p.telegramId.slice(-5)}`;
}

/* ══════════════════════════════════════════════════════
   TERRITORY CALCULATION
   Key insight from screenshots: NOT pie chart from center.
   Instead: the square is divided by straight cutting lines.
   Each player gets a convex polygon proportional to stake.
   For 2 players: one diagonal line.
   For 3+ players: Voronoi-like cuts from random seed points.
   
   We implement a simpler but visually matching approach:
   Sort players by stake desc, then cut the rectangle into
   strips/polygons using a sweeping line from top-left to bottom-right.
══════════════════════════════════════════════════════ */

interface Territory {
  points: [number, number][];   // polygon vertices
  color: string;
  player: ArenaPlayer;
  idx: number;
  fraction: number;
  centerX: number;
  centerY: number;
}

/**
 * Divide the SQ×SQ square into polygons proportional to fractions[].
 * Uses a diagonal sweep: imagine a line going from top-left corner
 * sweeping clockwise around the perimeter. Each player gets a
 * "pie slice" of the perimeter, creating diagonal-cut territories
 * exactly like in the screenshots.
 */
function buildTerritories(players: ArenaPlayer[], totalPool: number): Territory[] {
  if (players.length === 0) return [];

  // Perimeter of square: top(0→SQ), right(0→SQ), bottom(SQ→0), left(SQ→0)
  // Total perimeter = 4*SQ
  // Map fraction → perimeter length → point on perimeter

  const perimeterPoint = (t: number): [number, number] => {
    // t in [0, 4*SQ)
    const side = SQ;
    if (t < side)       return [t, 0];               // top: left→right
    if (t < 2 * side)   return [side, t - side];      // right: top→bottom
    if (t < 3 * side)   return [side - (t - 2*side), side]; // bottom: right→left
    return [0, side - (t - 3*side)];                  // left: bottom→top
  };

  const totalPerim = 4 * SQ;
  const fractions = players.map(p => totalPool > 0 ? p.stake / totalPool : 1 / players.length);

  // Build cut points on perimeter
  // Start at top-left corner (t=0 corresponds to top-left, sweeping clockwise)
  // But offset start to top edge midpoint for nice look
  const startOffset = 0; // start from top-left corner

  const cuts: number[] = [startOffset]; // cumulative perimeter positions
  let acc = startOffset;
  for (const frac of fractions) {
    acc += frac * totalPerim;
    cuts.push(acc % totalPerim);
  }

  const territories: Territory[] = [];

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const frac = fractions[i];

    const tStart = cuts[i];
    const tEnd = cuts[i + 1] <= cuts[i] ? cuts[i + 1] + totalPerim : cuts[i + 1];

    // Sample perimeter arc from tStart to tEnd
    const arcPoints: [number, number][] = [];
    const steps = Math.max(4, Math.round(frac * 60));
    for (let s = 0; s <= steps; s++) {
      const t = tStart + (tEnd - tStart) * s / steps;
      arcPoints.push(perimeterPoint(t % totalPerim));
    }

    // Polygon: center + arc
    const pts: [number, number][] = [[CX, CY], ...arcPoints];

    // Compute centroid for avatar placement
    let cx = 0, cy = 0;
    for (const [x, y] of pts) { cx += x; cy += y; }
    cx /= pts.length; cy /= pts.length;

    territories.push({
      points: pts,
      color: col(i),
      player: p,
      idx: i,
      fraction: frac,
      centerX: cx,
      centerY: cy,
    });
  }

  return territories;
}

// Avatar size based on fraction
function avatarSize(fraction: number): number {
  return Math.max(32, Math.min(100, Math.round(32 + fraction * 130)));
}

/* ── Toast ── */
function Toast({ msg, type }: { msg: string; type: "success" | "error" | "info" }) {
  const bg = type === "success" ? "#22C55E" : type === "error" ? "#EF4444" : "#3B82F6";
  return (
    <div style={{
      position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
      background: bg, color: "#fff", padding: "12px 24px", borderRadius: 14,
      fontSize: 14, fontWeight: 600, zIndex: 9999, maxWidth: "88vw",
      boxShadow: "0 8px 30px rgba(0,0,0,0.5)", textAlign: "center",
    }}>{msg}</div>
  );
}

/* ── Stake Config Modal (matches screenshot exactly) ── */
function StakeConfigModal({
  values, onSave, onClose,
}: { values: number[]; onSave: (v: number[]) => void; onClose: () => void }) {
  const [local, setLocal] = useState([...values]);
  const [selected, setSelected] = useState(0);
  const [inputVal, setInputVal] = useState(String(values[0]));

  const select = (i: number) => {
    setSelected(i);
    setInputVal(String(local[i]));
  };
  const handleInput = (raw: string) => {
    setInputVal(raw);
    const n = parseFloat(raw);
    if (!isNaN(n) && n > 0) {
      const upd = [...local];
      upd[selected] = Math.round(n * 100) / 100;
      setLocal(upd);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 500,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "#1C1C1E", borderRadius: "24px 24px 0 0",
        padding: "8px 20px 40px", width: "100%", maxWidth: 480,
      }} onClick={e => e.stopPropagation()}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, background: "#3A3A3C", borderRadius: 2, margin: "12px auto 20px" }} />
        <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 20 }}>
          Настроить кнопки
        </div>
        {/* Pill selector */}
        <div style={{
          display: "flex", background: "#2C2C2E", borderRadius: 14,
          padding: 3, marginBottom: 24, gap: 2,
        }}>
          {local.map((v, i) => (
            <button key={i} onClick={() => select(i)} style={{
              flex: 1, padding: "10px 0", borderRadius: 11, border: "none",
              background: selected === i ? "#fff" : "transparent",
              color: selected === i ? "#000" : "#8E8E93",
              fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              transition: "all 0.15s",
            }}>
              <span style={{ color: selected === i ? "#007AFF" : "#555", fontSize: 13 }}>♦</span>{v}
            </button>
          ))}
        </div>
        {/* Big input */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 28 }}>
          <input
            value={inputVal}
            onChange={e => handleInput(e.target.value)}
            type="number" min="0.1" step="0.1"
            style={{
              fontSize: 52, fontWeight: 700, color: "#fff",
              background: "transparent", border: "none", outline: "none",
              width: 150, textAlign: "right", fontFamily: "inherit",
            }}
          />
          <span style={{ fontSize: 24, fontWeight: 600, color: "#636366" }}>GRAM</span>
          <button onClick={() => { setInputVal(""); }} style={{
            width: 32, height: 32, borderRadius: 8, border: "none",
            background: "#3A3A3C", color: "#9CA3AF", fontSize: 16,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={() => { onSave([1, 5, 10]); onClose(); }} style={{
            flex: 1, padding: "16px", borderRadius: 16, border: "none",
            background: "#2C2C2E", color: "#fff", fontSize: 16, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}>Сбросить всё</button>
          <button onClick={() => { onSave(local); onClose(); }} style={{
            flex: 1, padding: "16px", borderRadius: 16, border: "none",
            background: "#007AFF", color: "#fff", fontSize: 16, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
          }}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}

/* ── Winner Popup ── */
function WinnerPopup({ result, onClose }: {
  result: { won: boolean; payout: number; name: string; multiplier: number; photoUrl?: string | null };
  onClose: () => void;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 400,
      background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <style>{`
        @keyframes winPop{0%{opacity:0;transform:scale(0.6) translateY(30px)}70%{transform:scale(1.05) translateY(-4px)}100%{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes confetti{0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(-150px) rotate(720deg);opacity:0}}
      `}</style>
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={i} style={{
          position: "fixed",
          left: `${5 + Math.random() * 90}%`,
          top: `${30 + Math.random() * 40}%`,
          width: i % 3 === 0 ? 10 : 7, height: i % 3 === 0 ? 10 : 7,
          borderRadius: i % 2 === 0 ? "50%" : 2,
          background: ARENA_COLORS[i % ARENA_COLORS.length],
          animation: `confetti ${0.7 + Math.random() * 1.2}s ease-out ${Math.random() * 0.4}s forwards`,
          pointerEvents: "none", zIndex: 401,
        }} />
      ))}
      <div style={{
        background: "linear-gradient(160deg,#1A2A1A,#0D1F0D)",
        borderRadius: 24, padding: "32px 28px 28px",
        textAlign: "center", maxWidth: 340, width: "88%",
        border: "1px solid rgba(34,197,94,0.3)",
        boxShadow: "0 0 60px rgba(34,197,94,0.2)",
        animation: "winPop 0.5s cubic-bezier(0.175,0.885,0.32,1.275) forwards",
        position: "relative",
      }}>
        <button onClick={onClose} style={{
          position: "absolute", top: 14, right: 14,
          background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%",
          width: 28, height: 28, cursor: "pointer", color: "#fff", fontSize: 14,
        }}>✕</button>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 16 }}>
          ✈️ {result.name} выиграл
        </div>
        <div style={{
          width: 96, height: 96, borderRadius: "50%", margin: "0 auto 16px",
          background: "linear-gradient(135deg,#22C55E,#16A34A)",
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
          boxShadow: "0 0 32px rgba(34,197,94,0.5)",
        }}>
          {result.photoUrl
            ? <img src={result.photoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span style={{ fontSize: 48 }}>{result.won ? "🏆" : "😔"}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 26, fontWeight: 900, color: "#fff" }}>♦ {fmtTON(result.payout)}</span>
          <span style={{
            background: "#007AFF", borderRadius: 8, padding: "4px 10px",
            fontSize: 14, fontWeight: 700, color: "#fff",
          }}>{result.multiplier.toFixed(2)}x</span>
        </div>
        <div style={{ fontSize: 13, color: result.won ? "#22C55E" : "#6B7280", fontWeight: 600 }}>
          {result.won ? "Выигрыш зачислен на баланс! 🎉" : "Вам не повезло в этот раз"}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════ MAIN ══════════════════════════ */
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

  // Bottom stake buttons (3 editable)
  const [quickStakes, setQuickStakes] = useState([1, 5, 10]);
  const [showConfig, setShowConfig] = useState(false);
  const [selectedStake, setSelectedStake] = useState<number | null>(null);

  // Increase stake panel
  const [increaseAmt, setIncreaseAmt] = useState(0.5);
  const [increaseInput, setIncreaseInput] = useState("0.5");
  const INCREASE_PRESETS = [0.1, 0.5, 1, 2, 5];

  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [winnerPopup, setWinnerPopup] = useState<{
    won: boolean; payout: number; name: string; multiplier: number; photoUrl?: string | null;
  } | null>(null);
  const [showFairness, setShowFairness] = useState(false);
  const [onlineCount, setOnlineCount] = useState(20);

  // Ball animation refs
  const ballRef = useRef<SVGCircleElement | null>(null);
  const ballGlowRef = useRef<SVGCircleElement | null>(null);
  const ballRingRef = useRef<SVGCircleElement | null>(null);
  const ballStateRef = useRef<"IDLE" | "RUNNING">("IDLE");
  const ballPosRef = useRef({ x: CX, y: CY });
  const ballVelRef = useRef({ vx: 0, vy: 0 });
  const ballTargetRef = useRef<{ x: number; y: number } | null>(null);
  const ballStoppedRef = useRef(false);
  const runStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const onBallStopRef = useRef<(() => void) | null>(null);
  const cancelTimersRef = useRef<(() => void) | null>(null);

  const prevStatusRef = useRef<string | null>(null);
  const prevArenaIdRef = useRef<number | null>(null);
  const prevCountdownRef = useRef<number | null>(null);
  const territoriesRef = useRef<Territory[]>([]);

  const flash = (msg: string, type: "success" | "error" | "info" = "info") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
  };

  /* ── Online count flicker ── */
  useEffect(() => {
    const t = setInterval(() => setOnlineCount(n => Math.max(10, n + Math.floor(Math.random() * 5) - 2)), 7000);
    return () => clearInterval(t);
  }, []);

  /* ── Ball animation RAF ── */
  useEffect(() => {
    let active = true;
    const EDGE = 1;
    const FREE_MS = 3800;

    const place = (nx: number, ny: number) => {
      ballPosRef.current = { x: nx, y: ny };
      const xs = nx.toFixed(1), ys = ny.toFixed(1);
      ballRef.current?.setAttribute("cx", xs);
      ballRef.current?.setAttribute("cy", ys);
      ballGlowRef.current?.setAttribute("cx", xs);
      ballGlowRef.current?.setAttribute("cy", ys);
      ballRingRef.current?.setAttribute("cx", xs);
      ballRingRef.current?.setAttribute("cy", ys);
    };

    const bounce = (nx: number, ny: number, vx: number, vy: number) => {
      const j = () => (Math.random() - 0.5) * 0.5; // tiny jitter for natural feel
      if (nx - BALL_R <= EDGE)        { nx = BALL_R + EDGE;       vx =  Math.abs(vx) + j(); }
      if (nx + BALL_R >= SQ - EDGE)   { nx = SQ - BALL_R - EDGE;  vx = -(Math.abs(vx) + j()); }
      if (ny - BALL_R <= EDGE)        { ny = BALL_R + EDGE;       vy =  Math.abs(vy) + j(); }
      if (ny + BALL_R >= SQ - EDGE)   { ny = SQ - BALL_R - EDGE;  vy = -(Math.abs(vy) + j()); }
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
        if (ballTargetRef.current) {
          const { x: tx, y: ty } = ballTargetRef.current;
          const dx = tx - ballPosRef.current.x, dy = ty - ballPosRef.current.y;
          if (Math.sqrt(dx * dx + dy * dy) > 3) {
            ballStoppedRef.current = false;
            ballVelRef.current = { vx: dx * 0.12, vy: dy * 0.12 };
          } else {
            const cb = onBallStopRef.current;
            if (cb) { onBallStopRef.current = null; cb(); }
          }
        }
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      const elapsed = runStartRef.current ? performance.now() - runStartRef.current : 0;
      let { vx, vy } = ballVelRef.current;
      const pos = ballPosRef.current;

      if (elapsed >= FREE_MS && ballTargetRef.current) {
        const { x: tx, y: ty } = ballTargetRef.current;
        const dx = tx - pos.x, dy = ty - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 1.5) {
          ballStoppedRef.current = true;
          ballVelRef.current = { vx: 0, vy: 0 };
          place(tx, ty);
          const cb = onBallStopRef.current;
          onBallStopRef.current = null;
          cb?.();
          rafRef.current = requestAnimationFrame(step);
          return;
        }
        const age = elapsed - FREE_MS;
        const ramp = Math.min(1, age / 700);
        const pull = Math.max(0.012, Math.min(0.14, dist / 260) * ramp);
        vx = dx * pull; vy = dy * pull;
        ballVelRef.current = { vx, vy };
        place(pos.x + vx, pos.y + vy);
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      vx *= 0.994; vy *= 0.994;
      const b = bounce(pos.x + vx, pos.y + vy, vx, vy);
      ballVelRef.current = { vx: b.vx, vy: b.vy };
      place(b.nx, b.ny);
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => { active = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  /* ── Fetch & update ── */
  const handleUpdate = useCallback((fresh: ArenaState) => {
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
        const mult = payout / wp.stake;

        // Find target point inside winner territory
        const winTerr = territoriesRef.current.find(t => t.player.telegramId === fresh.winnerId);
        if (winTerr) {
          // Pick random point inside territory polygon (use centroid ± random offset)
          const tx = winTerr.centerX + (Math.random() - 0.5) * 40;
          const ty = winTerr.centerY + (Math.random() - 0.5) * 40;
          ballTargetRef.current = {
            x: Math.max(BALL_R + 4, Math.min(SQ - BALL_R - 4, tx)),
            y: Math.max(BALL_R + 4, Math.min(SQ - BALL_R - 4, ty)),
          };
        }

        // Launch ball if not already running
        if (ballStateRef.current === "IDLE") {
          const angle = Math.random() * Math.PI * 2;
          const speed = 4 + Math.random() * 2;
          ballStateRef.current = "RUNNING";
          ballStoppedRef.current = false;
          ballPosRef.current = { x: CX, y: CY };
          ballVelRef.current = { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
          runStartRef.current = performance.now();
        }

        cancelTimersRef.current?.();
        onBallStopRef.current = () => {
          hapticNotify(fresh.winnerId === telegramId ? "success" : "error");
          let t1: ReturnType<typeof setTimeout>, t2: ReturnType<typeof setTimeout>;
          cancelTimersRef.current = () => { clearTimeout(t1); clearTimeout(t2); };
          t1 = setTimeout(() => {
            setWinnerPopup({ won: fresh.winnerId === telegramId, payout, name: pName(wp), multiplier: mult, photoUrl: wp.photoUrl });
            onBalanceChange();
            t2 = setTimeout(() => setWinnerPopup(null), 6000);
          }, 600);
        };
      }
    }

    prevStatusRef.current = fresh.status;
    if (fresh.status !== "finished") prevArenaIdRef.current = fresh.id;
    setArena(fresh);

    // ── TIMER FIX: Always recalculate countdown from startAt ──
    if (fresh.status === "starting" && fresh.startAt) {
      const secs = Math.max(0, Math.ceil((new Date(fresh.startAt).getTime() - Date.now()) / 1000));
      setCountdown(secs);
    } else if (fresh.status === "waiting") {
      setCountdown(null);
      // Reset ball for new round
      if (ballStoppedRef.current || ballStateRef.current === "IDLE") {
        cancelTimersRef.current?.();
        cancelTimersRef.current = null;
        onBallStopRef.current = null;
        ballStateRef.current = "IDLE";
        ballPosRef.current = { x: CX, y: CY };
        ballVelRef.current = { vx: 0, vy: 0 };
        ballTargetRef.current = null;
        ballStoppedRef.current = false;
        runStartRef.current = null;
      }
    } else if (fresh.status === "finished") {
      setCountdown(null);
    }
  }, [telegramId, onBalanceChange]);

  const fetchArena = useCallback(async () => {
    try {
      const r = await fetch("/api/mini/games/arena/state");
      if (r.ok) handleUpdate(await r.json());
    } catch { }
  }, [handleUpdate]);

  const fetchStats = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        fetch("/api/mini/games/arena/biggest-winner"),
        fetch("/api/mini/games/arena/last-winner"),
      ]);
      if (a.ok) { const d = await a.json(); if (d.winner) setTopGame(d.winner); }
      if (b.ok) { const d = await b.json(); if (d.winner) setLastGame(d.winner); }
    } catch { }
  }, []);

  useEffect(() => {
    fetchArena(); fetchStats();
    const id = setInterval(fetchArena, 2500);
    return () => clearInterval(id);
  }, [fetchArena, fetchStats]);

  /* ── Countdown tick — runs every second independently ── */
  useEffect(() => {
    if (countdown === null || countdown <= 0) {
      if (countdown === 0) {
        // Hit zero — poll server aggressively
        const t1 = setTimeout(fetchArena, 400);
        const t2 = setTimeout(fetchArena, 900);
        const t3 = setTimeout(fetchArena, 1600);
        const t4 = setTimeout(fetchArena, 2500);
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
      }
      return;
    }
    const t = setTimeout(() => setCountdown(c => c !== null && c > 0 ? c - 1 : 0), 1000);
    return () => clearTimeout(t);
  }, [countdown, fetchArena]);

  /* ── Launch ball when countdown hits 0 ── */
  useEffect(() => {
    if (prevCountdownRef.current !== null && prevCountdownRef.current > 0 && countdown === 0) {
      if (ballStateRef.current === "IDLE") {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 2;
        ballStateRef.current = "RUNNING";
        ballStoppedRef.current = false;
        ballPosRef.current = { x: CX, y: CY };
        ballVelRef.current = { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
        runStartRef.current = performance.now();
      }
    }
    prevCountdownRef.current = countdown;
  }, [countdown]);

  /* ── Join ── */
  const join = async (stake: number) => {
    if (stake < 0.1) { flash("Минимум 0.1", "error"); return; }
    if (stake > tonBalance) { flash("Недостаточно TON", "error"); return; }
    setBusy(true); haptic("heavy");
    try {
      const r = await fetch("/api/mini/games/arena/join", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, stake }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? "Ошибка", "error"); return; }
      handleUpdate(d); onBalanceChange();
      hapticNotify("success"); flash("✅ Вы в арене!", "success");
    } catch { flash("Ошибка сети", "error"); }
    finally { setBusy(false); }
  };

  const increaseStake = async () => {
    if (increaseAmt <= 0 || increaseAmt > tonBalance) { flash("Недостаточно TON", "error"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/mini/games/arena/increase", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, additionalStake: increaseAmt }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error ?? "Ошибка", "error"); return; }
      handleUpdate(d); onBalanceChange();
      flash(`+${increaseAmt} TON добавлено`, "success");
    } catch { flash("Ошибка сети", "error"); }
    finally { setBusy(false); }
  };

  /* ── Derived ── */
  const players = arena?.players ?? [];
  const totalPool = arena?.totalPool ?? 0;
  const isIn = players.some(p => p.telegramId === telegramId);
  const myP = players.find(p => p.telegramId === telegramId);
  const isStarting = arena?.status === "starting";
  const isFinished = arena?.status === "finished";

  // Build territories
  const territories = buildTerritories(players, totalPool);
  territoriesRef.current = territories;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#0B0F14",
      display: "flex", flexDirection: "column",
      fontFamily: "'Inter', system-ui, sans-serif", zIndex: 100,
      overflowY: "auto",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes timerPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes winGlow{0%,100%{opacity:0.15}50%{opacity:0.4}}
      `}</style>

      {toast && <Toast msg={toast.msg} type={toast.type} />}
      {winnerPopup && <WinnerPopup result={winnerPopup} onClose={() => setWinnerPopup(null)} />}
      {showConfig && <StakeConfigModal values={quickStakes} onSave={v => setQuickStakes(v)} onClose={() => setShowConfig(false)} />}
      {showFairness && arena?.fair && (
        <FairnessModal fair={arena.fair} status={arena.status} gameType="arena" gameId={arena.id}
          onClose={() => setShowFairness(false)}
          onClientSeedChanged={seed => setArena(a => a ? { ...a, fair: { ...a.fair!, clientSeed: seed } } : a)} />
      )}

      {/* ══ HEADER ══ */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px 8px", background: "#0d1117", borderBottom: "1px solid #161B22",
        flexShrink: 0,
      }}>
        <button onClick={() => { haptic("light"); onClose(); }} style={{
          background: "none", border: "none", color: "#9CA3AF", fontSize: 24,
          cursor: "pointer", padding: "0 4px", lineHeight: 1,
        }}>←</button>

        {/* Center: title + timer */}
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
            <span style={{ fontSize: 16 }}>⚔️</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>ПВП Арена</span>
          </div>
          {isStarting && countdown !== null && countdown > 0 && (
            <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 1 }}>
              Начало через{" "}
              <span style={{
                fontWeight: 800, color: countdown <= 5 ? "#F87171" : "#fff",
                animation: countdown <= 5 ? "timerPulse 0.8s ease-in-out infinite" : "none",
                fontVariantNumeric: "tabular-nums",
              }}>{fmtTimer(countdown)}</span>
            </div>
          )}
          {isStarting && (countdown === 0 || countdown === null) && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "center", marginTop: 2 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E", animation: "pulse 1s ease-in-out infinite" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#22C55E" }}>В эфире</span>
            </div>
          )}
          {!isStarting && !isFinished && (
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1 }}>Ожидание игроков</div>
          )}
        </div>

        {/* Right: balance */}
        <div style={{
          background: "#161B22", border: "1px solid #21262D",
          borderRadius: 20, padding: "5px 12px",
          display: "flex", alignItems: "center", gap: 5,
        }}>
          <span style={{ color: "#007AFF", fontSize: 13 }}>▽</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{fmtTON(tonBalance)}</span>
        </div>
      </div>

      {/* ══ ONLINE + STATS ROW ══ */}
      <div style={{ padding: "8px 14px", background: "#0d1117", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#4B5563" }}>{onlineCount} онлайн</span>
          <div style={{
            background: "#161B22", border: "1px solid #21262D",
            borderRadius: 20, padding: "4px 12px",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <span style={{ color: "#6B7280", fontSize: 12 }}>▽</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#9CA3AF" }}>
              {fmtTON(tonBalance)} TON
            </span>
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { label: "ТОП ИГРА", g: topGame },
            { label: "ПОСЛЕДНЯЯ", g: lastGame },
          ].map(({ label, g }) => (
            <div key={label} onClick={onOpenHistory} style={{
              flex: 1, background: "#111827", border: "1px solid #1F2937",
              borderRadius: 12, padding: "9px 12px", cursor: "pointer",
            }}>
              <div style={{ fontSize: 9, color: "#4B5563", fontWeight: 700, letterSpacing: "0.07em", marginBottom: 5 }}>
                {label}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: "linear-gradient(135deg,#6366F1,#8B5CF6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 8, fontWeight: 800, color: "#fff", flexShrink: 0,
                }}>{g ? (g.username ?? "?").slice(0, 2).toUpperCase() : "—"}</div>
                <span style={{ flex: 1, fontSize: 11, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {g ? (g.username ? `@..` : "—") : "—"}
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#F59E0B", whiteSpace: "nowrap" }}>
                  {g ? `+${fmtTON(g.payout)} ▽` : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ ARENA BLOCK ══ */}
      <div style={{
        margin: "10px 14px", background: "#0d1117", border: "1px solid #161B22",
        borderRadius: 18, overflow: "hidden", flexShrink: 0,
      }}>
        {/* Arena header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", borderBottom: "1px solid #161B22",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#F59E0B", fontSize: 14 }}>▽</span>
            <span style={{ fontSize: 17, fontWeight: 900, color: "#F59E0B" }}>{fmtTON(totalPool)} TON</span>
            <span style={{ fontSize: 11, color: "#4B5563" }}>в банке</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {isStarting && (countdown === 0 || countdown === null) ? (
              <>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E", animation: "pulse 1s ease-in-out infinite" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#22C55E" }}>В эфире</span>
              </>
            ) : isStarting ? (
              <>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E", animation: "pulse 1.5s ease-in-out infinite" }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "#22C55E" }}>В эфире</span>
              </>
            ) : isFinished ? (
              <span style={{ fontSize: 12, color: "#4B5563" }}>Завершено</span>
            ) : (
              <>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#F59E0B", animation: "pulse 2s ease-in-out infinite" }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "#F59E0B" }}>Ожидание</span>
              </>
            )}
          </div>
        </div>

        {/* ── ARENA CANVAS ── */}
        <div style={{ position: "relative", width: "100%", paddingTop: "100%", background: "#111" }}>
          <div style={{ position: "absolute", inset: 0 }}>
            <svg width="100%" height="100%" viewBox={`0 0 ${SQ} ${SQ}`}
              style={{ display: "block" }}>

              {/* Base */}
              <rect x={0} y={0} width={SQ} height={SQ} fill="#111" />

              {/* Grid (empty state) */}
              {players.length === 0 && (() => {
                const els = [];
                for (let x = 0; x <= SQ; x += 32) els.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={SQ} stroke="#1A1A1A" strokeWidth={1} />);
                for (let y = 0; y <= SQ; y += 32) els.push(<line key={`h${y}`} x1={0} y1={y} x2={SQ} y2={y} stroke="#1A1A1A" strokeWidth={1} />);
                return els;
              })()}

              {/* 1 player: full fill */}
              {players.length === 1 && (
                <rect x={0} y={0} width={SQ} height={SQ} fill={col(0)} />
              )}

              {/* Multiple players: polygon territories */}
              {players.length > 1 && territories.map(t => (
                <polygon
                  key={t.player.telegramId}
                  points={t.points.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill={t.color}
                />
              ))}

              {/* Divider lines (black, ~2px) */}
              {territories.length >= 2 && territories.map((t, i) => {
                // Draw the first edge of each territory polygon (center → first perimeter pt)
                const first = t.points[1];
                return first ? (
                  <line key={`div${i}`}
                    x1={CX} y1={CY} x2={first[0]} y2={first[1]}
                    stroke="#000" strokeWidth={2.5} />
                ) : null;
              })}

              {/* Winner sector bright overlay */}
              {isFinished && territories.map(t => {
                if (arena?.winnerId !== t.player.telegramId) return null;
                return (
                  <polygon key={`win${t.player.telegramId}`}
                    points={t.points.map(([x, y]) => `${x},${y}`).join(" ")}
                    fill="white" opacity={0.2}
                    style={{ animation: "winGlow 0.6s ease-in-out infinite" }} />
                );
              })}

              {/* Ball glow */}
              {players.length >= 1 && (
                <>
                  <circle ref={ballGlowRef} cx={CX} cy={CY} r={BALL_R + 9} fill="rgba(255,255,255,0.12)" />
                  {/* Main white ball */}
                  <circle ref={ballRef} cx={CX} cy={CY} r={BALL_R}
                    fill="white"
                    style={{ filter: "drop-shadow(0 0 6px rgba(255,255,255,0.9))" }}
                  />
                  {/* Yellow ring around ball (like screenshot) */}
                  <circle ref={ballRingRef} cx={CX} cy={CY} r={BALL_R + 3}
                    fill="none" stroke="#F5C842" strokeWidth={2} opacity={0.85}
                  />
                </>
              )}

              {/* Empty state text */}
              {players.length === 0 && (
                <text x={CX} y={CY} textAnchor="middle" dominantBaseline="middle"
                  fill="#374151" fontSize={15} fontWeight={600} fontFamily="Inter, sans-serif">
                  Waiting for players...
                </text>
              )}
            </svg>

            {/* Avatar overlays */}
            {territories.map(t => {
              const isWinner = isFinished && arena?.winnerId === t.player.telegramId;
              const isMe = t.player.telegramId === telegramId;
              const AV = avatarSize(t.fraction);
              return (
                <div key={t.player.telegramId} style={{
                  position: "absolute",
                  left: `${(t.centerX / SQ) * 100}%`,
                  top: `${(t.centerY / SQ) * 100}%`,
                  transform: "translate(-50%,-50%)",
                  width: AV, height: AV, borderRadius: "50%",
                  overflow: "hidden",
                  border: `${isWinner ? 3 : 2}px solid ${isWinner ? "#fff" : "rgba(0,0,0,0.4)"}`,
                  background: t.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: isWinner
                    ? `0 0 0 3px ${t.color}, 0 0 24px ${t.color}cc`
                    : isMe ? `0 0 0 2px #007AFF` : "none",
                  transition: "all 0.5s cubic-bezier(0.175,0.885,0.32,1.275)",
                  zIndex: isWinner ? 20 : 10,
                  pointerEvents: "none",
                }}>
                  {t.player.photoUrl
                    ? <img src={t.player.photoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span style={{ fontSize: AV * 0.36, fontWeight: 900, color: "rgba(0,0,0,0.6)" }}>
                        {(t.player.username ?? t.player.telegramId).slice(0, 2).toUpperCase()}
                      </span>
                  }
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══ MY STAKE CARD (if in game) ══ */}
      {isIn && myP && (
        <div style={{ margin: "0 14px 10px", animation: "slideUp 0.3s ease" }}>
          <div style={{
            background: "#111827", border: "1px solid #1D4ED855",
            borderRadius: 16, padding: "14px 18px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 12, color: "#3B82F6", fontWeight: 600, marginBottom: 4 }}>Ваша ставка</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#fff" }}>
                  {fmtTON(myP.stake)} <span style={{ fontSize: 14, color: "#6B7280", fontWeight: 600 }}>TON</span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>Шанс</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#4ADE80" }}>{myP.chance.toFixed(1)}%</div>
              </div>
            </div>
          </div>
          {/* If-win preview */}
          {totalPool > myP.stake && (
            <div style={{
              background: "#0d1117", border: "1px solid #1F2937",
              borderRadius: 12, padding: "10px 16px", marginTop: 8,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 12, color: "#4B5563" }}>💡 Если победишь</span>
              <span style={{ fontSize: 17, fontWeight: 900, color: "#4ADE80" }}>
                +{fmtTON((myP.stake + (totalPool - myP.stake) * 0.80))} TON
              </span>
            </div>
          )}
        </div>
      )}

      {/* Increase stake */}
      {isIn && myP && (arena?.status === "waiting" || arena?.status === "starting") && (
        <div style={{ margin: "0 14px 10px", animation: "slideUp 0.3s ease" }}>
          <div style={{
            background: "#0d1117", border: "1px solid #1F2937",
            borderRadius: 14, padding: "12px 14px",
          }}>
            <div style={{ fontSize: 12, color: "#F59E0B", fontWeight: 700, marginBottom: 10 }}>
              💰 Добавить к ставке
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {INCREASE_PRESETS.map(v => (
                <button key={v} onClick={() => { setIncreaseAmt(v); setIncreaseInput(String(v)); }} style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                  background: increaseAmt === v ? "#1D4ED8" : "#161B22",
                  color: increaseAmt === v ? "#fff" : "#6B7280",
                  fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>+{v}</button>
              ))}
            </div>
            <div style={{ position: "relative", marginBottom: 10 }}>
              <input
                value={increaseInput}
                onChange={e => { setIncreaseInput(e.target.value); const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) setIncreaseAmt(v); }}
                type="number" step="0.1" min="0.1"
                style={{
                  width: "100%", background: "#161B22", border: "1px solid #21262D",
                  borderRadius: 8, padding: "10px 44px 10px 12px", color: "#fff",
                  fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                }}
              />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#4B5563", fontWeight: 700 }}>TON</span>
            </div>
            <button onClick={increaseStake} disabled={busy || increaseAmt > tonBalance} style={{
              width: "100%", padding: "12px", borderRadius: 10, border: "none",
              background: busy || increaseAmt > tonBalance ? "#1F2937" : "linear-gradient(135deg,#1D4ED8,#3B82F6)",
              color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>
              {busy ? "..." : `✈️ Добавить ${increaseAmt} TON`}
            </button>
          </div>
        </div>
      )}

      {/* ══ PARTICIPANTS TABLE ══ */}
      {players.length > 0 && (
        <div style={{ margin: "0 14px 10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#E5E7EB" }}>
              Участники · {players.length}
            </span>
            {arena && (
              <span style={{ fontSize: 11, color: "#374151", fontWeight: 600 }}>
                #{arena.id.toString().padStart(6, "0")}
              </span>
            )}
          </div>

          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, padding: "4px 14px 8px", borderBottom: "1px solid #161B22" }}>
            <span style={{ fontSize: 10, color: "#4B5563", fontWeight: 700, letterSpacing: "0.07em" }}>ИГРОК</span>
            <span style={{ fontSize: 10, color: "#4B5563", fontWeight: 700, letterSpacing: "0.07em", textAlign: "right" }}>СТАВКА</span>
            <span style={{ fontSize: 10, color: "#4B5563", fontWeight: 700, letterSpacing: "0.07em", textAlign: "right", minWidth: 52 }}>ШАНС</span>
          </div>

          {players.map((p, i) => {
            const isMe = p.telegramId === telegramId;
            const isWin = isFinished && arena?.winnerId === p.telegramId;
            const c = col(i);
            return (
              <div key={p.telegramId} style={{
                display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center",
                padding: "10px 14px",
                background: isWin ? (c + "18") : isMe ? "#111827" : "transparent",
                borderBottom: "1px solid #0d1117",
                borderRadius: isWin || isMe ? 12 : 0,
                marginBottom: 2,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  {/* Avatar */}
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                    background: c, border: `2px solid ${c}88`, overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {p.photoUrl
                      ? <img src={p.photoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: 13, fontWeight: 800, color: "rgba(0,0,0,0.6)" }}>
                          {(p.username ?? p.telegramId).slice(0, 2).toUpperCase()}
                        </span>
                    }
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: isWin ? c : isMe ? "#60A5FA" : "#D1D5DB", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.username ? `@${p.username}` : `#${p.telegramId.slice(-5)}`}
                      {isMe && <span style={{ fontSize: 10, color: "#4B5563", fontWeight: 500 }}> · ты</span>}
                      {isWin && " 🏆"}
                    </div>
                    {/* Chance bar */}
                    <div style={{ height: 3, background: "#1F2937", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                      <div style={{ width: `${p.chance}%`, height: "100%", background: c, borderRadius: 2 }} />
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#F59E0B", textAlign: "right", whiteSpace: "nowrap" }}>
                  {fmtTON(p.stake)} ▽
                </div>
                <div style={{ textAlign: "right", minWidth: 52 }}>
                  <span style={{
                    display: "inline-block", padding: "3px 8px", borderRadius: 8,
                    background: c + "25", border: `1px solid ${c}44`,
                    fontSize: 12, fontWeight: 700, color: c,
                  }}>{p.chance.toFixed(1)}%</span>
                </div>
              </div>
            );
          })}

          {/* Hash */}
          {arena?.fair?.serverSeedHash && (
            <div style={{ textAlign: "center", fontSize: 10, color: "#1F2937", marginTop: 8 }}>
              Хеш: {arena.fair.serverSeedHash.slice(0, 8)}...{arena.fair.serverSeedHash.slice(-4)} 📋
            </div>
          )}
        </div>
      )}

      {/* spacer */}
      <div style={{ flex: 1 }} />

      {/* ══ BOTTOM STAKE PANEL (fixed look, like video) ══ */}
      <div style={{
        background: "#0d1117", borderTop: "1px solid #161B22",
        padding: "10px 14px 20px", flexShrink: 0,
      }}>
        {!isIn && !isFinished && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Pencil/edit */}
            <button onClick={() => setShowConfig(true)} style={{
              width: 44, height: 44, borderRadius: 12, border: "1px solid #21262D",
              background: "#161B22", color: "#9CA3AF", fontSize: 19,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>✏️</button>

            {/* 3 quick stake buttons */}
            {quickStakes.map((v, i) => (
              <button key={i}
                onClick={() => { haptic("medium"); setSelectedStake(v); join(v); }}
                disabled={busy || v > tonBalance}
                style={{
                  flex: 1, height: 44, borderRadius: 12, border: "none",
                  background: selectedStake === v ? "#007AFF" : "#161B22",
                  color: v > tonBalance ? "#374151" : "#fff",
                  fontSize: 14, fontWeight: 700, cursor: busy || v > tonBalance ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  boxShadow: selectedStake === v ? "0 0 14px rgba(0,122,255,0.4)" : "none",
                }}>
                <span style={{ color: selectedStake === v ? "#fff" : "#007AFF", fontSize: 12 }}>♦</span>
                {v}
              </button>
            ))}

            {/* Va-bank */}
            <button onClick={() => { haptic("heavy"); setSelectedStake(tonBalance); join(tonBalance); }}
              disabled={busy || tonBalance < 0.1}
              style={{
                flex: 1, height: 44, borderRadius: 12, border: "none",
                background: "#1a0a3a",
                color: "#A78BFA", fontSize: 12, fontWeight: 800,
                cursor: "pointer", fontFamily: "inherit",
              }}>Ва-банк</button>

            {/* Refresh */}
            <button onClick={() => { fetchArena(); haptic("light"); }} style={{
              width: 44, height: 44, borderRadius: 12, border: "1px solid #21262D",
              background: "#161B22", color: "#6B7280", fontSize: 18,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>↻</button>
          </div>
        )}

        {/* Room badge */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <div style={{
            background: "#007AFF", borderRadius: 20, padding: "5px 14px",
            fontSize: 13, fontWeight: 700, color: "#fff",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            Комната 1
            <span style={{
              background: "rgba(255,255,255,0.25)", borderRadius: "50%",
              width: 20, height: 20, display: "inline-flex", alignItems: "center",
              justifyContent: "center", fontSize: 12, fontWeight: 900,
            }}>{players.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
