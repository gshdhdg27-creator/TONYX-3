from pathlib import Path

p = Path("artifacts/mini-app/src/components/ArenaGame.tsx")
t = p.read_text()
if "function boundaryXs" in t and "clipPath" in t:
    print("already done")
    raise SystemExit(0)

old_type = "type Strip = ArenaPlayer & { color: string; index: number; share: number; x0: number; x1: number; midX: number };"
new_type = """type Pt = { x: number; y: number };
type Strip = ArenaPlayer & {
  color: string; index: number; share: number; x0: number; x1: number; midX: number;
  poly: Pt[];
  cx: number; cy: number;
};"""
if old_type not in t:
    raise SystemExit("type miss")
t = t.replace(old_type, new_type)

old_build = """function buildStrips(players: ArenaPlayer[]): Strip[] {
  const list = [...players].filter((p) => p && p.stake > 0);
  const total = list.reduce((s, p) => s + p.stake, 0) || 1;
  let acc = 0;
  return list.map((p, i) => {
    const share = p.stake / total;
    const x0 = Math.round(acc * W * 1000) / 1000;
    acc += share;
    const x1 = i === list.length - 1 ? W : Math.round(acc * W * 1000) / 1000;
    return { ...p, color: colorFor(i), index: i, share, x0, x1, midX: (x0 + x1) / 2 };
  });
}"""

new_build = """function hash01(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
function boundaryXs(baseX: number, seed: number, amp: number, steps = 18): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = (i / steps) * H;
    const ny = i / steps;
    const w =
      Math.sin((ny * 2.15 + seed * 6.28) * Math.PI * 2) * amp +
      Math.sin((ny * 5.4 + seed * 11.0) * Math.PI * 2) * amp * 0.42 +
      Math.sin((ny * 9.2 + seed * 3.1) * Math.PI * 2) * amp * 0.18;
    pts.push({ x: Math.min(W - 0.5, Math.max(0.5, baseX + w)), y });
  }
  return pts;
}
function buildStrips(players: ArenaPlayer[]): Strip[] {
  const list = [...players].filter((p) => p && p.stake > 0);
  const total = list.reduce((s, p) => s + p.stake, 0) || 1;
  const n = list.length;
  const cuts: number[] = [0];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += list[i].stake / total;
    cuts.push(i === n - 1 ? 1 : acc);
  }
  const bounds: Pt[][] = [];
  for (let i = 0; i <= n; i++) {
    const baseX = cuts[i] * W;
    if (i === 0) {
      bounds.push(Array.from({ length: 19 }, (_, k) => ({ x: 0, y: (k / 18) * H })));
    } else if (i === n) {
      bounds.push(Array.from({ length: 19 }, (_, k) => ({ x: W, y: (k / 18) * H })));
    } else {
      const seed = hash01(list[i - 1].telegramId + ":" + list[i].telegramId + ":" + i);
      const shareL = cuts[i] - cuts[i - 1];
      const shareR = cuts[i + 1] - cuts[i];
      const amp = Math.min(28, Math.max(8, Math.min(shareL, shareR) * W * 0.35));
      bounds.push(boundaryXs(baseX, seed, amp));
    }
  }
  return list.map((p, i) => {
    const share = p.stake / total;
    const left = bounds[i];
    const right = bounds[i + 1];
    const poly: Pt[] = [...left, ...[...right].reverse()];
    let sx = 0, sy = 0;
    for (const q of poly) { sx += q.x; sy += q.y; }
    const cx = sx / poly.length;
    const cy = sy / poly.length;
    const xs = poly.map((q) => q.x);
    const x0 = Math.min(*xs) if False else min(xs);
    const x1 = Math.max(*xs) if False else max(xs);
    return { ...p, color: colorFor(i), index: i, share, x0, x1, midX: (x0 + x1) / 2, poly, cx, cy };
  });
}"""

