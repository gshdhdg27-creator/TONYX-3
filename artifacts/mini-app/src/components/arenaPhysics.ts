/** Arena billiard path — deterministic (seeded), no mid-air homing */

export const W = 352;
export const H = 352;
export const BALL_R = 12;
export const MARGIN = 6;

export type PathPoint = { x: number; y: number; t: number };
export type Pt = { x: number; y: number };
export type StripLike = {
  x0: number;
  x1: number;
  poly?: Pt[];
  cx?: number;
  cy?: number;
};
export type Rng = () => number;

/** Mulberry32 PRNG — same seed => same sequence on every device */
export function makeRng(seedStr: string): Rng {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampBall(x: number, y: number): Pt {
  const lo = MARGIN + BALL_R;
  const hiX = W - MARGIN - BALL_R;
  const hiY = H - MARGIN - BALL_R;
  return {
    x: Math.min(hiX, Math.max(lo, x)),
    y: Math.min(hiY, Math.max(lo, y)),
  };
}

/** Ray-cast point-in-polygon */
export function pointInPoly(pt: Pt, poly: Pt[]): boolean {
  if (!poly || poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const inter =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (inter) inside = !inside;
  }
  return inside;
}

export function planBouncePath(
  start: { x: number; y: number },
  target: { x: number; y: number },
  rng: Rng = Math.random,
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

  const sx = clampStart.x - lo;
  const sy = clampStart.y - lo;
  const tx0 = clampTarget.x - lo;
  const ty0 = clampTarget.y - lo;

  type Cand = { nx: number; ny: number; dist: number; bounces: number };
  const cands: Cand[] = [];

  for (let nx = -12; nx <= 12; nx++) {
    for (let ny = -12; ny <= 12; ny++) {
      if (nx === 0 && ny === 0) continue;
      const rx = nx % 2 === 0 ? tx0 : pw - tx0;
      const ry = ny % 2 === 0 ? ty0 : ph - ty0;
      const gx = nx * pw + rx;
      const gy = ny * ph + ry;
      const dist = Math.hypot(gx - sx, gy - sy);
      const bounces = Math.abs(nx) + Math.abs(ny);
      if (bounces < 6 || bounces > 16) continue;
      if (dist < 500 || dist > 3200) continue;
      cands.push({ nx, ny, dist, bounces });
    }
  }

  if (cands.length === 0) {
    for (let nx = -8; nx <= 8; nx++) {
      for (let ny = -8; ny <= 8; ny++) {
        if (nx === 0 && ny === 0) continue;
        const rx = nx % 2 === 0 ? tx0 : pw - tx0;
        const ry = ny % 2 === 0 ? ty0 : ph - ty0;
        const gx = nx * pw + rx;
        const gy = ny * ph + ry;
        const dist = Math.hypot(gx - sx, gy - sy);
        const bounces = Math.abs(nx) + Math.abs(ny);
        if (bounces < 2) continue;
        cands.push({ nx, ny, dist, bounces });
      }
    }
  }

  cands.sort((a, b) => b.bounces - a.bounces || b.dist - a.dist);
  const top = cands.slice(0, Math.max(6, Math.floor(cands.length * 0.35)));
  const pick = top[Math.floor(rng() * top.length)] ?? { nx: 3, ny: 4, dist: 1200, bounces: 7 };

  const rx = pick.nx % 2 === 0 ? tx0 : pw - tx0;
  const ry = pick.ny % 2 === 0 ? ty0 : ph - ty0;
  const gx = pick.nx * pw + rx;
  const gy = pick.ny * ph + ry;

  const samples = Math.max(120, Math.floor(pick.dist / 3));
  const pts: PathPoint[] = [];

  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    let ux = sx + (gx - sx) * u;
    let uy = sy + (gy - sy) * u;

    let cellX = Math.floor(ux / pw);
    let cellY = Math.floor(uy / ph);
    let lx = ux - cellX * pw;
    let ly = uy - cellY * ph;
    if (lx < 0) { lx += pw; cellX -= 1; }
    if (ly < 0) { ly += ph; cellY -= 1; }
    if (cellX % 2 !== 0) lx = pw - lx;
    if (cellY % 2 !== 0) ly = ph - ly;

    pts.push({ x: lo + lx, y: lo + ly, t: u });
  }

  if (pts.length) {
    pts[pts.length - 1] = { x: clampTarget.x, y: clampTarget.y, t: 1 };
  }
  return pts;
}

/**
 * Sample a point INSIDE the winner territory polygon.
 * Old code used only x0..x1 + full height → often landed on another player's zone.
 */
export function randomInStrip(strip: StripLike, rng: Rng = Math.random): { x: number; y: number } {
  const lo = MARGIN + BALL_R;
  const hiX = W - MARGIN - BALL_R;
  const hiY = H - MARGIN - BALL_R;

  if (strip.poly && strip.poly.length >= 3) {
    const xs = strip.poly.map((p) => p.x);
    const ys = strip.poly.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);

    for (let tries = 0; tries < 60; tries++) {
      let x: number;
      let y: number;
      // Prefer near centroid so the puck clearly sits in the zone
      if (rng() < 0.55 && strip.cx != null && strip.cy != null) {
        x = strip.cx + (rng() - 0.5) * bw * 0.45;
        y = strip.cy + (rng() - 0.5) * bh * 0.45;
      } else {
        x = minX + rng() * bw;
        y = minY + rng() * bh;
      }
      const p = clampBall(x, y);
      if (pointInPoly(p, strip.poly)) return p;
    }
    if (strip.cx != null && strip.cy != null) {
      return clampBall(strip.cx, strip.cy);
    }
  }

  // Rect fallback (legacy)
  const pad = BALL_R + 4;
  const w = Math.max(2, strip.x1 - strip.x0);
  const innerW = Math.max(1, w - pad * 2);
  const x = strip.x0 + pad + rng() * innerW;
  const y = lo + rng() * (hiY - lo);
  return clampBall(x, y);
}

export function randomStart(rng: Rng = Math.random): { x: number; y: number } {
  const lo = MARGIN + BALL_R;
  const hiX = W - MARGIN - BALL_R;
  const hiY = H - MARGIN - BALL_R;
  return {
    x: lo + rng() * (hiX - lo),
    y: lo + rng() * (hiY - lo),
  };
}

export function samplePath(path: PathPoint[], t: number): { x: number; y: number } {
  if (!path.length) return { x: W / 2, y: H / 2 };
  if (t <= 0) return { x: path[0].x, y: path[0].y };
  if (t >= 1) {
    const last = path[path.length - 1];
    return { x: last.x, y: last.y };
  }
  let i = 0;
  while (i < path.length - 1 && path[i + 1].t < t) i++;
  const a = path[i];
  const b = path[Math.min(i + 1, path.length - 1)];
  const span = Math.max(1e-6, b.t - a.t);
  const k = (t - a.t) / span;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

export function pathDirection(path: PathPoint[]): number {
  if (path.length < 2) return 0;
  const a = path[0];
  const b = path[Math.min(8, path.length - 1)];
  return Math.atan2(b.y - a.y, b.x - a.x);
}
