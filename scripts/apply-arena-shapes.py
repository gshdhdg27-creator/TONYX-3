from pathlib import Path
p = Path("artifacts/mini-app/src/components/ArenaGame.tsx")
t = p.read_text()

start = t.find("type Pt = { x: number; y: number };")
if start < 0:
    start = t.find("type Strip = ArenaPlayer & { color: string; index: number; share: number; x0: number; x1: number; midX: number };")
end = t.find("function loadChips")
if start < 0 or end < 0 or end <= start:
    raise SystemExit(f"markers miss start={start} end={end}")

new_block = r"""type Pt = { x: number; y: number };
type Strip = ArenaPlayer & {
  color: string; index: number; share: number; x0: number; x1: number; midX: number;
  poly: Pt[];
  cx: number; cy: number;
  shape: string;
};

function hash01(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

/**
 * Geometric territories: triangle / rect / trapezoid / diamond / pentagon / chevron.
 * Area ≈ stake share. Straight edges. Stake up → shape grows.
 */
function buildStrips(players: ArenaPlayer[]): Strip[] {
  const list = [...players].filter((p) => p && p.stake > 0);
  const total = list.reduce((s, p) => s + p.stake, 0) || 1;
  const n = list.length;
  if (n === 0) return [];

  const cuts: number[] = [0];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += list[i].stake / total;
    cuts.push(i === n - 1 ? 1 : Math.min(0.999, acc));
  }

  const KINDS = ["rect", "triangle", "trapezoid", "diamond", "pentagon", "chevron"] as const;

  type Bnd = Pt[];
  const bounds: Bnd[] = [];
  for (let i = 0; i <= n; i++) {
    const bx = cuts[i] * W;
    if (i === 0) {
      bounds.push([{ x: 0, y: 0 }, { x: 0, y: H }]);
      continue;
    }
    if (i === n) {
      bounds.push([{ x: W, y: 0 }, { x: W, y: H }]);
      continue;
    }
    const seed = hash01(list[i - 1].telegramId + "|" + list[i].telegramId + "|" + i);
    const kind = Math.floor(seed * 5);
    const maxJ = Math.min(cuts[i] - cuts[i - 1], cuts[i + 1] - cuts[i]) * W * 0.45;
    const j = Math.max(6, maxJ);

    let pts: Pt[];
    if (kind === 0) {
      pts = [{ x: bx, y: 0 }, { x: bx, y: H }];
    } else if (kind === 1) {
      pts = [{ x: Math.min(W, Math.max(0, bx - j)), y: 0 }, { x: Math.min(W, Math.max(0, bx + j)), y: H }];
    } else if (kind === 2) {
      pts = [{ x: Math.min(W, Math.max(0, bx + j)), y: 0 }, { x: Math.min(W, Math.max(0, bx - j)), y: H }];
    } else if (kind === 3) {
      const mid = H * (0.35 + seed * 0.3);
      pts = [
        { x: bx, y: 0 },
        { x: Math.min(W, Math.max(0, bx + j)), y: mid },
        { x: bx, y: H },
      ];
    } else {
      const mid = H * 0.5;
      pts = [
        { x: bx, y: 0 },
        { x: bx, y: mid },
        { x: Math.min(W, Math.max(0, bx + (seed > 0.5 ? j : -j))), y: mid },
        { x: Math.min(W, Math.max(0, bx + (seed > 0.5 ? j : -j))), y: H },
      ];
    }
    bounds.push(pts);
  }

  if (n === 2) {
    const a = cuts[1] * W;
    const seed = hash01(list[0].telegramId + list[1].telegramId);
    if (seed < 0.34) {
      bounds[1] = [{ x: a, y: 0 }, { x: Math.min(W, Math.max(0, W - a)), y: H }];
    } else if (seed < 0.67) {
      bounds[1] = [
        { x: a * 0.7, y: 0 },
        { x: a, y: H * 0.5 },
        { x: a * 0.7, y: H },
      ];
    } else {
      bounds[1] = [
        { x: a, y: 0 },
        { x: a, y: H * 0.4 },
        { x: Math.min(W, a + (W - a) * 0.25), y: H * 0.4 },
        { x: Math.min(W, a + (W - a) * 0.25), y: H },
      ];
    }
  }

  if (n === 1) {
    return [{
      ...list[0], color: colorFor(0), index: 0, share: 1,
      x0: 0, x1: W, midX: W / 2,
      poly: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }],
      cx: W / 2, cy: H / 2, shape: "rect",
    }];
  }

  return list.map((p, i) => {
    const share = p.stake / total;
    const left = bounds[i];
    const right = bounds[i + 1];
    const poly: Pt[] = [...left, ...[...right].reverse()];
    let sx = 0, sy = 0;
    for (const q of poly) { sx += q.x; sy += q.y; }
    const cx = sx / Math.max(1, poly.length);
    const cy = sy / Math.max(1, poly.length);
    const xs = poly.map((q) => q.x);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const shape = KINDS[i % KINDS.length];
    return {
      ...p, color: colorFor(i), index: i, share,
      x0, x1, midX: (x0 + x1) / 2, poly, cx, cy, shape,
    };
  });
}

"""

t = t[:start] + new_block + t[end:]
p.write_text(t)
print("ok", "trapezoid" in t, "triangle" in t)
print("size", len(t))
