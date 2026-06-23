import { useState, useEffect, useRef } from "react";
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
const ARENA_COLORS = [
  "#FF6B6B", "#4ECDC4", "#FFE66D", "#A8E6CF",
  "#B388FF", "#FF80AB", "#82B1FF", "#CCFF90",
  "#FF9E80", "#80D8FF",
];
const col = (i: number) => ARENA_COLORS[i % ARENA_COLORS.length];

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
const SQ = 300;
const CX = SQ / 2;
const CY = SQ / 2;
const HW = SQ / 2;
const HH = SQ / 2;
const BALL_R = 10;

function squarePoint(deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const t = ax < 1e-9 ? HH / ay : ay < 1e-9 ? HW / ax : Math.min(HW / ax, HH / ay);
  return [CX + t * dx, CY + t * dy];
}

function squareSectorPoints(startDeg: number, endDeg: number, steps = 64): string {
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

function sectorRandomPoint(startDeg: number, endDeg: number): [number, number] {
  const span = endDeg - startDeg;
  const margin = Math.min(span * 0.12, 8);
  const randDeg = startDeg + margin + Math.random() * (span - margin * 2);
  const [px, py] = squarePoint(randDeg);
  const frac = 0.30 + Math.random() * 0.35;
  return [CX + (px - CX) * frac, CY + (py - CY) * frac];
}

// Compute avatar size based on sector size (stake fraction)
function sectorAvatarSize(fraction: number): number {
  const MIN_SIZE = 22;
  const MAX_SIZE = 54;
  return Math.round(MIN_SIZE + (MAX_SIZE - MIN_SIZE) * Math.min(1, fraction * 3));
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
  fraction: number;
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

/* ── Avatar component ── */
function PlayerAvatar({
  player, color, size, isWinner, isMe,
}: {
  player: ArenaPlayer;
  color: string;
  size: number;
  isWinner: boolean;
  isMe: boolean;
}) {
  const initials = (player.username ?? player.telegramId).slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      border: `${isWinner ? 3 : 2}px solid ${isWinner ? "#fff" : color}`,
      background: player.photoUrl ? "transparent" : (color + "40"),
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
      boxShadow: isWinner
        ? `0 0 0 3px ${color}, 0 0 20px ${color}cc`
        : isMe ? `0 0 12px ${color}99` : "none",
      transition: "all 0.4s ease",
      flexShrink: 0,
    }}>
      {player.photoUrl ? (
        <img src={player.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{ fontSize: size * 0.35, fontWeight: 800, color }}>{initials}</span>
      )}
    </div>
  );
}

