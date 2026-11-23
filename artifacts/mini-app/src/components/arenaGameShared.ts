import type { CSSProperties } from "react";
import {
  W, H, BALL_R, POINT_R, MARGIN, makeRng,
  planBouncePath, randomInStrip, randomStart, samplePath, pathDirection, pointInPoly,
} from "./arenaPhysics";

export const COMMISSION = 0.2;
export const MIN_STAKE = 0.1;
export const SPIN_MS = 9500;
export const DIR_MS = 350;
export const WINNER_HOLD_MS = 4500;
export const DEFAULT_CHIPS = [5, 10, 100];
export const CHIPS_KEY = "tonyx_arena_chips_v2";
export const COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#ec4899", "#84cc16",
  "#f97316", "#8b5cf6", "#14b8a6", "#eab308", "#f43f5e", "#0ea5e9", "#d946ef", "#10b981",
];

export function TonIcon({ size = 16 }: { size?: number }) {
  return (
    <img
      src="/toncoin.png"
      alt="TON"
      width={size}
      height={size}
      style={{
        width: size, height: size, objectFit: "cover", display: "inline-block",
        verticalAlign: "middle", borderRadius: Math.round(size * 0.22),
      }}
      draggable={false}
    />
  );
}

export function TonChip({ amount, size = 56 }: { amount: number | string; size?: number }) {
  const label = typeof amount === "number"
    ? (Math.abs(amount - Math.round(amount)) < 1e-9 ? String(Math.round(amount)) : amount.toFixed(2))
    : String(amount);
  const badgeFs = Math.max(11, Math.round(size * 0.22));
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.22),
      boxShadow: "0 4px 14px rgba(37,99,235,0.4)", position: "relative", flexShrink: 0,
      overflow: "hidden", border: "1px solid rgba(255,255,255,0.2)",
    }}>
      <img src="/toncoin.png" alt="TON" style={{
        position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block",
      }} draggable={false} />
      <div style={{
        position: "absolute", left: "50%", bottom: Math.round(size * 0.07), transform: "translateX(-50%)",
        display: "flex", alignItems: "center", gap: 3, background: "rgba(0,0,0,0.45)", borderRadius: 999,
        padding: `2px ${Math.max(7, Math.round(size * 0.12))}px`, border: "1px solid rgba(255,255,255,0.25)",
        backdropFilter: "blur(4px)",
      }}>
        <span style={{ fontWeight: 900, fontSize: badgeFs, color: "#fff", lineHeight: 1.2, letterSpacing: "-0.02em" }}>{label}</span>
      </div>
    </div>
  );
}

export interface NftStakeInfo {
  inventoryId: number; itemId: string; valueTon: number; nameRu?: string; imageUrl?: string | null;
}
export interface ArenaPlayer {
  telegramId: string; username: string | null; stake: number; chance: number; photoUrl?: string | null;
  nftStakes?: NftStakeInfo[];
}
export interface ArenaState {
  id: number; status: "waiting" | "starting" | "finished"; totalPool: number;
  players: ArenaPlayer[]; winnerId: string | null; winnerUsername: string | null; startAt: string | null;
  fair?: { serverSeed?: string | null; serverSeedHash?: string | null; clientSeed?: string | null; hash?: string | null; nonce?: number | null };
}
export interface HistoryRoom {
  id: number; winnerId: string | null; winnerUsername: string | null; winnerPayout: number;
  totalPool: number; playerCount: number; players: ArenaPlayer[]; finishedAt: string | null;
  fair?: { serverSeed?: string | null; serverSeedHash?: string | null; clientSeed?: string | null; hash?: string | null };
}
export type Phase = "lobby" | "spin" | "winner";
export interface Props {
  telegramId: string; tonBalance: number; onBalanceChange?: (v?: number) => void;
  onClose: () => void; onOpenHistory?: () => void;
}
export type Pt = { x: number; y: number };
export type Strip = ArenaPlayer & {
  color: string; index: number; share: number; x0: number; x1: number; midX: number;
  poly: Pt[]; cx: number; cy: number; shape: string;
};

