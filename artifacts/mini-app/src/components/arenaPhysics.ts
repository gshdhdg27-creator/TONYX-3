/** Arena billiard path — Portals-style: only the center POINT bounces; ring may cross walls */

export const W = 352;
export const H = 352;
/** Visual ring radius (drawn in ArenaGame) */
export const BALL_R = 13;
/**
 * Collision marker — small point inside the puck.
 * Only THIS point bounces off walls / can enter corners.
 * Ring (BALL_R) is free to overhang the wall.
 */
export const POINT_R = 1.5;
/** Playfield inset for the point (not the ring) */
export const MARGIN = 1;

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

/** Clamp the collision POINT (not the visual ring) */
function clampPoint(x: number, y: number): Pt {
  const lo = MARGIN + POINT_R;
  const hiX = W - MARGIN - POINT_R;
  const hiY = H - MARGIN - POINT_R;
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
  // Unfolded-table billiards on the POINT bounds (ring may hang past walls)
  const lo = MARGIN + POINT_R;
  const hiX = W - MARGIN - POINT_R;
  const hiY = H - MARGIN - POINT_R;
  const pw = hiX - lo;
  const ph = hiY - lo;

  const clampStart = clampPoint(start.x, start.y);
  const clampTarget = clampPoint(target.x, target.y);

  const sx = clampStart.x - lo;
  const sy = clampStart.y - lo;
  const tx0 = clampTarget.x - lo;
  const ty0 = clampTarget.y - lo;

  type Cand = { nx: number; ny: number; dist: number; bounces: number };
  const cands: Cand[] = [];

  // Prefer long multi-bounce paths so the puck travels a lot before stopping
  for (let nx = -18; nx <= 18; nx++) {
    for (let ny = -18; ny <= 18; ny++) {
      if (nx === 0 && ny === 0) continue;
      const rx = nx % 2 === 0 ? tx0 : pw - tx0;
      const ry = ny % 2 === 0 ? ty0 : ph - ty0;
      const gx = nx * pw + rx;
      const gy = ny * ph + ry;
      const dist = Math.hypot(gx - sx, gy - sy);
      const bounces = Math.abs(nx) + Math.abs(ny);
      if (bounces < 10 || bounces > 28) continue;
      if (dist < 900 || dist > 5600) continue;
      cands.push({ nx, ny, dist, bounces });
    }
  }

  if (cands.length === 0) {
    for (let nx = -12; nx <= 12; nx++) {
      for (let ny = -12; ny <= 12; ny++) {
        if (nx === 0 && ny === 0) continue;
        const rx = nx % 2 === 0 ? tx0 : pw - tx0;
        const ry = ny % 2 === 0 ? ty0 : ph - ty0;
        const gx = nx * pw + rx;
        const gy = ny * ph + ry;
        const dist = Math.hypot(gx - sx, gy - sy);
        const bounces = Math.abs(nx) + Math.abs(ny);
        if (bounces < 4) continue;
        cands.push({ nx, ny, dist, bounces });
      }
    }
  }

  cands.sort((a, b) => b.bounces - a.bounces || b.dist - a.dist);
  const top = cands.slice(0, Math.max(10, Math.floor(cands.length * 0.4)));
  const pick = top[Math.floor(rng() * top.length)] ?? { nx: 5, ny: 6, dist: 2200, bounces: 11 };

  const rx = pick.nx % 2 === 0 ? tx0 : pw - tx0;
  const ry = pick.ny % 2 === 0 ? ty0 : ph - ty0;
  const gx = pick.nx * pw + rx;
  const gy = pick.ny * ph + ry;

  const samples = Math.max(200, Math.floor(pick.dist / 2.2));
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
 * Uses soft clamp so tiny corner zones (0.01%) are reachable by the POINT.
 */
export function randomInStrip(strip: StripLike, rng: Rng = Math.random): { x: number; y: number } {
  const softClamp = (x: number, y: number): Pt => clampPoint(x, y);

  if (strip.poly && strip.poly.length >= 3) {
    const xs = strip.poly.map((p) => p.x);
    const ys = strip.poly.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const area = bw * bh;

    // Tiny territory: land on centroid — point can sit in the corner
    if (area < 900 || (strip.cx != null && strip.cy != null && bw < 28 && bh < 28)) {
      if (strip.cx != null && strip.cy != null) {
        return softClamp(strip.cx, strip.cy);
      }
    }

    for (let tries = 0; tries < 80; tries++) {
      let x: number;
      let y: number;
      if (rng() < 0.7 && strip.cx != null && strip.cy != null) {
        x = strip.cx + (rng() - 0.5) * bw * 0.35;
        y = strip.cy + (rng() - 0.5) * bh * 0.35;
      } else {
        x = minX + rng() * bw;
        y = minY + rng() * bh;
      }
      const p = softClamp(x, y);
      if (pointInPoly(p, strip.poly)) return p;
    }
    if (strip.cx != null && strip.cy != null) {
      return softClamp(strip.cx, strip.cy);
    }
  }

  const lo = MARGIN + POINT_R;
  const hiY = H - MARGIN - POINT_R;
  const pad = 2;
  const w = Math.max(2, strip.x1 - strip.x0);
  const innerW = Math.max(1, w - pad * 2);
  const x = strip.x0 + pad + rng() * innerW;
  const y = lo + rng() * Math.max(1, hiY - lo);
  return softClamp(x, y);
}

export function randomStart(rng: Rng = Math.random): { x: number; y: number } {
  const lo = MARGIN + POINT_R;
  const hiX = W - MARGIN - POINT_R;
  const hiY = H - MARGIN - POINT_R;
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
