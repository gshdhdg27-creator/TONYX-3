import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

const MIN_BET = 0.1;
const PRESETS = [0.1, 0.5, 1, 2, 5];
const BALL_PRESETS = [1, 5, 10, 25];
const MAX_BALLS = 50; /* build-ok */

type Risk = "low" | "med" | "high";

function buildTable(rows: number, risk: Risk): number[] {
  const TABLES: Record<Risk, Record<number, number[]>> = {
    low: {
      8:  [2.0, 1.5, 1.2, 1.0, 0.9, 1.0, 1.2, 1.5, 2.0],
      9:  [2.2, 1.6, 1.3, 1.1, 0.9, 0.9, 1.1, 1.3, 1.6, 2.2],
      10: [2.5, 1.8, 1.4, 1.1, 1.0, 0.8, 1.0, 1.1, 1.4, 1.8, 2.5],
      11: [2.8, 2.0, 1.5, 1.2, 1.0, 0.9, 0.9, 1.0, 1.2, 1.5, 2.0, 2.8],
      12: [3.2, 2.1, 1.6, 1.3, 1.1, 1.0, 0.8, 1.0, 1.1, 1.3, 1.6, 2.1, 3.2],
      13: [3.5, 2.3, 1.7, 1.4, 1.1, 1.0, 0.9, 0.9, 1.0, 1.1, 1.4, 1.7, 2.3, 3.5],
      14: [4.0, 2.5, 1.8, 1.4, 1.2, 1.0, 0.9, 0.8, 0.9, 1.0, 1.2, 1.4, 1.8, 2.5, 4.0],
      15: [4.5, 2.8, 2.0, 1.5, 1.2, 1.0, 0.9, 0.8, 0.8, 0.9, 1.0, 1.2, 1.5, 2.0, 2.8, 4.5],
      16: [5.0, 3.0, 2.1, 1.6, 1.3, 1.1, 1.0, 0.9, 0.8, 0.9, 1.0, 1.1, 1.3, 1.6, 2.1, 3.0, 5.0],
    },
    med: {
      8:  [5.6, 2.1, 1.1, 0.9, 0.6, 0.9, 1.1, 2.1, 5.6],
      9:  [7.0, 2.5, 1.4, 1.0, 0.6, 0.6, 1.0, 1.4, 2.5, 7.0],
      10: [8.5, 3.0, 1.6, 1.1, 0.7, 0.5, 0.7, 1.1, 1.6, 3.0, 8.5],
      11: [10, 3.5, 1.8, 1.2, 0.8, 0.5, 0.5, 0.8, 1.2, 1.8, 3.5, 10],
      12: [13, 4.0, 2.0, 1.3, 0.8, 0.5, 0.4, 0.5, 0.8, 1.3, 2.0, 4.0, 13],
      13: [15, 5.0, 2.3, 1.4, 0.9, 0.5, 0.4, 0.4, 0.5, 0.9, 1.4, 2.3, 5.0, 15],
      14: [18, 6.0, 2.6, 1.5, 1.0, 0.6, 0.4, 0.3, 0.4, 0.6, 1.0, 1.5, 2.6, 6.0, 18],
      15: [22, 7.0, 3.0, 1.6, 1.0, 0.6, 0.4, 0.3, 0.3, 0.4, 0.6, 1.0, 1.6, 3.0, 7.0, 22],
      16: [26, 8.0, 3.5, 1.8, 1.1, 0.7, 0.5, 0.3, 0.2, 0.3, 0.5, 0.7, 1.1, 1.8, 3.5, 8.0, 26],
    },
    high: {
      8:  [13, 4.0, 1.5, 0.6, 0.3, 0.6, 1.5, 4.0, 13],
      9:  [18, 5.0, 1.8, 0.7, 0.3, 0.3, 0.7, 1.8, 5.0, 18],
      10: [22, 6.0, 2.0, 0.8, 0.4, 0.2, 0.4, 0.8, 2.0, 6.0, 22],
      11: [28, 7.0, 2.3, 0.9, 0.4, 0.2, 0.2, 0.4, 0.9, 2.3, 7.0, 28],
      12: [33, 8.0, 2.5, 1.0, 0.5, 0.2, 0.1, 0.2, 0.5, 1.0, 2.5, 8.0, 33],
      13: [40, 10, 3.0, 1.1, 0.5, 0.2, 0.1, 0.1, 0.2, 0.5, 1.1, 3.0, 10, 40],
      14: [50, 12, 3.5, 1.2, 0.6, 0.3, 0.15, 0.1, 0.15, 0.3, 0.6, 1.2, 3.5, 12, 50],
      15: [60, 15, 4.0, 1.4, 0.6, 0.3, 0.15, 0.1, 0.1, 0.15, 0.3, 0.6, 1.4, 4.0, 15, 60],
      16: [75, 18, 5.0, 1.6, 0.7, 0.3, 0.15, 0.1, 0.05, 0.1, 0.15, 0.3, 0.7, 1.6, 5.0, 18, 75],
    },
  };
  return TABLES[risk][rows] ?? TABLES[risk][12]!;
}