export function haptic(t: "light" | "medium" | "heavy" = "light") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(t); } catch { /* */ }
}
export function hapticNotify(t: "success" | "error" | "warning") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(t); } catch { /* */ }
}
export function avatarSrc(photoUrl?: string | null, username?: string | null): string | null {
  if (photoUrl && String(photoUrl).startsWith("http")) return photoUrl;
  const u = (username || "").replace(/^@/, "").trim();
  if (u) return `https://t.me/i/userpic/320/${encodeURIComponent(u)}.jpg`;
  return null;
}
export function initials(name: string | null | undefined, id: string) {
  return (name || id || "?").replace(/^@/, "").slice(0, 2).toUpperCase();
}
export function colorFor(i: number, seed = 0) {
  const n = COLORS.length;
  const start = Math.abs(seed) % n;
  const step = Math.max(3, Math.floor(n / 2) - 1);
  return COLORS[(start + i * step) % n];
}
export function payoutOf(stake: number, pool: number) {
  return Math.round((stake + (pool - stake) * (1 - COMMISSION)) * 1000) / 1000;
}
export function hash01(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

export function buildStrips(players: ArenaPlayer[], roomSeed = 0): Strip[] {
  const list = [...players].filter((p) => p && p.stake > 0).sort((a, b) => String(a.telegramId).localeCompare(String(b.telegramId)));
  const total = list.reduce((s, p) => s + p.stake, 0) || 1;
  const n = list.length;
  if (n === 0) return [];
  const mk = (p: ArenaPlayer, i: number, share: number, poly: Pt[], shape: string, place?: Pt): Strip => {
    let a = 0, cx = 0, cy = 0;
    const nn = poly.length;
    for (let k = 0; k < nn; k++) {
      const j = (k + 1) % nn;
      const cross = poly[k].x * poly[j].y - poly[j].x * poly[k].y;
      a += cross; cx += (poly[k].x + poly[j].x) * cross; cy += (poly[k].y + poly[j].y) * cross;
    }
    a *= 0.5;
    if (Math.abs(a) > 1e-3) { cx /= (6 * a); cy /= (6 * a); }
    else {
      let sx = 0, sy = 0;
      for (const q of poly) { sx += q.x; sy += q.y; }
      cx = sx / Math.max(1, nn); cy = sy / Math.max(1, nn);
    }
    if (place) { cx = place.x; cy = place.y; }
    const xs = poly.map((q) => q.x);
    const x0 = Math.min(...xs); const x1 = Math.max(...xs);
    return { ...p, color: colorFor(i, roomSeed), index: i, share, x0, x1, midX: (x0 + x1) / 2, poly, cx, cy, shape };
  };
  if (n === 1) {
    return [mk(list[0], 0, 1, [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], "rect")];
  }
  if (n === 2) {
    const [a, b] = list;
    const sa = a.stake / total; const sb = b.stake / total;
    const seed = hash01([a.telegramId, b.telegramId].map(String).sort().join("|"));
    const CORNER_MAX = 0.22;
    const smallIsA = sa <= sb; const ss = Math.min(sa, sb); const ls = Math.max(sa, sb);
    if (ss < CORNER_MAX) {
      const f = Math.min(0.95, Math.max(0.06, Math.sqrt(2 * ss)));
      const corner = Math.floor(seed * 4);
      let polyS: Pt[]; let polyL: Pt[];
      if (corner === 0) {
        polyS = [{ x: 0, y: 0 }, { x: f * W, y: 0 }, { x: 0, y: f * H }];
        polyL = [{ x: f * W, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }, { x: 0, y: f * H }];
      } else if (corner === 1) {
        polyS = [{ x: W, y: 0 }, { x: W, y: f * H }, { x: (1 - f) * W, y: 0 }];
        polyL = [{ x: 0, y: 0 }, { x: (1 - f) * W, y: 0 }, { x: W, y: f * H }, { x: W, y: H }, { x: 0, y: H }];
      } else if (corner === 2) {
        polyS = [{ x: W, y: H }, { x: (1 - f) * W, y: H }, { x: W, y: (1 - f) * H }];
        polyL = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: (1 - f) * H }, { x: (1 - f) * W, y: H }, { x: 0, y: H }];
      } else {
        polyS = [{ x: 0, y: H }, { x: 0, y: (1 - f) * H }, { x: f * W, y: H }];
        polyL = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: f * W, y: H }, { x: 0, y: (1 - f) * H }];
      }
      const stripS = mk(smallIsA ? a : b, smallIsA ? 0 : 1, ss, polyS, "corner");
      const stripL = mk(smallIsA ? b : a, smallIsA ? 1 : 0, ls, polyL, "main");
      return smallIsA ? [stripS, stripL] : [stripL, stripS];
    }
    const maxTilt = Math.min(sa, sb) * 0.35;
    const tilt = (seed - 0.5) * 2 * maxTilt;
    const minCut = Math.max(2 / W, 0.004); const maxCut = 1 - minCut;
    let cutTop = Math.max(minCut, Math.min(maxCut, sa + tilt));
    let cutBot = Math.max(minCut, Math.min(maxCut, sa - tilt));
    const mean = (cutTop + cutBot) / 2;
    if (Math.abs(mean - sa) > 1e-6) {
      const d = sa - mean;
      cutTop = Math.max(minCut, Math.min(maxCut, cutTop + d));
      cutBot = Math.max(minCut, Math.min(maxCut, cutBot + d));
    }
    return [
      mk(a, 0, sa, [{ x: 0, y: 0 }, { x: cutTop * W, y: 0 }, { x: cutBot * W, y: H }, { x: 0, y: H }], "wedge"),
      mk(b, 1, sb, [{ x: cutTop * W, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: cutBot * W, y: H }], "wedge"),
    ];
  }
  {
    const CORNER_MAX = 0.22;
    const withShare = list.map((p, i) => ({ p, i, share: p.stake / total }));
    const smalls = withShare.filter((x) => x.share < CORNER_MAX).sort((a, b) => a.share - b.share);
    const bigs = withShare.filter((x) => x.share >= CORNER_MAX).sort((a, b) => b.share - a.share);
    const cornerOrder = [0, 2, 1, 3];
    const usedCorners = new Set<number>();
    const result: Strip[] = [];
    for (let si = 0; si < smalls.length; si++) {
      const { p, i, share } = smalls[si];
      const f = Math.min(0.92, Math.max(0.08, Math.sqrt(2 * share)));
      let corner = cornerOrder[si % 4];
      for (let k = 0; k < 4; k++) {
        const c = cornerOrder[(si + k) % 4];
        if (!usedCorners.has(c)) { corner = c; break; }
      }
      usedCorners.add(corner);
      let polyS: Pt[];
      if (corner === 0) polyS = [{ x: 0, y: 0 }, { x: f * W, y: 0 }, { x: 0, y: f * H }];
      else if (corner === 1) polyS = [{ x: W, y: 0 }, { x: W, y: f * H }, { x: (1 - f) * W, y: 0 }];
      else if (corner === 2) polyS = [{ x: W, y: H }, { x: (1 - f) * W, y: H }, { x: W, y: (1 - f) * H }];
      else polyS = [{ x: 0, y: H }, { x: 0, y: (1 - f) * H }, { x: f * W, y: H }];
      result.push(mk(p, i, share, polyS, "corner"));
    }
    if (bigs.length === 0) return result;
    if (bigs.length === 1) {
      const { p, i, share } = bigs[0];
      result.push(mk(p, i, share, [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], "main"));
      return result;
    }
    const bigTotal = bigs.reduce((s, x) => s + x.share, 0) || 1;
    const cuts: number[] = [0];
    let acc = 0;
    for (let bi = 0; bi < bigs.length; bi++) {
      acc += bigs[bi].share / bigTotal;
      cuts.push(bi === bigs.length - 1 ? 1 : Math.min(0.999, Math.max(0.001, acc)));
    }
    const bn = bigs.length;
    const topX: number[] = []; const botX: number[] = [];
    for (let i = 0; i <= bn; i++) {
      if (i === 0) { topX.push(0); botX.push(0); continue; }
      if (i === bn) { topX.push(W); botX.push(W); continue; }
      const base = cuts[i];
      const seed = hash01(bigs[i - 1].p.telegramId + "|" + bigs[i].p.telegramId + "|" + i + "|" + roomSeed);
      const tilt = (seed - 0.5) * 0.12;
      const shareL = cuts[i] - cuts[i - 1]; const shareR = cuts[i + 1] - cuts[i];
      const maxT = Math.min(shareL, shareR) * 0.45;
      const tt = Math.max(-maxT, Math.min(maxT, tilt));
      topX.push(Math.max(0, Math.min(W, (base + tt) * W)));
      botX.push(Math.max(0, Math.min(W, (base - tt) * W)));
    }
    for (let bi = 0; bi < bn; bi++) {
      const { p, i, share } = bigs[bi];
      result.push(mk(p, i, share, [
        { x: topX[bi], y: 0 }, { x: topX[bi + 1], y: 0 }, { x: botX[bi + 1], y: H }, { x: botX[bi], y: H },
      ], "wedge"));
    }
    return result;
  }
}

export function loadChips(): number[] {
  try {
    const raw = localStorage.getItem(CHIPS_KEY);
    if (!raw) return [...DEFAULT_CHIPS];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length === 3 && arr.every((n) => typeof n === "number" && n > 0)) return arr;
  } catch { /* */ }
  return [...DEFAULT_CHIPS];
}

export function animSeed(data: { id?: number; winnerId: string | null; totalPool: number; fair?: ArenaState["fair"]; players: ArenaPlayer[] }) {
  const stakes = [...data.players].map((p) => `${p.telegramId}:${p.stake}`).sort().join("|");
  return [data.id ?? 0, data.winnerId ?? "", data.totalPool, data.fair?.hash ?? data.fair?.serverSeed ?? "", stakes].join("::");
}

export const CSS = `
@keyframes arPulse{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes arPop{0%{opacity:0;transform:translateY(10px) scale(.96)}100%{opacity:1;transform:none}}
@keyframes arDir{0%{opacity:0;transform:scale(.4)}40%{opacity:1;transform:scale(1.15)}100%{opacity:1;transform:scale(1)}}
.ar-board{position:relative;border-radius:0;overflow:hidden;background:#05050a}
.ar-strip-gloss{display:none}
`;
