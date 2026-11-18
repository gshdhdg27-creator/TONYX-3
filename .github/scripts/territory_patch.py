from pathlib import Path

p = Path("artifacts/mini-app/src/components/ArenaGame.tsx")
t = p.read_text()

old = '''  if (n === 2) {
    const [a, b] = list;
    const sa = a.stake / total;
    const sb = b.stake / total;
    const seed = hash01(a.telegramId + "|" + b.telegramId);
    const tilt = 0.15 + seed * 0.25;
    let cutTop = Math.min(0.92, Math.max(0.08, sa + tilt * (sa > 0.5 ? -1 : 1)));
    let cutBot = Math.min(0.92, Math.max(0.08, 2 * sa - cutTop));
    if (cutBot < 0.05) { cutBot = 0.05; cutTop = Math.min(0.95, 2 * sa - cutBot); }
    if (cutBot > 0.95) { cutBot = 0.95; cutTop = Math.max(0.05, 2 * sa - cutBot); }
    const polyA: Pt[] = [
      { x: 0, y: 0 }, { x: cutTop * W, y: 0 }, { x: cutBot * W, y: H }, { x: 0, y: H },
    ];
    const polyB: Pt[] = [
      { x: cutTop * W, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: cutBot * W, y: H },
    ];
    return [mk(a, 0, sa, polyA, "wedge"), mk(b, 1, sb, polyB, "wedge")];
  }'''

new = '''  if (n === 2) {
    const [a, b] = list;
    const sa = a.stake / total;
    const sb = b.stake / total;
    // Area of left wedge ≈ (cutTop+cutBot)/2 — keep equal to share.
    // Small diagonal tilt only; never inflate tiny stakes (was min 8%).
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

if old not in t:
    if "maxTilt = Math.min(sa, sb)" in t:
        print("already patched")
    else:
        raise SystemExit("2-player block not found")
else:
    t = t.replace(old, new, 1)
    print("2-player ok")

p.write_text(t)
print("OK", p.stat().st_size)
assert "maxTilt = Math.min(sa, sb)" in p.read_text()
print("assert ok")
