import { useEffect, useMemo, useRef, useState } from "react";

const SIZE = 300;
const COLORS = ["#5BE12C", "#FF4136", "#FF9F00", "#00C0FF", "#B044FF", "#FFEB3B", "#FF69B4"];
type Point = [number, number];
type Player = { id: string; name: string; stake: number; color: string; x: number; y: number };
type Cell = Player & { polygon: Point[]; points: string; area: number; share: number; cx: number; cy: number };

function area(poly: Point[]) {
  if (poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}
function clip(poly: Point[], a: number, b: number, c: number): Point[] {
  const out: Point[] = [];
  if (!poly.length) return out;
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i], prev = poly[(i + poly.length - 1) % poly.length];
    const ci = a * cur[0] + b * cur[1] <= c;
    const pi = a * prev[0] + b * prev[1] <= c;
    if (ci !== pi) {
      const dx = cur[0] - prev[0], dy = cur[1] - prev[1];
      const den = a * dx + b * dy;
      if (Math.abs(den) > 1e-9) {
        const t = (c - a * prev[0] - b * prev[1]) / den;
        out.push([prev[0] + t * dx, prev[1] + t * dy]);
      }
    }
    if (ci) out.push(cur);
  }
  return out;
}
function makeCells(players: Player[]): Cell[] {
  const total = players.reduce((s, p) => s + p.stake, 0) || 1;
  const sites = players.map(p => ({ ...p, weight: 0 }));
  const polygonsForSites = () => sites.map((s, i) => {
    let poly: Point[] = [[0, 0], [SIZE, 0], [SIZE, SIZE], [0, SIZE]];
    for (let j = 0; j < sites.length && poly.length; j++) {
      if (i === j) continue;
      const o = sites[j];
      const a = 2 * (o.x - s.x), b = 2 * (o.y - s.y);
      const c = o.x * o.x + o.y * o.y - s.x * s.x - s.y * s.y + s.weight - o.weight;
      poly = clip(poly, a, b, c);
    }
    return poly;
  });
  for (let it = 0; it < 90 && sites.length > 1; it++) {
    const polys = polygonsForSites();
    const areas = polys.map(area);
    const sum = areas.reduce((a, b) => a + b, 0) || 1;
    sites.forEach((s, i) => { s.weight += (players[i].stake / total - areas[i] / sum) * 4200; });
    const mean = sites.reduce((s, p) => s + p.weight, 0) / sites.length;
    sites.forEach(s => { s.weight -= mean; });
  }
  const polys = polygonsForSites();
  const sumArea = polys.reduce((s, p) => s + area(p), 0) || 1;
  return players.map((p, i) => {
    let poly = polys[i];
    if (poly.length < 3) poly = [[p.x - 1, p.y - 1], [p.x + 1, p.y - 1], [p.x, p.y + 1]];
    const a = poly.reduce((s, pt) => s + pt[0], 0) / poly.length;
    const b = poly.reduce((s, pt) => s + pt[1], 0) / poly.length;
    return { ...p, polygon: poly, points: poly.map(pt => pt.map(v => v.toFixed(1)).join(",")).join(" "), area: area(poly), share: p.stake / total, cx: a, cy: b };
  });
}