function bucketColor(m: number, max: number): string {
  const t = max > 0 ? Math.min(1, m / max) : 0;
  if (t >= 0.55) return "#ff4d8d";
  if (t >= 0.28) return "#f5c542";
  if (t >= 0.12) return "#9fd84a";
  return "#3dd68c";
}

function fmtMult(m: number): string {
  if (m >= 10) return `×${Math.round(m)}`;
  if (m >= 1) return `×${m % 1 === 0 ? m.toFixed(0) : m}`;
  return `×${m}`;
}

function haptic(t: "light" | "medium" | "heavy" = "light") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(t); } catch { /* */ }
}
function hapticNotify(t: "success" | "error") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(t); } catch { /* */ }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export default function PlinkoGame({
  telegramId, balance, onBalanceChange,
}: { telegramId: string; balance: number; onBalanceChange: () => void }) {
  const [stake, setStake] = useState(0.5);
  const [risk, setRisk] = useState<Risk>("med");
  const [rows, setRows] = useState(12);
  const [balls, setBalls] = useState(1);
  const [busy, setBusy] = useState(false);
  const [hit, setHit] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [last, setLast] = useState<null | { mult: number; profit: number; count: number }>(null);
  const [progress, setProgress] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ballRef = useRef<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const animRef = useRef(0);
  const pegsRef = useRef<{ x: number; y: number }[][]>([]);

  const table = useMemo(() => buildTable(rows, risk), [rows, risk]);
  const maxM = useMemo(() => Math.max(...table, 1), [table]);
  const totalCost = Math.round(stake * balls * 1000) / 1000;

  const draw = useCallback((highlight: number | null) => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, c.clientWidth);
    const H = Math.max(1, c.clientHeight);
    if (c.width !== Math.floor(W * dpr) || c.height !== Math.floor(H * dpr)) {
      c.width = Math.floor(W * dpr);
      c.height = Math.floor(H * dpr);
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    [[0.1,0.12],[0.9,0.14],[0.18,0.4],[0.82,0.38],[0.12,0.68],[0.88,0.65]].forEach(([sx, sy]) => {
      ctx.beginPath();
      ctx.arc(sx * W, sy * H, 1.2, 0, Math.PI * 2);
      ctx.fill();
    });

    const pad = 12;
    const topY = 36;
    const bucketH = 36;
    const areaH = H - topY - bucketH - 4;
    const slots = table.length;

    const dx = W / 2;
    const grad = ctx.createLinearGradient(dx - 24, 10, dx + 24, 22);
    grad.addColorStop(0, "#ffe9a8");
    grad.addColorStop(0.5, "#f5c542");
    grad.addColorStop(1, "#c99212");
    ctx.fillStyle = grad;
    ctx.shadowColor = "rgba(245,197,66,0.65)";
    ctx.shadowBlur = 12;
    roundRect(ctx, dx - 24, 10, 48, 12, 6);
    ctx.fill();
    ctx.shadowBlur = 0;

    const pegs: { x: number; y: number }[][] = [];
    for (let r = 0; r < rows; r++) {
      const count = r + 3;
      const y = topY + ((r + 0.5) / rows) * areaH;
      const usable = W - pad * 2;
      const span = usable * Math.min(1, (count - 1) / (rows + 2) + 0.12);
      const row: { x: number; y: number }[] = [];
      for (let i = 0; i < count; i++) {
        const x = count === 1 ? W / 2 : W / 2 - span / 2 + (i / (count - 1)) * span;
        row.push({ x, y });
      }
      pegs.push(row);
    }
    pegsRef.current = pegs;

    const pegR = Math.max(2.8, Math.min(4.5, (W - pad * 2) / (rows * 2.6)));
    for (const row of pegs) {
      for (const p of row) {
        const g = ctx.createRadialGradient(p.x - pegR * 0.3, p.y - pegR * 0.3, 0, p.x, p.y, pegR);
        g.addColorStop(0, "#fff");
        g.addColorStop(0.4, "#ddd6fe");
        g.addColorStop(1, "#158454");
        ctx.beginPath();
        ctx.arc(p.x, p.y, pegR, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }
    }

    const bw = (W - pad * 2) / slots;
    table.forEach((m, i) => {
      const x = pad + i * bw;
      const y = H - bucketH;
      const col = bucketColor(m, maxM);
      const active = highlight === i;
      ctx.fillStyle = col;
      ctx.shadowColor = active ? col : "transparent";
      ctx.shadowBlur = active ? 14 : 0;
      roundRect(ctx, x + 1, y, bw - 2, bucketH - 6, 6);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (active) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        roundRect(ctx, x + 1, y, bw - 2, bucketH - 6, 6);
        ctx.stroke();
      }
      ctx.fillStyle = "#1a1030";
      const fs = Math.max(6, Math.min(10, bw * 0.4));
      ctx.font = `800 ${fs}px system-ui,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(fmtMult(m), x + bw / 2, y + (bucketH - 6) / 2);
    });

    // Keep a short luminous trail behind the moving ball so every server path is readable.
    const trail = trailRef.current;
    for (let i = 0; i < trail.length; i++) {
      const point = trail[i]!;
      const strength = (i + 1) / trail.length;
      ctx.globalAlpha = strength * 0.34;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2 + strength * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = "#a7f3d0";
      ctx.shadowColor = "#34d399";
      ctx.shadowBlur = 9;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    const b = ballRef.current;
    if (b.visible) {
      const br = Math.max(5, pegR * 1.3);
      ctx.beginPath();
      ctx.arc(b.x, b.y, br, 0, Math.PI * 2);
      const bg = ctx.createRadialGradient(b.x - 2, b.y - 2, 0, b.x, b.y, br);
      bg.addColorStop(0, "#fff");
      bg.addColorStop(0.45, "#c8f7df");
      bg.addColorStop(1, "#34d399");
      ctx.fillStyle = bg;
      ctx.shadowColor = "#7de5b2";
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, [rows, table, maxM]);

  useEffect(() => { draw(hit); }, [draw, hit, risk, rows]);
  useEffect(() => {
    const onR = () => draw(hit);
    window.addEventListener("resize", onR);
    return () => {
      window.removeEventListener("resize", onR);
      cancelAnimationFrame(animRef.current);
    };
  }, [draw, hit]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const animatePath = (path: number[], finalSlot: number) =>
    new Promise<void>((resolve) => {
      cancelAnimationFrame(animRef.current);
      const pegs = pegsRef.current;
      if (!pegs.length) { resolve(); return; }

      const first = pegs[0]!;
      const startX = (first[0]!.x + first[first.length - 1]!.x) / 2;
      ballRef.current = { x: startX, y: first[0]!.y - 20, visible: true };
      trailRef.current = [];

      let step = 0;
      let pegIndex = Math.floor(first.length / 2);

      const go = () => {
        if (step >= path.length || step >= pegs.length) {
          const c = canvasRef.current;
          const W = c?.clientWidth ?? 300;
          const H = c?.clientHeight ?? 320;
          const pad = 12;
          const bw = (W - pad * 2) / table.length;
          const targetX = pad + finalSlot * bw + bw / 2;
          const targetY = H - 18;
          const fromX = ballRef.current.x;
          const fromY = ballRef.current.y;
          const t0 = performance.now();
          const tick = (now: number) => {
            const p = Math.min(1, (now - t0) / 400);
            const e = 1 - Math.pow(1 - p, 2);
            ballRef.current.x = fromX + (targetX - fromX) * e;
            ballRef.current.y = fromY + (targetY - fromY) * e;
            draw(p > 0.8 ? finalSlot : null);
            if (p < 1) animRef.current = requestAnimationFrame(tick);
            else { setHit(finalSlot); haptic("medium"); resolve(); }
          };
          animRef.current = requestAnimationFrame(tick);
          return;
        }

        const right = path[step]! === 1;
        pegIndex = Math.min(Math.max(0, pegIndex + (right ? 1 : 0)), (pegs[step]?.length ?? 1) - 1);
        const row = pegs[step]!;
        const peg = row[Math.min(pegIndex, row.length - 1)]!;
        const toX = peg.x + (right ? 8 : -8);
        const toY = peg.y;
        const fromX = ballRef.current.x;
        const fromY = ballRef.current.y;
        const t0 = performance.now();
        const dur = balls > 5 ? 90 + Math.min(30, step * 2) : 180 + Math.min(50, step * 4);

        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / dur);
          const arc = Math.sin(p * Math.PI) * 11;
          ballRef.current.x = fromX + (toX - fromX) * p;
          ballRef.current.y = fromY + (toY - fromY) * p - arc;
          trailRef.current.push({ x: ballRef.current.x, y: ballRef.current.y });
          if (trailRef.current.length > 22) trailRef.current.shift();
          draw(null);
          if (p < 1) animRef.current = requestAnimationFrame(tick);
          else { if (balls <= 5) haptic("light"); step += 1; go(); }
        };
        animRef.current = requestAnimationFrame(tick);
      };
      go();
    });

  const play = async () => {
    if (busy || !telegramId) return;
    const n = Math.max(1, Math.min(MAX_BALLS, Math.round(balls) || 1));
    if (stake * n > balance + 1e-9) {
      flash(`Нужно ${totalCost} демо-кредитов на ${n} шар(ов)`);
      return;
    }
    setBusy(true);
    setHit(null);
    setLast(null);
    trailRef.current = [];
    setProgress("");
    haptic("medium");

    let totalProfit = 0;
    let lastMult = 0;
    let okCount = 0;

    try {
      for (let i = 0; i < n; i++) {
        setProgress(n > 1 ? `${i + 1} / ${n}` : "");
        const res = await fetch("/api/mini/games/plinko/play", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telegramId, stake, risk, rows }),
        });
        const d = await res.json();
        if (!res.ok) {
          flash(d.error ?? "Ошибка");
          break;
        }
        draw(null);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        await animatePath(Array.isArray(d.path) ? d.path : [], Number(d.slot) || 0);
        totalProfit += Number(d.profit) || 0;
        lastMult = Number(d.multiplier) || 0;
        okCount += 1;
        ballRef.current.visible = false;
        draw(Number(d.slot) || 0);
      }

      if (okCount > 0) {
        const profit = Math.round(totalProfit * 1000) / 1000;
        setLast({
          mult: okCount === 1 ? lastMult : Math.round((profit / (stake * okCount) + 1) * 100) / 100,
          profit,
          count: okCount,
        });
        if (profit >= 0) hapticNotify("success");
        else hapticNotify("error");
        flash(
          okCount === 1
            ? `${profit >= 0 ? "+" : ""}${profit.toFixed(3)} демо-кредитов · ×${lastMult}`
            : `${okCount} шаров · ${profit >= 0 ? "+" : ""}${profit.toFixed(3)} демо-кредитов`,
        );
        onBalanceChange();
      }
    } catch {
      flash("Сеть недоступна");
    } finally {
      ballRef.current.visible = false;
      setBusy(false);
      setProgress("");
      draw(hit);
    }
  };

  return (
    <div className="plinko-game" style={root}><style>{PLINKO_LAYOUT_CSS}</style>
      {toast && <div style={toastStyle}>{toast}</div>}

      <div className="plinko-board" style={board}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      </div>

      {last && (
        <div className="plinko-last-result" style={{
          textAlign: "center", fontWeight: 900, fontSize: 15, margin: "8px 0",
          color: last.profit >= 0 ? "#4ade80" : "#f87171",
        }}>
          {last.count > 1 ? `${last.count} шаров · ` : ""}
          {last.count === 1 ? `×${last.mult} → ` : ""}
          {last.profit >= 0 ? "+" : ""}{last.profit.toFixed(3)} демо-кредитов
        </div>
      )}

      <div className="plinko-risk" style={riskRow}>
        {([["low", "Лёгкий"], ["med", "Средний"], ["high", "Сложный"]] as [Risk, string][]).map(([r, label]) => (
          <button
            key={r}
            type="button"
            disabled={busy}
            onClick={() => { setRisk(r); setHit(null); }}
            style={{
              ...riskBtn,
              background: risk === r ? "linear-gradient(135deg,#116b47,#34d399)" : "rgba(255,255,255,0.04)",
              color: risk === r ? "#fff" : "#94a3b8",
              boxShadow: risk === r ? "0 4px 14px rgba(52,211,153,0.35)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="plinko-rows" style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>Ряды</span>
          <span style={{ fontSize: 13, fontWeight: 900, color: "#c8f7df" }}>{rows}</span>
        </div>
        <input
          type="range" min={8} max={16} step={1} value={rows} disabled={busy}
          onChange={(e) => { setRows(Number(e.target.value)); setHit(null); }}
          style={{ width: "100%", accentColor: "#34d399" }}
        />
      </div>

      <div className="plinko-balls" style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 6 }}>Шары</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {BALL_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => setBalls(n)}
              style={{
                ...chip,
                borderColor: balls === n ? "rgba(52,211,153,0.7)" : "rgba(255,255,255,0.1)",
                background: balls === n ? "rgba(21,132,84,0.35)" : "rgba(255,255,255,0.05)",
                color: balls === n ? "#c8f7df" : "#cbd5e1",
              }}
            >
              {n}
            </button>
          ))}
          <input
            type="number"
            min={1}
            max={MAX_BALLS}
            value={balls}
            disabled={busy}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value) || 1);
              setBalls(Math.max(1, Math.min(MAX_BALLS, v)));
            }}
            style={{
              ...inp,
              width: 64,
              padding: "6px 8px",
              fontSize: 13,
              textAlign: "center",
            }}
            title="Своё число"
          />
        </div>
      </div>

      <div className="plinko-controls" style={panel}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="number" min={MIN_BET} step="0.1" value={stake} disabled={busy}
            onChange={(e) => setStake(Math.max(MIN_BET, Number(e.target.value) || MIN_BET))}
            style={{ ...inp, flex: 1, margin: 0 }}
            placeholder="Ставка за шар"
          />
          <button
            type="button"
            disabled={busy || totalCost > balance}
            onClick={play}
            style={btnPlay}
          >
            {busy ? (progress || "…") : balls > 1 ? `×${balls}` : "Играть"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          {PRESETS.map((p) => (
            <button key={p} type="button" disabled={busy} onClick={() => setStake(p)} style={chip}>{p}</button>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#64748b", textAlign: "right" }}>
            {balance.toFixed(2)} демо-кредитов
            {balls > 1 && (
              <>
                <br />
                <b style={{ color: "#9ee9c1" }}>{totalCost.toFixed(2)} демо-кредитов</b> всего
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

const root: CSSProperties = { color: "#e2e8f0", position: "relative", paddingBottom: 24 };
const riskRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 6,
  marginTop: 4,
  marginBottom: 10,
};
const riskBtn: CSSProperties = {
  padding: "10px 4px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.1)",
  fontWeight: 800,
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
};
const board: CSSProperties = {
  height: 420,
  borderRadius: 22,
  overflow: "hidden",
  marginBottom: 8,
  background: "radial-gradient(ellipse 90% 70% at 50% 0%, #1b6345 0%, #123b2c 45%, #08120e 100%)",
  border: "1px solid rgba(52,211,153,0.4)",
  boxShadow: "0 0 40px rgba(21,132,84,0.2)",
};
const panel: CSSProperties = {
  background: "rgba(15,23,42,0.9)",
  borderRadius: 16,
  padding: 12,
  border: "1px solid rgba(255,255,255,0.08)",
};
const inp: CSSProperties = {
  boxSizing: "border-box",
  padding: "12px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(0,0,0,0.4)",
  color: "#fff",
  fontSize: 15,
  fontWeight: 800,
  fontFamily: "inherit",
};
const chip: CSSProperties = {
  padding: "5px 10px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)",
  color: "#cbd5e1",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
};
const btnPlay: CSSProperties = {
  padding: "12px 18px",
  borderRadius: 12,
  border: "none",
  background: "linear-gradient(135deg,#158454,#7de5b2)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 900,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
  boxShadow: "0 6px 20px rgba(52,211,153,0.4)",
  minWidth: 72,
};
const toastStyle: CSSProperties = {
  position: "fixed",
  top: 72,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 50,
  padding: "10px 18px",
  borderRadius: 12,
  fontWeight: 800,
  fontSize: 13,
  background: "rgba(15,23,42,0.95)",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "#fff",
};


const PLINKO_LAYOUT_CSS = `
.plinko-game{width:100%;max-width:1120px;margin:0 auto;padding:10px 0 32px;display:grid;grid-template-columns:340px minmax(0,1fr);grid-template-rows:auto auto auto auto auto auto;gap:12px 18px;align-items:start;color:#edf2f7}
.plinko-board{grid-column:2;grid-row:1/span 5;min-height:560px!important;height:560px!important;margin:0!important;border-radius:16px!important;border:1px solid #2a3d4a!important;background:radial-gradient(ellipse at 50% 0%,#16313e,#09121b 72%)!important;box-shadow:0 18px 48px #0008!important;overflow:hidden}
.plinko-board canvas{width:100%!important;height:100%!important}
.plinko-last-result{grid-column:2;grid-row:6;align-self:start;text-align:center!important;background:linear-gradient(180deg,#142532,#0d1822);border:1px solid #294858;border-radius:10px;padding:12px 14px!important;box-shadow:inset 0 1px #ffffff0a,0 10px 24px #0005;font-size:14px!important;letter-spacing:.01em}
.plinko-board{position:relative}
.plinko-board:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,#ffffff08,transparent 24%,transparent 78%,#0002)}
.plinko-risk,.plinko-rows,.plinko-balls,.plinko-controls{box-shadow:0 10px 26px #0005,inset 0 1px #ffffff08!important}
.plinko-risk{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px!important}
.plinko-risk button{min-height:42px;font-weight:850!important;letter-spacing:.02em}
.plinko-controls input{min-height:44px}
.plinko-controls button{min-height:42px}
.plinko-game button:not(:disabled){transition:transform .16s ease,filter .16s ease,box-shadow .16s ease}
.plinko-game button:not(:disabled):active{transform:translateY(1px) scale(.985);filter:brightness(1.08)}
.plinko-board canvas{position:relative;z-index:1}
.plinko-risk,.plinko-rows,.plinko-balls,.plinko-controls{grid-column:1;margin:0 0 2px!important;padding:14px!important;background:linear-gradient(180deg,#151f2a,#101720)!important;border:1px solid #293947!important;border-radius:12px!important}
.plinko-risk{grid-row:1}
.plinko-rows{grid-row:2}
.plinko-balls{grid-row:3}
.plinko-controls{grid-row:4;align-self:start}
.plinko-game button{border-radius:8px!important}
.plinko-game input{background:#090f16!important;border:1px solid #344655!important;border-radius:8px!important;color:#eef3f8!important}
.plinko-game .plinko-risk button[style*="linear-gradient"]{background:#126d8a!important;border-color:#2698b7!important;box-shadow:none!important;color:#fff!important}
.plinko-game .plinko-controls button[style*="linear-gradient"]{background:linear-gradient(180deg,#168fba,#08769d)!important;box-shadow:0 4px 0 #064c68!important;color:white!important}
@media(max-width:760px){.plinko-game{display:flex!important;flex-direction:column!important;gap:10px!important;padding:6px 0 24px!important}.plinko-board{width:100%;height:430px!important;min-height:430px!important}.plinko-last-result{width:100%;box-sizing:border-box;order:2}.plinko-risk,.plinko-rows,.plinko-balls,.plinko-controls{width:100%;box-sizing:border-box;padding:12px!important}}
`;
