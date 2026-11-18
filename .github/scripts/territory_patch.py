from pathlib import Path
import re

p = Path("artifacts/mini-app/src/components/ArenaGame.tsx")
t = p.read_text()
if "maxTilt = Math.min(sa, sb)" in t:
    print("already patched")
else:
    pat = r'  if \(n === 2\) \{[\s\S]*?return \[mk\(a, 0, sa, polyA, "wedge"\), mk\(b, 1, sb, polyB, "wedge"\)\];\n  \}'
    new = '''  if (n === 2) {
    const [a, b] = list;
    const sa = a.stake / total;
    const sb = b.stake / total;
    // Area ≈ (cutTop+cutBot)/2 must equal share — no min 8% inflation
    const seed = hash01(a.telegramId + "|" + b.telegramId);
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
    t2, n = re.subn(pat, new, t, count=1)
    if n != 1:
        raise SystemExit(f"replace failed n={n}")
    t = t2
    print("patched")
p.write_text(t)
print("OK", p.stat().st_size)
assert "maxTilt = Math.min(sa, sb)" in p.read_text()
print("assert ok")
