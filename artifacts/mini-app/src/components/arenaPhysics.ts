/** Arena path — Portals-style: bounce via center, never scrape walls */

export const W = 352;
export const H = 352;
export const BALL_R = 12;
export const MARGIN = 14;

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

/**
 * Portals-style path: ball never rides the walls.
 * Waypoints bounce around the CENTER of the board, then settle on target.
 */
export function planBouncePath(
  start: { x: number; y: number },
  target: { x: number; y: number },
  rng: Rng = Math.random,
): PathPoint[] {
  const cx = W / 2;
  const cy = H / 2;
  const lo = MARGIN + BALL_R;
  const hiX = W - MARGIN - BALL_R;
  const hiY = H - MARGIN - BALL_R;
  // keep well inside — never touch walls
  const inset = 36;
  const ix0 = lo + inset;
  const iy0 = lo + inset;
  const ix1 = hiX - inset;
  const iy1 = hiY - inset;

  const clampStart = clampBall(start.x, start.y);
  const clampTarget = clampBall(target.x, target.y);

  // number of center bounces (long interesting path)
  const hops = 6 + Math.floor(rng() * 7); // 6..12
  const waypoints: Pt[] = [clampStart];

  for (let i = 0; i < hops; i++) {
    // orbit around center with varying radius — "point in the middle bounces"
    const ang = rng() * Math.PI * 2;
    const rad = 28 + rng() * 90;
    let x = cx + Math.cos(ang) * rad;
    let y = cy + Math.sin(ang) * rad;
    // slight drift so path isn't a perfect circle
    x += (rng() - 0.5) * 40;
    y += (rng() - 0.5) * 40;
    x = Math.min(ix1, Math.max(ix0, x));
    y = Math.min(iy1, Math.max(iy0, y));
    waypoints.push({ x, y });
  }
  // last approach: pass near center then to target
  waypoints.push({
    x: cx + (rng() - 0.5) * 30,
    y: cy + (rng() - 0.5) * 30,
  });
  waypoints.push(clampTarget);

  // cumulative length for even t sampling
  const segLens: number[] = [0];
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const d = Math.hypot(
      waypoints[i].x - waypoints[i - 1].x,
      waypoints[i].y - waypoints[i - 1].y,
    );
    total += Math.max(1, d);
    segLens.push(total);
  }

  const samples = Math.max(220, Math.floor(total / 2.5));
  const pts: PathPoint[] = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const dist = u * total;
    let si = 0;
    while (si < segLens.length - 1 && segLens[si + 1] < dist) si++;
    const a = waypoints[si];
    const b = waypoints[Math.min(si + 1, waypoints.length - 1)];
    const span = Math.max(1e-6, segLens[Math.min(si + 1, segLens.length - 1)] - segLens[si]);
    const k = (dist - segLens[si]) / span;
    const x = a.x + (b.x - a.x) * k;
    const y = a.y + (b.y - a.y) * k;
    pts.push({ x, y, t: u });
  }
  if (pts.length) {
    pts[pts.length - 1] = { x: clampTarget.x, y: clampTarget.y, t: 1 };
  }
  return pts;
}

/**
 * Sample a point INSIDE the winner territory polygon.
 */
export function randomInStrip(strip: StripLike, rng: Rng = Math.random): { x: number; y: number } {
  if (strip.poly && strip.poly.length >= 3) {
    const xs = strip.poly.map((p) => p.x);
    const ys = strip.poly.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);

    for (let tries = 0; tries < 80; tries++) {
      let x: number;
      let y: number;
      if (rng() < 0.6 && strip.cx != null && strip.cy != null) {
        x = strip.cx + (rng() - 0.5) * bw * 0.4;
        y = strip.cy + (rng() - 0.5) * bh * 0.4;
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

  const lo = MARGIN + BALL_R;
  const hiY = H - MARGIN - BALL_R;
  const pad = BALL_R + 4;
  const w = Math.max(2, strip.x1 - strip.x0);
  const innerW = Math.max(1, w - pad * 2);
  const x = strip.x0 + pad + rng() * innerW;
  const y = lo + rng() * (hiY - lo);
  return clampBall(x, y);
}

export function randomStart(rng: Rng = Math.random): { x: number; y: number } {
  // start near center ring — Portals feel
  const cx = W / 2;
  const cy = H / 2;
  const ang = rng() * Math.PI * 2;
  const rad = 40 + rng() * 70;
  return clampBall(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
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
