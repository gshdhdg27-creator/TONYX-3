from pathlib import Path
import re

p = Path("artifacts/mini-app/src/components/ArenaGame.tsx")
t = p.read_text()
if "CORNER_MAX" in t:
    print("already patched")
else:
    pat = r'  if \(n === 2\) \{[\s\S]*?return \[mk\(a, 0, sa, polyA, "wedge"\), mk\(b, 1, sb, polyB, "wedge"\)\];\n  \}'
    new = '''  if (n === 2) {
    const [a, b] = list;
    const sa = a.stake / total;
    const sb = b.stake / total;
    const seed = hash01(a.telegramId + "|" + b.telegramId);

    // Small share → corner triangle (not a thin full-height strip)
    const CORNER_MAX = 0.22;
    const smallIsA = sa <= sb;
    const ss = Math.min(sa, sb);
    const ls = Math.max(sa, sb);

    if (ss < CORNER_MAX) {
      // isosceles right triangle: area = (f*W)*(f*H)/2 ⇒ share = f²/2 ⇒ f = √(2·share)
      const f = Math.min(0.95, Math.max(0.06, Math.sqrt(2 * ss)));
      const corner = Math.floor(seed * 4); // 0=TL 1=TR 2=BR 3=BL
      let polyS: Pt[];
      let polyL: Pt[];
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

    // Balanced 2-way: diagonal wedge, area ≈ share
    const maxTilt = Math.min(sa, sb) * 0.35;
    const tilt = (seed - 0.5) * 2 * maxTilt;
    const minCut = Math.max(2 / W, 0.004);
    const maxCut = 1 - minCut;
    let cutTop = Math.max(minCut, Math.min(maxCut, sa + tilt));
    let cutBot = Math.max(minCut, Math.min(maxCut, sa - tilt));
    const mean = (cutTop + cutBot) / 2;
    if (Math.abs(mean - sa) > 1e-6) {
      const d = sa - mean;
      cutTop = Math.max(minCut, Math.min(maxCut, cutTop + d));
      cutBot = Math.max(minCut, Math.min(maxCut, cutBot + d));
    }
    const polyA: Pt[] = [
      { x: 0, y: 0 }, { x: cutTop * W, y: 0 }, { x: cutBot * W, y: H }, { x: 0, y: H },
    ];
    const polyB: Pt[] = [
      { x: cutTop * W, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: cutBot * W, y: H },
    ];
    return [mk(a, 0, sa, polyA, "wedge"), mk(b, 1, sb, polyB, "wedge")];
  }'''
    t2, nsub = re.subn(pat, new, t, count=1)
    if nsub != 1:
        raise SystemExit(f"replace failed n={nsub}")
    t = t2
    print("patched")
p.write_text(t)
print("OK", p.stat().st_size)
assert "CORNER_MAX" in p.read_text()
print("assert ok")