/* ── Stat Card ── */
function StatCard({
  label, username, amount, badge, onClick,
}: { label: string; username: string | null; amount: number; badge?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{
      flex: 1, background: "#0F1923", border: "1px solid #1A2535",
      borderRadius: 14, padding: "10px 14px", minWidth: 0,
      cursor: onClick ? "pointer" : "default",
    }}>
      <div style={{ fontSize: 9, color: "#4B5563", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {badge && (
          <div style={{
            width: 24, height: 24, borderRadius: "50%",
            background: "linear-gradient(135deg,#6366F1,#8B5CF6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, fontWeight: 800, color: "#fff", flexShrink: 0,
          }}>{badge}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {username ? `@${username}` : "—"}
          </div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#F59E0B", whiteSpace: "nowrap", flexShrink: 0 }}>
          {amount > 0 ? `+${fmtTON(amount)} ▽` : "—"}
        </div>
      </div>
    </div>
  );
}

/* ── EditableStakeButton ── */
function EditableStakeButton({
  value, onChange, selected, onSelect,
}: { value: number; onChange: (v: number) => void; selected: boolean; onSelect: () => void }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setInput(String(value)); }, [value]);

  const commit = () => {
    const v = parseFloat(input);
    if (!isNaN(v) && v > 0) onChange(Math.round(v * 1000) / 1000);
    else setInput(String(value));
    setEditing(false);
  };

  return (
    <div style={{ flex: 1, position: "relative" }}>
      {editing ? (
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setInput(String(value)); setEditing(false); } }}
          autoFocus
          type="number"
          style={{
            width: "100%", padding: "10px 6px", borderRadius: 10, border: `1.5px solid #F59E0B`,
            background: "#1A2535", color: "#fff", fontSize: 13, fontWeight: 700,
            textAlign: "center", outline: "none", boxSizing: "border-box", fontFamily: "inherit",
          }}
        />
      ) : (
        <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: `1.5px solid ${selected ? "#F59E0B" : "#1A2535"}` }}>
          <button
            onClick={onSelect}
            style={{
              flex: 1, padding: "10px 4px", border: "none",
              background: selected ? "linear-gradient(135deg,#D97706,#F59E0B)" : "#0F1923",
              color: selected ? "#fff" : "#6B7280",
              fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              boxShadow: selected ? "0 0 14px rgba(245,158,11,0.4)" : "none",
            }}
          >▽ {value}</button>
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); onSelect(); }}
            style={{
              width: 28, padding: "0 4px", border: "none", borderLeft: "1px solid #1A2535",
              background: selected ? "#c77f00" : "#0d141f",
              color: selected ? "#fff" : "#374151", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
            }}
          >✏️</button>
        </div>
      )}
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

  // Editable quick stake buttons (3 editable + 1 all-in)
  const [quickStakes, setQuickStakes] = useState([1, 3, 5]);
  const [selectedQuick, setSelectedQuick] = useState<number | "allin" | null>(null);
  const [joinStake, setJoinStake] = useState(1);
  const [joinInput, setJoinInput] = useState("1");

  const [increaseAmt, setIncreaseAmt] = useState(0.5);
  const [increaseInput, setIncreaseInput] = useState("0.5");
  const [showIncreasePanel, setShowIncreasePanel] = useState(true);

  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [animPhase, setAnimPhase] = useState<"idle" | "revealed" | "payout">("idle");
  const [pendingResult, setPendingResult] = useState<{ won: boolean; payout: number; name: string } | null>(null);
  const [onlineCount] = useState(15 + Math.floor(Math.random() * 12));
  const [showFairness, setShowFairness] = useState(false);

  const prevStatusRef = useRef<string | null>(null);
  const prevArenaIdRef = useRef<number | null>(null);

  const ballStateRef = useRef<"IDLE" | "RUNNING">("IDLE");
  const ballCircleRef = useRef<SVGCircleElement | null>(null);
  const ballGlowRef = useRef<SVGCircleElement | null>(null);
  const arrowRef = useRef<SVGGElement | null>(null);
  const ballPosRef = useRef({ x: CX, y: CY });
  const ballVelRef = useRef({ vx: 0, vy: 0 });
  const ballTargetRef = useRef<{ x: number; y: number } | null>(null);
  const ballStoppedRef = useRef(false);
  const runStartTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const prevCountdownRef = useRef<number | null>(null);
  const sectorsRef = useRef<Sector[]>([]);
  const onBallStopRef = useRef<(() => void) | null>(null);
  const cancelTimersRef = useRef<(() => void) | null>(null);

  const flash = (msg: string, type: "success" | "error" | "info" = "info") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3200);
  };

  /* ── Stake helpers ── */
  const setJoin = (v: number) => {
    const rounded = Math.round(v * 1000) / 1000;
    setJoinStake(rounded);
    setJoinInput(String(rounded));
  };

  const handleQuickSelect = (v: number, idx: number | "allin") => {
    setSelectedQuick(idx);
    setJoin(v);
  };

  /* ── Online count flicker ── */
  const [onlineDisp, setOnlineDisp] = useState(onlineCount);
  useEffect(() => {
    const t = setInterval(() => {
      setOnlineDisp(prev => Math.max(8, prev + Math.floor(Math.random() * 5) - 2));
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

        if (fresh.winnerSector && !ballTargetRef.current) {
          const { startDeg, endDeg } = fresh.winnerSector;
          const [tx, ty] = sectorRandomPoint(startDeg, endDeg);
          ballTargetRef.current = { x: tx, y: ty };
          if (ballStoppedRef.current && ballStateRef.current === "RUNNING") {
            ballStoppedRef.current = false;
            const pos = ballPosRef.current;
            ballVelRef.current = { vx: (tx - pos.x) * 0.12, vy: (ty - pos.y) * 0.12 };
          }
          if (ballStateRef.current === "IDLE") {
            const angle = Math.random() * Math.PI * 2;
            const speed = 4 + Math.random() * 2;
            ballStateRef.current = "RUNNING";
            ballStoppedRef.current = false;
            ballPosRef.current = { x: CX, y: CY };
            ballVelRef.current = { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
            runStartTimeRef.current = performance.now();
          }
        }

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
            }, 4500);
          }, 1800);
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
    if (countdown === null || countdown <= 0) {
      if (countdown === 0) {
        fetchArena();
        const t1 = setTimeout(fetchArena, 500);
        const t2 = setTimeout(fetchArena, 1000);
        const t3 = setTimeout(fetchArena, 1600);
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
      }
      return;
    }
    const t = setTimeout(() => setCountdown(c => (c !== null && c > 0 ? c - 1 : 0)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  /* ── Ball animation RAF loop ── */
  useEffect(() => {
    let active = true;
    const EDGE = 2;
    const ATTRACT_MS = 4000;

    const place = (nx: number, ny: number, vx?: number, vy?: number) => {
      ballPosRef.current = { x: nx, y: ny };
      ballCircleRef.current?.setAttribute("cx", nx.toFixed(2));
      ballCircleRef.current?.setAttribute("cy", ny.toFixed(2));
      ballGlowRef.current?.setAttribute("cx", nx.toFixed(2));
      ballGlowRef.current?.setAttribute("cy", ny.toFixed(2));

      // Update arrow direction
      if (arrowRef.current && vx !== undefined && vy !== undefined) {
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > 0.5) {
          const angle = Math.atan2(vy, vx) * (180 / Math.PI);
          arrowRef.current.setAttribute("transform", `translate(${nx.toFixed(2)}, ${ny.toFixed(2)}) rotate(${angle.toFixed(1)})`);
          arrowRef.current.setAttribute("opacity", "0.9");
        }
      }
    };

    const wallBounce = (nx: number, ny: number, vx: number, vy: number) => {
      // Natural corner-like bounces: use slight angle variation on bounce
      const jitter = () => (Math.random() - 0.5) * 0.3;
      if (nx - BALL_R <= EDGE) { nx = BALL_R + EDGE; vx = Math.abs(vx) + jitter(); }
      if (nx + BALL_R >= SQ - EDGE) { nx = SQ - BALL_R - EDGE; vx = -(Math.abs(vx) + jitter()); }
      if (ny - BALL_R <= EDGE) { ny = BALL_R + EDGE; vy = Math.abs(vy) + jitter(); }
      if (ny + BALL_R >= SQ - EDGE) { ny = SQ - BALL_R - EDGE; vy = -(Math.abs(vy) + jitter()); }
      return { nx, ny, vx, vy };
    };

    const step = () => {
      if (!active) return;

      if (ballStateRef.current === "IDLE") {
        place(CX, CY, 0, 0);
        if (arrowRef.current) arrowRef.current.setAttribute("opacity", "0");
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      if (ballStoppedRef.current && ballTargetRef.current) {
        const tgt = ballTargetRef.current;
        const pos = ballPosRef.current;
        const dx = tgt.x - pos.x;
        const dy = tgt.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 2) {
          ballStoppedRef.current = false;
          ballVelRef.current = { vx: dx * 0.14, vy: dy * 0.14 };
        } else {
          const cb = onBallStopRef.current;
          if (cb) { onBallStopRef.current = null; cb(); }
          if (arrowRef.current) arrowRef.current.setAttribute("opacity", "0");
          rafRef.current = requestAnimationFrame(step);
          return;
        }
      }
      if (ballStoppedRef.current) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      const elapsed = runStartTimeRef.current !== null
        ? performance.now() - runStartTimeRef.current : 0;

      const pos = ballPosRef.current;
      let { vx, vy } = ballVelRef.current;

      if (elapsed >= ATTRACT_MS && ballTargetRef.current) {
        const tgt = ballTargetRef.current;
        const dx = tgt.x - pos.x;
        const dy = tgt.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 1.2) {
          ballStoppedRef.current = true;
          ballVelRef.current = { vx: 0, vy: 0 };
          place(tgt.x, tgt.y, 0, 0);
          if (arrowRef.current) arrowRef.current.setAttribute("opacity", "0");
          const cb = onBallStopRef.current;
          onBallStopRef.current = null;
          cb?.();
          rafRef.current = requestAnimationFrame(step);
          return;
        }

        const attractElapsed = elapsed - ATTRACT_MS;
        const rampIn = Math.min(1, attractElapsed / 600);
        const distFactor = Math.min(0.13, dist / 280);
        const pullFactor = Math.max(0.012, distFactor * rampIn);
        vx = dx * pullFactor;
        vy = dy * pullFactor;
        ballVelRef.current = { vx, vy };
        place(pos.x + vx, pos.y + vy, vx, vy);
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      // Free bounce phase — natural wall bounces
      vx *= 0.994;
      vy *= 0.994;
      const b = wallBounce(pos.x + vx, pos.y + vy, vx, vy);
      ballVelRef.current = { vx: b.vx, vy: b.vy };
      place(b.nx, b.ny, b.vx, b.vy);
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
      const speed = 4 + Math.random() * 2;
      ballStateRef.current = "RUNNING";
      ballStoppedRef.current = false;
      ballPosRef.current = { x: CX, y: CY };
      ballVelRef.current = { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
      runStartTimeRef.current = performance.now();
    };

    if (prevCountdownRef.current !== null && prevCountdownRef.current > 0 && countdown === 0) {
      if (ballStateRef.current === "IDLE") launchBall();
    }

    if (arena?.status === "finished" && arena?.winnerId && !ballTargetRef.current) {
      const sector = arena.winnerSector
        ?? (sectorsRef.current.find(s => s.player.telegramId === arena.winnerId)
          ? { startDeg: sectorsRef.current.find(s => s.player.telegramId === arena.winnerId)!.startDeg, endDeg: sectorsRef.current.find(s => s.player.telegramId === arena.winnerId)!.endDeg }
          : null);
      if (sector) {
        const [tx, ty] = sectorRandomPoint(sector.startDeg, sector.endDeg);
        ballTargetRef.current = { x: tx, y: ty };
        if (ballStoppedRef.current && ballStateRef.current === "RUNNING") {
          ballStoppedRef.current = false;
          const pos = ballPosRef.current;
          ballVelRef.current = { vx: (tx - pos.x) * 0.12, vy: (ty - pos.y) * 0.12 };
        }
      }
      if (ballStateRef.current === "IDLE") launchBall();
    }

    if (arena?.status === "waiting") {
      const animationDone = ballStoppedRef.current || ballStateRef.current === "IDLE";
      if (animationDone) {
        cancelTimersRef.current?.();
        cancelTimersRef.current = null;
        onBallStopRef.current = null;
        ballStateRef.current = "IDLE";
        ballPosRef.current = { x: CX, y: CY };
        ballVelRef.current = { vx: 0, vy: 0 };
        ballTargetRef.current = null;
        ballStoppedRef.current = false;
        runStartTimeRef.current = null;
        setAnimPhase("idle");
        setPendingResult(null);
      }
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
        fraction: frac,
      });
      acc += frac;
    });
  }
  sectorsRef.current = sectors;

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#060B12",
      display: "flex", flexDirection: "column",
      zIndex: 100,
      fontFamily: "'Inter', system-ui, sans-serif",
      overflowY: "auto",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        @keyframes fadeScaleIn { from{opacity:0;transform:scale(0.75)} to{opacity:1;transform:scale(1)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulseGlow { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes timerPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
        @keyframes winnerPulse { 0%,100%{opacity:0.25} 50%{opacity:0.7} }
        @keyframes winnerBorderGlow { 0%,100%{box-shadow:0 0 20px var(--wc)} 50%{box-shadow:0 0 50px var(--wc)} }
        @keyframes confettiDrop { 0%{transform:translateY(-20px) rotate(0deg);opacity:1} 100%{transform:translateY(80px) rotate(360deg);opacity:0} }
        @keyframes floatUp { from{opacity:1;transform:translateY(0)} to{opacity:0;transform:translateY(-40px)} }
        @keyframes arenaAppear { from{opacity:0;transform:scale(0.9)} to{opacity:1;transform:scale(1)} }
      `}</style>

      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* ── WINNER OVERLAY ── */}
      {pendingResult && animPhase !== "idle" && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.85)",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(8px)",
        }}>
          <div style={{
            background: "linear-gradient(145deg,#0F1923,#141E2A)",
            borderRadius: 28, padding: "44px 52px", textAlign: "center",
            border: `2px solid ${pendingResult.won ? "#4ADE80" : "#F43F5E"}`,
            boxShadow: `0 0 80px ${pendingResult.won ? "rgba(74,222,128,0.45)" : "rgba(244,63,94,0.4)"}`,
            animation: "fadeScaleIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
            maxWidth: "84vw",
          }}>
            <div style={{ fontSize: 64, marginBottom: 12, lineHeight: 1 }}>
              {pendingResult.won ? "🏆" : "😔"}
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: pendingResult.won ? "#4ADE80" : "#F43F5E", marginBottom: 8 }}>
              {pendingResult.won ? "ВЫ ПОБЕДИЛИ!" : "Вам не повезло"}
            </div>
            {animPhase === "payout" && pendingResult.won && (
              <div style={{ fontSize: 36, fontWeight: 900, color: "#FBBF24", marginBottom: 6, animation: "fadeScaleIn 0.5s ease" }}>
                +{pendingResult.payout} ▽
              </div>
            )}
            <div style={{ fontSize: 14, color: "#6B7280", marginTop: 6 }}>
              {pendingResult.won
                ? animPhase === "payout" ? "Выигрыш зачислен на баланс 🎉" : "Шарик остановился в вашем секторе!"
                : `Победил ${pendingResult.name}`}
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px 10px",
        background: "#0A1018",
        borderBottom: "1px solid #141E2A",
        flexShrink: 0,
      }}>
        <button onClick={() => { haptic("light"); onClose(); }} style={{
          background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6,
          color: "#6B7280", fontSize: 14, fontWeight: 600, fontFamily: "inherit", padding: "4px 0",
        }}>
          <span style={{ fontSize: 18 }}>←</span>
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>⚔️</span>
          <span style={{ fontSize: 17, fontWeight: 900, color: "#fff" }}>ПВП Арена</span>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 8px #22C55E", animation: "pulseGlow 2s ease-in-out infinite" }} />
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setShowFairness(true)} style={{
            background: "#0F1923", border: "1px solid #1A2535", borderRadius: 8,
            width: 34, height: 34, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280", fontSize: 15,
          }}>🔐</button>
          <button onClick={() => onOpenHistory?.()} style={{
            background: "#0F1923", border: "1px solid #1A2535", borderRadius: 8,
            width: 34, height: 34, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280", fontSize: 15,
          }}>📋</button>
        </div>
      </div>

      {/* ── BALANCE ROW ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", background: "#0A1018", flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: "#374151" }}>{onlineDisp} онлайн</span>
        <div style={{
          background: "#0F1923", border: "1px solid #1A2535",
          borderRadius: 20, padding: "6px 14px",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 13, color: "#F59E0B" }}>▽</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#E5E7EB" }}>{tonBalance.toFixed(2)} TON</span>
        </div>
      </div>

      {/* ── SCROLLABLE CONTENT ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px 32px" }}>

        {/* STAT CARDS */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <StatCard label="ТОП ИГРА" username={topGame?.username ?? null} amount={topGame?.payout ?? 0}
            badge={topGame ? (topGame.username ?? "?").slice(0, 2).toUpperCase() : undefined} onClick={onOpenHistory} />
          <StatCard label="ПОСЛЕДНЯЯ" username={lastGame?.username ?? null} amount={lastGame?.payout ?? 0}
            badge={lastGame ? (lastGame.username ?? "?").slice(0, 2).toUpperCase() : undefined} onClick={onOpenHistory} />
        </div>

        {/* ── ARENA BLOCK ── */}
        <div style={{
          background: "#0A1018", border: "1px solid #141E2A",
          borderRadius: 20, overflow: "hidden", marginBottom: 14,
          animation: "arenaAppear 0.4s ease",
        }}>
          {/* Arena header: total + status */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", borderBottom: "1px solid #141E2A",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14, color: "#F59E0B" }}>▽</span>
              <span style={{ fontSize: 18, fontWeight: 900, color: "#F59E0B" }}>
                {fmtTON(totalPool)} TON
              </span>
              <span style={{ fontSize: 11, color: "#4B5563", fontWeight: 600 }}>в банке</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {isStarting ? (
                <>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E", animation: "pulseGlow 1s ease-in-out infinite" }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#22C55E" }}>В эфире</span>
                  {countdown !== null && countdown > 0 && (
                    <span style={{
                      marginLeft: 6, fontSize: 15, fontWeight: 900,
                      color: countdown <= 5 ? "#F87171" : "#fff",
                      animation: countdown <= 5 ? "timerPulse 0.8s ease-in-out infinite" : "none",
                    }}>{fmtTimer(countdown)}</span>
                  )}
                </>
              ) : isFinished ? (
                <span style={{ fontSize: 13, color: "#4B5563" }}>Завершено</span>
              ) : (
                <>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#F59E0B", animation: "pulseGlow 2s ease-in-out infinite" }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#F59E0B" }}>Ожидание</span>
                </>
              )}
            </div>
          </div>

          {/* ── ARENA VISUAL ── */}
          <div style={{ display: "flex", justifyContent: "center", padding: "16px", background: "#060B12" }}>
            <div style={{
              position: "relative",
              width: SQ, height: SQ,
              borderRadius: 18,
              overflow: "hidden",
              boxShadow: "0 0 0 1px #1A2535, 0 12px 40px rgba(0,0,0,0.7)",
            }}>
              <svg width={SQ} height={SQ} style={{ position: "absolute", inset: 0, display: "block" }}>
                <defs>
                  <radialGradient id="bgGrad" cx="50%" cy="50%" r="70%">
                    <stop offset="0%" stopColor="#1A2535" />
                    <stop offset="100%" stopColor="#060B12" />
                  </radialGradient>
                  <filter id="ballGlow">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                <rect x={0} y={0} width={SQ} height={SQ} fill="url(#bgGrad)" />

                {/* Sectors */}
                {players.length === 1 ? (
                  <rect x={0} y={0} width={SQ} height={SQ} fill={col(0)} opacity={0.88} />
                ) : players.length > 1 ? sectors.map(s => (
                  <polygon
                    key={s.player.telegramId}
                    points={s.points}
                    fill={s.color}
                    opacity={0.85}
                  />
                )) : null}

                {/* Dividers */}
                {sectors.length >= 2 && sectors.map(s => {
                  const [ex, ey] = squarePoint(s.startDeg);
                  return (
                    <line key={`div-${s.player.telegramId}`}
                      x1={CX} y1={CY} x2={ex} y2={ey}
                      stroke="#060B12" strokeWidth={2.5} />
                  );
                })}

                {/* Winner sector pulse */}
                {animPhase !== "idle" && sectors.map(s => {
                  if (arena?.winnerId !== s.player.telegramId) return null;
                  return (
                    <polygon key={`win-${s.player.telegramId}`}
                      points={s.points}
                      fill={s.color}
                      opacity={0.4}
                      style={{ animation: "winnerPulse 0.6s ease-in-out infinite" }} />
                  );
                })}

                {/* Center circle */}
                <circle cx={CX} cy={CY} r={18} fill="#060B12" stroke="#1A2535" strokeWidth={2} />

                {/* Arrow indicator (rotates with velocity) */}
                {players.length >= 1 && ballStateRef.current === "RUNNING" && (
                  <g ref={arrowRef} opacity={0} style={{ pointerEvents: "none" }}>
                    <polygon points="12,0 -5,-5 -5,5" fill="white" opacity={0.7} />
                  </g>
                )}

                {/* Ball */}
                {players.length >= 1 && (
                  <>
                    <circle ref={ballGlowRef} cx={CX} cy={CY} r={BALL_R + 8} fill="white" opacity={0.12} />
                    <circle ref={ballCircleRef} cx={CX} cy={CY} r={BALL_R}
                      fill="white" stroke="rgba(0,0,0,0.2)" strokeWidth={1.5}
                      style={{ filter: "url(#ballGlow)" }}
                    />
                  </>
                )}
              </svg>

              {/* Avatar overlays — size scales with sector % */}
              {sectors.map(s => {
                const isWinner = animPhase !== "idle" && arena?.winnerId === s.player.telegramId;
                const isMe = s.player.telegramId === telegramId;
                const AV = sectorAvatarSize(isWinner ? Math.min(1, s.fraction + 0.15) : s.fraction);
                return (
                  <div key={s.player.telegramId} style={{
                    position: "absolute",
                    left: s.avatarX - AV / 2,
                    top: s.avatarY - AV / 2,
                    transition: "all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
                    zIndex: isWinner ? 20 : 10,
                  }}>
                    <PlayerAvatar
                      player={s.player}
                      color={s.color}
                      size={AV}
                      isWinner={isWinner}
                      isMe={isMe}
                    />
                  </div>
                );
              })}

              {/* Empty state */}
              {players.length === 0 && (
                <div style={{
                  position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", color: "#374151",
                }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>⚔️</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Ждём игроков...</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── BETTING PANEL ── */}
        {!isIn && !isFinished && (
          <div style={{
            background: "#0A1018", border: "1px solid #141E2A",
            borderRadius: 18, padding: "16px", marginBottom: 14,
            animation: "slideUp 0.3s ease",
          }}>
            <div style={{ fontSize: 11, color: "#4B5563", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 12 }}>
              💰 СТАВКА
            </div>

            {/* 3 editable + 1 all-in */}
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {quickStakes.map((v, i) => (
                <EditableStakeButton
                  key={i}
                  value={v}
                  selected={selectedQuick === i}
                  onSelect={() => handleQuickSelect(v, i)}
                  onChange={(newV) => {
                    const updated = [...quickStakes];
                    updated[i] = newV;
                    setQuickStakes(updated);
                    if (selectedQuick === i) setJoin(newV);
                  }}
                />
              ))}
              {/* All-in button */}
              <button
                onClick={() => { handleQuickSelect(tonBalance, "allin"); }}
                style={{
                  flex: 1, padding: "10px 4px", borderRadius: 10, border: "none",
                  background: selectedQuick === "allin"
                    ? "linear-gradient(135deg,#7C3AED,#A855F7)"
                    : "#0F1923",
                  border: `1.5px solid ${selectedQuick === "allin" ? "#A855F7" : "#1A2535"}`,
                  color: selectedQuick === "allin" ? "#fff" : "#6B7280",
                  fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                  boxShadow: selectedQuick === "allin" ? "0 0 14px rgba(168,85,247,0.5)" : "none",
                } as React.CSSProperties}
              >🚀<br />ВА-БАНК</button>
            </div>

            {/* Manual input */}
            <div style={{ position: "relative", marginBottom: 12 }}>
              <input
                value={joinInput}
                onChange={e => {
                  setJoinInput(e.target.value);
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v > 0) { setJoinStake(Math.round(v * 1000) / 1000); setSelectedQuick(null); }
                }}
                placeholder="Своя сумма..."
                type="number" step="0.1" min="0.1"
                style={{
                  width: "100%", background: "#060B12",
                  border: "1px solid #1A2535", borderRadius: 10,
                  padding: "11px 52px 11px 14px", color: "#E5E7EB",
                  fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                }}
              />
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#4B5563", fontWeight: 700 }}>TON</span>
            </div>

            <button
              onClick={join}
              disabled={busy || joinStake < 0.1 || joinStake > tonBalance}
              style={{
                width: "100%", padding: "15px 0", borderRadius: 14, border: "none",
                background: busy || joinStake < 0.1 || joinStake > tonBalance
                  ? "#1A2535"
                  : "linear-gradient(135deg,#D97706,#F59E0B)",
                color: joinStake > tonBalance ? "#4B5563" : "#000",
                fontSize: 15, fontWeight: 900,
                cursor: busy || joinStake < 0.1 || joinStake > tonBalance ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                boxShadow: joinStake <= tonBalance && joinStake >= 0.1 ? "0 0 28px rgba(245,158,11,0.4)" : "none",
              }}
            >
              {busy ? "..." : joinStake > tonBalance ? "Недостаточно TON" : `⚔️ Войти · ${fmtTON(joinStake)} TON`}
            </button>
          </div>
        )}

        {/* ── ALREADY IN ── */}
        {isIn && myP && (
          <div style={{
            background: "rgba(29,78,216,0.08)", border: "1px solid rgba(29,78,216,0.25)",
            borderRadius: 16, padding: "14px 16px", marginBottom: 12,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 11, color: "#3B82F6", fontWeight: 600, marginBottom: 4 }}>Ваша ставка</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>
                {fmtTON(myP.stake)} <span style={{ fontSize: 13, color: "#4B5563" }}>TON</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#4B5563", marginBottom: 4 }}>Шанс</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#4ADE80" }}>{myP.chance.toFixed(1)}%</div>
            </div>
          </div>
        )}

        {/* If-win preview */}
        {isIn && myP && totalPool > myP.stake && (
          <div style={{
            background: "#060B12", border: "1px solid #141E2A",
            borderRadius: 12, padding: "10px 14px", marginBottom: 12,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ fontSize: 12, color: "#4B5563" }}>💡 Если победишь</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: "#4ADE80" }}>
              +{(myP.stake + (totalPool - myP.stake) * 0.80).toFixed(3)} TON
            </div>
          </div>
        )}

        {/* Increase stake */}
        {isIn && (arena?.status === "waiting" || arena?.status === "starting") && (
          <div style={{
            background: "#0A1018", border: "1px solid #1A3050",
            borderRadius: 14, padding: "12px", marginBottom: 14,
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8,
            }}>
              <div style={{ fontSize: 11, color: "#3B82F6", fontWeight: 600 }}>💰 Добавить к ставке</div>
              <button
                onClick={() => setShowIncreasePanel(v => !v)}
                style={{ background: "none", border: "none", color: "#4B5563", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
              >{showIncreasePanel ? "▲" : "▼"}</button>
            </div>
            {showIncreasePanel && (
              <>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  {[0.1, 0.5, 1, 2, 5].map(v => (
                    <button key={v}
                      onClick={() => { setIncreaseAmt(v); setIncreaseInput(String(v)); }}
                      style={{
                        flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                        background: increaseAmt === v ? "#1D4ED8" : "#0F1923",
                        color: increaseAmt === v ? "#fff" : "#4B5563",
                        fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                      }}
                    >+{v}</button>
                  ))}
                </div>
                <div style={{ position: "relative", marginBottom: 8 }}>
                  <input
                    value={increaseInput}
                    onChange={e => { setIncreaseInput(e.target.value); const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) setIncreaseAmt(Math.round(v * 1000) / 1000); }}
                    placeholder="Своя сумма..."
                    type="number" step="0.1" min="0.1"
                    style={{
                      width: "100%", background: "#060B12", border: "1px solid #1A2535", borderRadius: 8,
                      padding: "9px 46px 9px 12px", color: "#E5E7EB", fontSize: 13, outline: "none",
                      boxSizing: "border-box", fontFamily: "inherit",
                    }}
                  />
                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#4B5563", fontWeight: 700 }}>TON</span>
                </div>
                <button
                  onClick={increaseStake}
                  disabled={busy || increaseAmt <= 0 || increaseAmt > tonBalance}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 10, border: "none",
                    background: busy || increaseAmt <= 0 || increaseAmt > tonBalance ? "#1A2535" : "linear-gradient(135deg,#1D4ED8,#3B82F6)",
                    color: "#fff", fontSize: 14, fontWeight: 700,
                    cursor: busy || increaseAmt > tonBalance ? "not-allowed" : "pointer", fontFamily: "inherit",
                  }}
                >{busy ? "..." : `➕ Добавить ${increaseAmt} TON`}</button>
              </>
            )}
          </div>
        )}

        {isFinished && (
          <div style={{ textAlign: "center", padding: "14px 0", marginBottom: 14, color: "#374151", fontSize: 13 }}>
            ⏳ Новая игра начинается…
          </div>
        )}

        {/* ── PLAYERS TABLE ── */}
        <div style={{ marginBottom: 6 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10,
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#D1D5DB" }}>
              Участники <span style={{ color: "#374151", fontWeight: 600 }}>· {players.length}</span>
            </div>
            {arena && (
              <div style={{ fontSize: 11, color: "#1F2937", fontWeight: 600, letterSpacing: "0.05em" }}>
                #{arena.id.toString().padStart(6, "0")}
              </div>
            )}
          </div>

          {players.length === 0 && (
            <div style={{ textAlign: "center", padding: "28px 0", color: "#1F2937", fontSize: 13 }}>
              Нет игроков. Будь первым!
            </div>
          )}

          {/* Table header */}
          {players.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, padding: "6px 14px", marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: "#374151", fontWeight: 700, letterSpacing: "0.07em" }}>ИГРОК</div>
              <div style={{ fontSize: 10, color: "#374151", fontWeight: 700, letterSpacing: "0.07em", textAlign: "right" }}>СТАВКА</div>
              <div style={{ fontSize: 10, color: "#374151", fontWeight: 700, letterSpacing: "0.07em", textAlign: "right", minWidth: 48 }}>ШАНС</div>
            </div>
          )}

          {players.map((p, i) => {
            const isMe = p.telegramId === telegramId;
            const isWin = isFinished && arena?.winnerId === p.telegramId;
            const c = col(i);
            return (
              <div key={p.telegramId} style={{
                display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center",
                background: isWin ? (c + "18") : isMe ? "#0F1923" : "#080E16",
                border: `1px solid ${isWin ? c + "55" : isMe ? "#1A3050" : "#0F1923"}`,
                borderRadius: 14, padding: "10px 14px", marginBottom: 7,
                animation: "slideUp 0.25s ease",
                transition: "all 0.3s ease",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <PlayerAvatar player={p} color={c} size={34} isWinner={isWin} isMe={isMe} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isWin ? c : isMe ? "#60A5FA" : "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.username ? `@${p.username}` : `#${p.telegramId.slice(-5)}`}
                      {isWin && " 🏆"}{isMe && !isWin && <span style={{ color: "#374151", fontSize: 11 }}> · ты</span>}
                    </div>
                    {/* Chance bar */}
                    <div style={{ height: 3, borderRadius: 2, background: "#141E2A", marginTop: 5, overflow: "hidden" }}>
                      <div style={{ width: `${p.chance}%`, height: "100%", background: c, borderRadius: 2, transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#F59E0B", textAlign: "right", whiteSpace: "nowrap" }}>
                  {fmtTON(p.stake)} ▽
                </div>
                <div style={{ textAlign: "right", minWidth: 48 }}>
                  <div style={{
                    display: "inline-block", padding: "3px 8px", borderRadius: 8,
                    background: c + "20", border: `1px solid ${c}44`,
                    fontSize: 12, fontWeight: 700, color: c,
                  }}>{p.chance.toFixed(1)}%</div>
                </div>
              </div>
            );
          })}
        </div>
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
