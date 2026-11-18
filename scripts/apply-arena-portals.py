from pathlib import Path
p = Path("artifacts/mini-app/src/components/ArenaGame.tsx")
t = p.read_text()
start = t.find("type Pt = { x: number; y: number };")
if start < 0:
    start = t.find("type Strip = ArenaPlayer")
end = t.find("function loadChips")
if start < 0 or end < 0 or end <= start:
    raise SystemExit(f"markers miss {start} {end}")
new_block = r"""type Pt = { x: number; y: number };
type Strip = ArenaPlayer & {
  color: string; index: number; share: number; x0: number; x1: number; midX: number;
  poly: Pt[];
  cx: number; cy: number;
};

function hash01(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

/**
 * Portals-style territories: soft organic blobs, area ≈ stake share.
 * Weighted Voronoi (distance / sqrt(share)) + radial boundary sampling.
 */
function buildStrips(players: ArenaPlayer[]): Strip[] {
  const list = [...players].filter((p) => p && p.stake > 0);
  const total = list.reduce((s, p) => s + p.stake, 0) || 1;
  const n = list.length;
  if (n === 0) return [];

  if (n === 1) {
    const p0 = list[0];
    return [{
      ...p0, color: colorFor(0), index: 0, share: 1,
      x0: 0, x1: W, midX: W / 2,
      poly: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }],
      cx: W / 2, cy: H / 2,
    }];
  }

  type Site = { x: number; y: number; w: number; idx: number };
  const sites: Site[] = list.map((p, i) => {
    const share = p.stake / total;
    const seed = hash01(p.telegramId + ":site");
    const seed2 = hash01(p.telegramId + ":ang");
    const ang = (i / n) * Math.PI * 2 + seed2 * 0.8;
    const rad = 0.12 + seed * 0.28;
    return {
      x: W * (0.5 + Math.cos(ang) * rad),
      y: H * (0.5 + Math.sin(ang) * rad),
      w: Math.max(0.04, share),
      idx: i,
    };
  });

  function ownerAt(x: number, y: number): number {
    let best = 0;
    let bestD = Infinity;
    for (let j = 0; j < sites.length; j++) {
      const s = sites[j];
      const d = Math.hypot(x - s.x, y - s.y) / Math.sqrt(s.w);
      if (d < bestD) { bestD = d; best = j; }
    }
    return best;
  }

  function blobPoly(si: number, steps = 56): Pt[] {
    const s = sites[si];
    const pts: Pt[] = [];
    const maxR = Math.hypot(W, H);
    for (let a = 0; a < steps; a++) {
      const ang = (a / steps) * Math.PI * 2;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      let lo = 0;
      let hi = maxR;
      for (let it = 0; it < 20; it++) {
        const mid = (lo + hi) / 2;
        const x = s.x + cos * mid;
        const y = s.y + sin * mid;
        if (x < 1 || y < 1 || x > W - 1 || y > H - 1) {
          hi = mid;
          continue;
        }
        if (ownerAt(x, y) === si) lo = mid;
        else hi = mid;
      }
      let x = s.x + cos * lo;
      let y = s.y + sin * lo;
      if (x < 3) x = 0;
      if (y < 3) y = 0;
      if (x > W - 3) x = W;
      if (y > H - 3) y = H;
      pts.push({ x, y });
    }
    return pts;
  }

  return list.map((p, i) => {
    const share = p.stake / total;
    const poly = blobPoly(i);
    let sx = 0, sy = 0;
    for (const q of poly) { sx += q.x; sy += q.y; }
    const cx = poly.length ? sx / poly.length : sites[i].x;
    const cy = poly.length ? sy / poly.length : sites[i].y;
    const xs = poly.map((q) => q.x);
    const x0 = xs.length ? Math.min(...xs) : 0;
    const x1 = xs.length ? Math.max(...xs) : W;
    return {
      ...p, color: colorFor(i), index: i, share,
      x0, x1, midX: (x0 + x1) / 2, poly, cx, cy,
    };
  });
}

"""
t = t[:start] + new_block + t[end:]
p.write_text(t)
print("ok portals blobs", "ownerAt" in t)
print("size", len(t))
