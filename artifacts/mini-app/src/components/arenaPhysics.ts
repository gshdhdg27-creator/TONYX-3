/** Arena billiard path planning — no mid-air homing */

export const W = 352;
export const H = 352;
export const BALL_R = 12;
export const MARGIN = 6;

export type PathPoint = { x: number; y: number; t: number };

export type StripLike = {
  x0: number;
  x1: number;
};

/**
 * Billiard path via method of images.
 * Straight line in unfolded table → fold into wall reflections.
 * Ends exactly at target; no mid-air steering.
 */
export function planBouncePath(
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

  const sx = clampStart.x - lo;
  const sy = clampStart.y - lo;
  const tx0 = clampTarget.x - lo;
  const ty0 = clampTarget.y - lo;

  type Cand = { nx: number; ny: number; dist: number; bounces: number };
  const cands: Cand[] = [];

  for (let nx = -6; nx <= 6; nx++) {
    for (let ny = -6; ny <= 6; ny++) {
      if (nx === 0 && ny === 0) continue;
      const rx = nx % 2 === 0 ? tx0 : pw - tx0;
      const ry = ny % 2 === 0 ? ty0 : ph - ty0;
      const gx = nx * pw + rx;
      const gy = ny * ph + ry;
      const dist = Math.hypot(gx - sx, gy - sy);
      const bounces = Math.abs(nx) + Math.abs(ny);
      if (bounces < 2 || bounces > 9) continue;
      if (dist < 180 || dist > 1400) continue;
      cands.push({ nx, ny, dist, bounces });
    }
  }

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
    const score = (c: Cand) =>
      Math.abs(c.bounces - 5) * 80 + Math.abs(c.dist - 520);
    return score(a) - score(b);
  });

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
    let ux = sx + (gx - sx) * u;
    let uy = sy + (gy - sy) * u;

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
    const t = 1 - Math.pow(1 - u, 1.35);
    pts.push({ x, y, t });
  }

  if (pts.length) {
    pts[pts.length - 1] = { x: clampTarget.x, y: clampTarget.y, t: 1 };
  }
  return pts;
}

export function randomInStrip(strip: StripLike): { x: number; y: number } {
  const pad = BALL_R + 4;
  const w = Math.max(2, strip.x1 - strip.x0);
  const innerW = Math.max(1, w - pad * 2);
  const x = strip.x0 + pad + Math.random() * innerW;
  const lo = MARGIN + BALL_R;
  const hiX = W - MARGIN - BALL_R;
  const cx = Math.min(hiX, Math.max(lo, x));
  const y = MARGIN + BALL_R + Math.random() * (H - 2 * (MARGIN + BALL_R));
  return { x: cx, y };
}

export function randomStart(): { x: number; y: number } {
  const lo = MARGIN + BALL_R;
  const hiX = W - MARGIN - BALL_R;
  const hiY = H - MARGIN - BALL_R;
  return {
    x: lo + Math.random() * (hiX - lo),
    y: lo + Math.random() * (hiY - lo),
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
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
  };
}

export function pathDirection(path: PathPoint[]): number {
  if (path.length < 2) return 0;
  const a = path[0];
  const b = path[Math.min(6, path.length - 1)];
  return Math.atan2(b.y - a.y, b.x - a.x);
}
