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

/**
 * TONYX Arena — square board, stake strips, physics bounce path (no mid-air homing).
 * Server picks winner after timer; client precomputes a billiard path to a random
 * point inside the winner strip and plays it with wall reflections only.
 */

const W = 352;
const H = 352;
const BALL_R = 12;
const MARGIN = 6;
const COMMISSION = 0.2;
const MIN_STAKE = 0.1;
const DEFAULT_BETS = [0.1, 0.5, 1, 2, 5, 10];
const SPIN_MS = 6800;
const ARROW_MS = 900;

const COLORS = [
  "#22c55e",
  "#ef4444",
  "#f59e0b",
  "#06b6d4",
  "#a855f7",
  "#eab308",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#3b82f6",
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

interface HistoryRoom {
  id: number;
  winnerId: string | null;
  winnerUsername: string | null;
  winnerPayout: number;
  totalPool: number;
  playerCount: number;
  players: ArenaPlayer[];
  finishedAt: string | null;
  fair?: {
    serverSeed: string | null;
    serverSeedHash: string | null;
    clientSeed: string | null;
    nonce: number | null;
    hash: string | null;
  };
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

type PathPoint = { x: number; y: number; t: number };

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

/** Vertical strips — width strictly proportional to stake / total pool. */
function buildStrips(players: ArenaPlayer[]): Strip[] {
  const list = players.filter((p) => p && p.stake > 0);
  const total = list.reduce((s, p) => s + p.stake, 0) || 1;
  let acc = 0;
  return list.map((p, i) => {
    const share = p.stake / total;
    const x0 = acc * W;
    acc += share;
    // last strip absorbs rounding so strips cover full width
    const x1 = i === list.length - 1 ? W : acc * W;
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

/**
 * Billiard path via method of images.
 * Straight line in unfolded table → fold into wall reflections.
 * Ends exactly at target; no mid-air steering.
 */
function planBouncePath(
  start: { x: number; y: number },
  target: { x: number; y: number },
): PathPoint[] {
  const lo = MARGIN + BALL_R;
  const hiX = W - MARGIN - BALL_R;
  const hiY = H - MARGIN - BALL_R;
  const pw = hiX - lo;
  const ph = hiY - lo;

  const clampStart = {
    x: Math.min(hiX, Math.max(lo, start.x)),
    y: Math.min(hiY, Math.max(lo, start.y)),
  };
  const clampTarget = {
    x: Math.min(hiX, Math.max(lo, target.x)),
    y: Math.min(hiY, Math.max(lo, target.y)),
  };

  // local coords inside playable rect
  const sx = clampStart.x - lo;
  const sy = clampStart.y - lo;
  const tx0 = clampTarget.x - lo;
  const ty0 = clampTarget.y - lo;

  type Cand = { nx: number; ny: number; dist: number; bounces: number };
  const cands: Cand[] = [];

  for (let nx = -6; nx <= 6; nx++) {
    for (let ny = -6; ny <= 6; ny++) {
      if (nx === 0 && ny === 0) continue;
      // reflected target in cell (nx, ny)
      const rx = nx % 2 === 0 ? tx0 : pw - tx0;
      const ry = ny % 2 === 0 ? ty0 : ph - ty0;
      const gx = nx * pw + rx;
      const gy = ny * ph + ry;
      const dist = Math.hypot(gx - sx, gy - sy);
      const bounces = Math.abs(nx) + Math.abs(ny);
      // prefer 3–8 bounces, medium length
      if (bounces < 2 || bounces > 9) continue;
      if (dist < 180 || dist > 1400) continue;
      cands.push({ nx, ny, dist, bounces });
    }
  }

  // fallback: at least one bounce
  if (cands.length === 0) {
    for (let nx = -4; nx <= 4; nx++) {
      for (let ny = -4; ny <= 4; ny++) {
        if (nx === 0 && ny === 0) continue;
        const rx = nx % 2 === 0 ? tx0 : pw - tx0;
        const ry = ny % 2 === 0 ? ty0 : ph - ty0;
        const gx = nx * pw + rx;
        const gy = ny * ph + ry;
        const dist = Math.hypot(gx - sx, gy - sy);
        cands.push({ nx, ny, dist, bounces: Math.abs(nx) + Math.abs(ny) });
      }
    }
  }

  cands.sort((a, b) => {
    // prefer 4–7 bounces, then mid distance
    const score = (c: Cand) =>
      Math.abs(c.bounces - 5) * 80 + Math.abs(c.dist - 520);
    return score(a) - score(b);
  });

  // pick among top few for variety
  const top = cands.slice(0, Math.min(8, cands.length));
  const pick = top[Math.floor(Math.random() * top.length)] ?? {
    nx: 1,
    ny: 1,
    dist: 400,
    bounces: 2,
  };

  const rx = pick.nx % 2 === 0 ? tx0 : pw - tx0;
  const ry = pick.ny % 2 === 0 ? ty0 : ph - ty0;
  const gx = pick.nx * pw + rx;
  const gy = pick.ny * ph + ry;

  const samples = Math.max(48, Math.floor(pick.dist / 6));
  const pts: PathPoint[] = [];

  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    // unfolded position
    let ux = sx + (gx - sx) * u;
    let uy = sy + (gy - sy) * u;

    // fold back into [0, pw] x [0, ph]
    let cellX = Math.floor(ux / pw);
    let cellY = Math.floor(uy / ph);
    let lx = ux - cellX * pw;
    let ly = uy - cellY * ph;
    if (lx < 0) {
      lx += pw;
      cellX -= 1;
    }
    if (ly < 0) {
      ly += ph;
      cellY -= 1;
    }
    if (cellX % 2 !== 0) lx = pw - lx;
    if (cellY % 2 !== 0) ly = ph - ly;

    const x = lo + lx;
    const y = lo + ly;
    // ease-out time mapping so end is smooth
    const t = 1 - Math.pow(1 - u, 1.35);
    pts.push({ x, y, t });
  }

  // ensure exact end
  if (pts.length) {
    pts[pts.length - 1] = { x: clampTarget.x, y: clampTarget.y, t: 1 };
  }
  return pts;
}

function randomInStrip(strip: Strip): { x: number; y: number } {
  const pad = BALL_R + 4;
  const w = Math.max(2, strip.x1 - strip.x0);
  const innerW = Math.max(1, w - pad * 2);
  const x =
    strip.x0 +
    pad +
    Math.random() * innerW;
  // clamp into board playable x
  const lo = MARGIN + BALL_R;
  const hiX = W - MARGIN - BALL_R;
  const cx = Math.min(hiX, Math.max(lo, x));
  const y =
    MARGIN +
    BALL_R +
    Math.random() * (H - 2 * (MARGIN + BALL_R));
  return { x: cx, y };
}

function randomStart(): { x: number; y: number } {
  const lo = MARGIN + BALL_R;
  const hiX = W - MARGIN - BALL_R;
  const hiY = H - MARGIN - BALL_R;
  return {
    x: lo + Math.random() * (hiX - lo),
    y: lo + Math.random() * (hiY - lo),
  };
}

/** Interpolate along path by normalized time t∈[0,1]. */
function samplePath(path: PathPoint[], t: number): { x: number; y: number } {
  if (!path.length) return { x: W / 2, y: H / 2 };
  if (t <= 0) return { x: path[0].x, y: path[0].y };
  if (t >= 1) {
    const last = path[path.length - 1];
    return { x: last.x, y: last.y };
  }
  // path.t is already ease-mapped; find segment
  let i = 0;
  while (i < path.length - 1 && path[i + 1].t < t) i++;
  const a = path[i];
  const b = path[Math.min(i + 1, path.length - 1)];
  const span = Math.max(1e-6, b.t - a.t);
  const k = (t - a.t) / span;
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
  };
}

function pathDirection(path: PathPoint[]): number {
  if (path.length < 2) return 0;
  const a = path[0];
  const b = path[Math.min(6, path.length - 1)];
  return Math.atan2(b.y - a.y, b.x - a.x);
}

const CSS = `
@keyframes arPulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
@keyframes arPop {
  0% { opacity: 0; transform: translateY(16px) scale(0.94); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes arArrowIn {
  0% { opacity: 0; transform: scale(0.6); }
  40% { opacity: 1; transform: scale(1.08); }
  100% { opacity: 1; transform: scale(1); }
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