export default function ArenaGameDemo() {
  const [players, setPlayers] = useState<Player[]>([
    { id: "demo-1", name: "Игрок 1", stake: 0.5, color: COLORS[0], x: 45, y: 55 },
    { id: "demo-2", name: "Игрок 2", stake: 5, color: COLORS[1], x: 250, y: 225 },
  ]);
  const [amount, setAmount] = useState("1");
  const [running, setRunning] = useState(false);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [ball, setBall] = useState<Point>([SIZE / 2, SIZE / 2]);
  const frameRef = useRef<number | null>(null);
  const cells = useMemo(() => makeCells(players), [players]);
  const total = players.reduce((s, p) => s + p.stake, 0);
  const winner = cells.find(p => p.id === winnerId);

  useEffect(() => () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); }, []);

  function addVirtualStake() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    setPlayers(old => {
      const existing = old.find(p => p.id === "demo-1");
      if (existing) return old.map(p => p.id === "demo-1" ? { ...p, stake: Math.round((p.stake + value) * 1000) / 1000 } : p);
      return [...old, { id: "demo-1", name: "Игрок 1", stake: value, color: COLORS[0], x: 45, y: 55 }];
    });
    setWinnerId(null);
  }

  function startDemoRound() {
    if (running || !cells.length) return;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    const roll = Math.random() * total;
    let cursor = 0;
    const chosen = players.find(p => { cursor += p.stake; return roll < cursor; }) ?? players[players.length - 1];
    const targetCell = cells.find(c => c.id === chosen.id) ?? cells[0];
    const target: Point = [targetCell.cx, targetCell.cy];
    const start: Point = [SIZE / 2, SIZE / 2];
    const started = performance.now();
    const duration = 4200;
    setWinnerId(null);
    setRunning(true);
    const animate = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      // Monotonic interpolation: the ball never overshoots the target or reverses at the end.
      const next: Point = [start[0] + (target[0] - start[0]) * t, start[1] + (target[1] - start[1]) * t];
      setBall(next);
      if (t < 1) frameRef.current = requestAnimationFrame(animate);
      else {
        frameRef.current = null;
        setBall(target);
        setWinnerId(chosen.id);
        setRunning(false);
      }
    };
    frameRef.current = requestAnimationFrame(animate);
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: 16, color: "#f1f5f9", background: "#0a0a12", fontFamily: "Inter, system-ui, sans-serif", borderRadius: 18 }}>
      <div style={{ fontWeight: 900, fontSize: 20 }}>Арена — демо</div>
      <div style={{ color: "#94a3b8", fontSize: 12, margin: "4px 0 14px" }}>Только виртуальные очки. TON и реальные платежи не используются.</div>
      <div style={{ width: "100%", maxWidth: SIZE, margin: "0 auto", aspectRatio: "1", borderRadius: 14, overflow: "hidden", background: "#111827" }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" height="100%">
          <rect width={SIZE} height={SIZE} fill="#111827" />
          {cells.map(c => <polygon key={c.id} points={c.points} fill={c.color} stroke="#0a0a12" strokeWidth="2" />)}
          {cells.map(c => <g key={c.id}>
            <circle cx={c.cx} cy={c.cy} r="16" fill="#111827" stroke="#fff" strokeWidth={winnerId === c.id ? 3 : 1} />
            <text x={c.cx} y={c.cy + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff">{c.name.slice(-1)}</text>
          </g>)}
          <circle cx={ball[0]} cy={ball[1]} r="8" fill="#fff" stroke="#111827" strokeWidth="2" />
        </svg>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <input aria-label="Виртуальная ставка" value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0.1" step="0.1" style={{ minWidth: 0, flex: 1, padding: 10, borderRadius: 9, background: "#171725", color: "#fff", border: "1px solid #37374d" }} />
        <button type="button" onClick={addVirtualStake} disabled={running} style={{ padding: "10px 12px", borderRadius: 9, border: 0, background: "#4338ca", color: "#fff", fontWeight: 800 }}>Добавить очки</button>
        <button type="button" onClick={startDemoRound} disabled={running || players.length < 2} style={{ padding: "10px 12px", borderRadius: 9, border: 0, background: running ? "#475569" : "#16a34a", color: "#fff", fontWeight: 800 }}>Раунд</button>
      </div>
      <div style={{ display: "grid", gap: 7, marginTop: 14 }}>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>Всего виртуальных очков: {total.toFixed(2)}</div>
        {cells.map(c => <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 10px", borderRadius: 9, background: "#171725", border: winnerId === c.id ? "1px solid #fbbf24" : "1px solid #29293a" }}>
          <span><span style={{ color: c.color }}>●</span> {c.name} — {c.stake.toFixed(2)} очков</span>
          <strong>{(c.share * 100).toFixed(1)}% · площадь {(c.area / (SIZE * SIZE) * 100).toFixed(1)}%</strong>
        </div>)}
        {winner && <div style={{ color: "#fbbf24", fontWeight: 900, textAlign: "center", padding: 8 }}>🏆 Победитель демо: {winner.name}</div>}
      </div>
    </div>
  );
}