# Fix JS min/max in new_build - the above had python mistake. Rewrite clean:
new_build = """function hash01(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
function boundaryXs(baseX: number, seed: number, amp: number, steps = 18): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = (i / steps) * H;
    const ny = i / steps;
    const w =
      Math.sin((ny * 2.15 + seed * 6.28) * Math.PI * 2) * amp +
      Math.sin((ny * 5.4 + seed * 11.0) * Math.PI * 2) * amp * 0.42 +
      Math.sin((ny * 9.2 + seed * 3.1) * Math.PI * 2) * amp * 0.18;
    pts.push({ x: Math.min(W - 0.5, Math.max(0.5, baseX + w)), y });
  }
  return pts;
}
function buildStrips(players: ArenaPlayer[]): Strip[] {
  const list = [...players].filter((p) => p && p.stake > 0);
  const total = list.reduce((s, p) => s + p.stake, 0) || 1;
  const n = list.length;
  const cuts: number[] = [0];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += list[i].stake / total;
    cuts.push(i === n - 1 ? 1 : acc);
  }
  const bounds: Pt[][] = [];
  for (let i = 0; i <= n; i++) {
    const baseX = cuts[i] * W;
    if (i === 0) {
      bounds.push(Array.from({ length: 19 }, (_, k) => ({ x: 0, y: (k / 18) * H })));
    } else if (i === n) {
      bounds.push(Array.from({ length: 19 }, (_, k) => ({ x: W, y: (k / 18) * H })));
    } else {
      const seed = hash01(list[i - 1].telegramId + ":" + list[i].telegramId + ":" + i);
      const shareL = cuts[i] - cuts[i - 1];
      const shareR = cuts[i + 1] - cuts[i];
      const amp = Math.min(28, Math.max(8, Math.min(shareL, shareR) * W * 0.35));
      bounds.push(boundaryXs(baseX, seed, amp));
    }
  }
  return list.map((p, i) => {
    const share = p.stake / total;
    const left = bounds[i];
    const right = bounds[i + 1];
    const poly: Pt[] = [...left, ...[...right].reverse()];
    let sx = 0, sy = 0;
    for (const q of poly) { sx += q.x; sy += q.y; }
    const cx = sx / poly.length;
    const cy = sy / poly.length;
    const xs = poly.map((q) => q.x);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    return { ...p, color: colorFor(i), index: i, share, x0, x1, midX: (x0 + x1) / 2, poly, cx, cy };
  });
}"""

if old_build not in t:
    raise SystemExit("build miss")
t = t.replace(old_build, new_build)

old_map = """          ) : strips.map((s) => {
            const width = Math.max(2, s.x1 - s.x0);
            const av = Math.min(48, Math.max(22, width - 8));
            return (
              <div key={s.telegramId} style={{
                position: "absolute", left: s.x0, top: 0, width, height: "100%",
                background: s.color, borderRight: "1px solid rgba(0,0,0,0.25)",
                display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12,
                boxSizing: "border-box", overflow: "hidden", zIndex: 1,
                transition: phase === "lobby" ? "left .3s ease, width .3s ease" : "none",
              }}>"""

new_map = """          ) : strips.map((s) => {
            const width = Math.max(2, s.x1 - s.x0);
            const av = Math.min(48, Math.max(22, width - 8));
            const clip = (s.poly && s.poly.length)
              ? `polygon(${s.poly.map((q) => `${(q.x / W) * 100}% ${(q.y / H) * 100}%`).join(", ")})`
              : undefined;
            return (
              <div key={s.telegramId} style={{
                position: "absolute", left: 0, top: 0, width: W, height: H,
                background: s.color,
                clipPath: clip,
                WebkitClipPath: clip,
                display: "flex", flexDirection: "column", alignItems: "center",
                paddingTop: Math.max(12, Math.min(H - 80, (s.cy || H * 0.28) - av / 2)),
                boxSizing: "border-box", overflow: "hidden", zIndex: 1,
                transition: phase === "lobby" ? "clip-path .45s ease" : "none",
              }}>"""

if old_map not in t:
    raise SystemExit("map miss")
t = t.replace(old_map, new_map)

p.write_text(t)
print("ok", "boundaryXs" in t, "clipPath" in t)
