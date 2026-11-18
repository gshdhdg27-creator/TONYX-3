from pathlib import Path
import re

p = Path("artifacts/mini-app/src/components/ArenaGame.tsx")
t = p.read_text()
if "CORNER_MAX3" in t:
    print("already patched")
else:
    new_3plus = r"""
  // 3+ : small players → different corners; one big leader keeps the center
  {
    const CORNER_MAX3 = 0.22;
    const withShare = list.map((p, i) => ({ p, i, share: p.stake / total }));
    const smalls = withShare.filter((x) => x.share < CORNER_MAX3).sort((a, b) => a.share - b.share);
    const larges = withShare.filter((x) => x.share >= CORNER_MAX3).sort((a, b) => b.share - a.share);

    // One dominant + 1..4 small → put each small in its own corner
    if (larges.length === 1 && smalls.length >= 1 && smalls.length <= 4) {
      const seed0 = hash01(list.map((p) => p.telegramId).join("|"));
      const startCorner = Math.floor(seed0 * 4);
      // prefer opposite corners first so smalls are spread: 0,2,1,3
      const order = [0, 2, 1, 3];
      const used: Record<number, number> = {};
      const strips: Strip[] = new Array(n);

      smalls.forEach((s, k) => {
        const corner = (startCorner + order[k]) % 4;
        const f = Math.min(0.48, Math.max(0.06, Math.sqrt(2 * s.share)));
        used[corner] = f;
        let polyS: Pt[];
        if (corner === 0) {
          polyS = [{ x: 0, y: 0 }, { x: f * W, y: 0 }, { x: 0, y: f * H }];
        } else if (corner === 1) {
          polyS = [{ x: W, y: 0 }, { x: W, y: f * H }, { x: (1 - f) * W, y: 0 }];
        } else if (corner === 2) {
          polyS = [{ x: W, y: H }, { x: (1 - f) * W, y: H }, { x: W, y: (1 - f) * H }];
        } else {
          polyS = [{ x: 0, y: H }, { x: 0, y: (1 - f) * H }, { x: f * W, y: H }];
        }
        strips[s.i] = mk(s.p, s.i, s.share, polyS, "corner");
      });

      const mainPts: Pt[] = [];
      if (used[0] != null) {
        mainPts.push({ x: 0, y: used[0] * H });
        mainPts.push({ x: used[0] * W, y: 0 });
      } else {
        mainPts.push({ x: 0, y: 0 });
      }
      if (used[1] != null) {
        mainPts.push({ x: (1 - used[1]) * W, y: 0 });
        mainPts.push({ x: W, y: used[1] * H });
      } else {
        mainPts.push({ x: W, y: 0 });
      }
      if (used[2] != null) {
        mainPts.push({ x: W, y: (1 - used[2]) * H });
        mainPts.push({ x: (1 - used[2]) * W, y: H });
      } else {
        mainPts.push({ x: W, y: H });
      }
      if (used[3] != null) {
        mainPts.push({ x: used[3] * W, y: H });
        mainPts.push({ x: 0, y: (1 - used[3]) * H });
      } else {
        mainPts.push({ x: 0, y: H });
      }

      const L = larges[0];
      strips[L.i] = mk(L.p, L.i, L.share, mainPts, "main");
      return strips;
    }
  }

  // Fallback: sequential diagonal wedges by cumulative share
  const cuts: number[] = [0];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += list[i].stake / total;
    cuts.push(i === n - 1 ? 1 : Math.min(0.999, acc));
  }
  const topX: number[] = [];
  const botX: number[] = [];
  for (let i = 0; i <= n; i++) {
    if (i === 0) { topX.push(0); botX.push(0); continue; }
    if (i === n) { topX.push(W); botX.push(W); continue; }
    const base = cuts[i];
    const seed = hash01(list[i - 1].telegramId + "|" + list[i].telegramId + "|" + i);
    const tilt = (seed - 0.5) * 0.12;
    const shareL = cuts[i] - cuts[i - 1];
    const shareR = cuts[i + 1] - cuts[i];
    const maxT = Math.min(shareL, shareR) * 0.45;
    const tt = Math.max(-maxT, Math.min(maxT, tilt));
    topX.push(Math.max(0, Math.min(W, (base + tt) * W)));
    botX.push(Math.max(0, Math.min(W, (base - tt) * W)));
  }
  return list.map((p, i) => {
    const share = p.stake / total;
    const poly: Pt[] = [
      { x: topX[i], y: 0 },
      { x: topX[i + 1], y: 0 },
      { x: botX[i + 1], y: H },
      { x: botX[i], y: H },
    ];
    return mk(p, i, share, poly, "wedge");
  });
"""
    pat = r'  // 3\+ : sequential diagonal wedges by cumulative share\n  const cuts: number\[\] = \[0\];[\s\S]*?return list\.map\(\(p, i\) => \{\n    const share = p\.stake / total;\n    const poly: Pt\[\] = \[\n      \{ x: topX\[i\], y: 0 \},\n      \{ x: topX\[i \+ 1\], y: 0 \},\n      \{ x: botX\[i \+ 1\], y: H \},\n      \{ x: botX\[i\], y: H \},\n    \];\n    return mk\(p, i, share, poly, "wedge"\);\n  \}\);'
    t2, nsub = re.subn(pat, new_3plus.lstrip("\n"), t, count=1)
    if nsub != 1:
        raise SystemExit(f"replace failed n={nsub}")
    t = t2
    print("patched")
p.write_text(t)
print("OK", p.stat().st_size)
assert "CORNER_MAX3" in p.read_text()
print("assert ok")
