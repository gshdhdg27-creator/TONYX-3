import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

const MIN_BET = 0.1;
const PRESETS = [0.1, 0.5, 1, 2, 5];

type Risk = "low" | "med" | "high";

function buildTable(rows: number, risk: Risk): number[] {
  if (rows === 12 && risk === "high") return [76, 17, 6, 2.2, 0.8, 0.2, 0.1, 0.2, 0.8, 2.2, 6, 17, 76];
  if (rows === 12 && risk === "med") return [13, 6, 3, 1.5, 0.7, 0.5, 0.4, 0.5, 0.7, 1.5, 3, 6, 13];
  if (rows === 12 && risk === "low") return [4, 2.2, 1.4, 1.1, 1, 0.9, 0.8, 0.9, 1, 1.1, 1.4, 2.2, 4];
  if (rows === 16 && risk === "high") return [170, 45, 12, 5, 2.2, 0.8, 0.4, 0.2, 0.1, 0.2, 0.4, 0.8, 2.2, 5, 12, 45, 170];
  if (rows === 16 && risk === "med") return [16, 9, 4, 2, 1.2, 0.7, 0.5, 0.4, 0.3, 0.4, 0.5, 0.7, 1.2, 2, 4, 9, 16];
  if (rows === 16 && risk === "low") return [5, 2.5, 1.6, 1.2, 1, 0.9, 0.8, 0.7, 0.7, 0.7, 0.8, 0.9, 1, 1.2, 1.6, 2.5, 5];
  if (rows === 8 && risk === "high") return [29, 8, 2.5, 0.8, 0.4, 0.8, 2.5, 8, 29];
  if (rows === 8 && risk === "med") return [5.6, 2.1, 1.1, 0.8, 0.6, 0.8, 1.1, 2.1, 5.6];
  if (rows === 8 && risk === "low") return [2.5, 1.5, 1.2, 1, 0.9, 1, 1.2, 1.5, 2.5];
  // generic
  const n = rows + 1;
  const half = Math.floor(n / 2);
  const edge = risk === "high" ? 80 : risk === "med" ? 14 : 4;
  const mid = risk === "high" ? 0.2 : risk === "med" ? 0.5 : 0.9;
  return Array.from({ length: n }, (_, i) => {
    const d = Math.abs(i - (n - 1) / 2) / Math.max(half, 1);
    let m = mid + (edge - mid) * Math.pow(d, risk === "high" ? 2.4 : risk === "med" ? 1.8 : 1.2);
    if (m >= 10) m = Math.round(m);
    else if (m >= 2) m = Math.round(m * 10) / 10;
    else m = Math.round(m * 100) / 100;
    return m;
  });
}

function bucketColor(m: number, max: number): string {
  const t = Math.min(1, m / Math.max(max, 0.01));
  // center green → yellow → orange → pink edges (as in screenshot)
  if (t < 0.08) return "#22c55e";
  if (t < 0.15) return "#84cc16";
  if (t < 0.25) return "#eab308";
  if (t < 0.4) return "#f59e0b";
  if (t < 0.6) return "#f97316";
  if (t < 0.8) return "#fb7185";
  return "#ec4899";
}

function haptic(t: "light" | "medium" | "heavy" = "light") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(t); } catch { /* */ }
}
function hapticNotify(t: "success" | "error") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(t); } catch { /* */ }
}

export default function PlinkoGame({
  telegramId, balance, onBalanceChange,
}: { telegramId: string; balance: number; onBalanceChange: () => void }) {
  const [stake, setStake] = useState(0.5);
  const [risk, setRisk] = useState<Risk>("high");
  const [rows, setRows] = useState(12);
  const [busy, setBusy] = useState(false);
  const [hit, setHit] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [last, setLast] = useState<null | { mult: number; profit: number }>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ballRef = useRef<{ x: number; y: number; visible: boolean }>({ x: 0.5, y: 0, visible: false });
  const animRef = useRef(0);

  const table = useMemo(() => buildTable(rows, risk), [rows, risk]);
  const maxM = useMemo(() => Math.max(...table), [table]);

  const draw = useCallback((highlight: number | null) => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (c.width !== Math.floor(W * dpr)) {
      c.width = Math.floor(W * dpr);
      c.height = Math.floor(H * dpr);
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // soft stars
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < 12; i++) {
      const sx = ((i * 97) % 100) / 100 * W;
      const sy = ((i * 53) % 100) / 100 * (H * 0.7);
      ctx.beginPath();
      ctx.arc(sx, sy, i % 3 === 0 ? 1.4 : 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    const padX = 14;
    const topY = 36;
    const bucketH = 34;
    const pegAreaH = H - topY - bucketH - 8;
    const slots = table.length;

    // top dropper (gold pill)
    const dropX = W / 2;
    const dropY = 14;
    const grd = ctx.createLinearGradient(dropX - 28, dropY, dropX + 28, dropY + 12);
    grd.addColorStop(0, "#fde68a");
    grd.addColorStop(0.5, "#fbbf24");
    grd.addColorStop(1, "#d97706");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(dropX - 26, dropY + 4);
    ctx.arcTo(dropX - 26, dropY, dropX - 18, dropY, 6);
    ctx.lineTo(dropX + 18, dropY);
    ctx.arcTo(dropX + 26, dropY, dropX + 26, dropY + 4, 6);
    ctx.lineTo(dropX + 26, dropY + 8);
    ctx.arcTo(dropX + 26, dropY + 14, dropX + 18, dropY + 14, 6);
    ctx.lineTo(dropX - 18, dropY + 14);
    ctx.arcTo(dropX - 26, dropY + 14, dropX - 26, dropY + 8, 6);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = "#fbbf24";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;

    // pegs — pyramid: row r has (r+1) pegs? classic plinko has row r with r+1 pegs starting from 1
    // Screenshot: top small rows growing down to rows count
    const pegR = Math.max(2.4, Math.min(4.2, (W - padX * 2) / (slots * 3.2)));

    for (let r = 0; r < rows; r++) {
      const pegsInRow = r + 3; // starts wider like screenshot pyramid
      // Better: classic — row 0 has 3 pegs offset, growing
      // Match screenshot: equilateral-ish triangle of pegs
      const count = r + 1;
      const y = topY + ((r + 0.5) / rows) * pegAreaH;
      // spacing so bottom row aligns with buckets
      const usable = W - padX * 2;
      // center the row; bottom row spans almost full width over slots-ish
      const span = usable * ((r + 1) / rows);
      for (let col = 0; col < count; col++) {
        const x =
          count === 1
            ? W / 2
            : W / 2 - span / 2 + (col / (count - 1)) * span;
        // lavender peg with highlight
        const g = ctx.createRadialGradient(x - pegR * 0.35, y - pegR * 0.35, 0, x, y, pegR);
        g.addColorStop(0, "#f5f3ff");
        g.addColorStop(0.45, "#c4b5fd");
        g.addColorStop(1, "#7c3aed");
        ctx.beginPath();
        ctx.arc(x, y, pegR, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x - pegR * 0.3, y - pegR * 0.3, pegR * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fill();
      }
      void pegsInRow;
    }

    // buckets
    const bw = (W - padX * 2) / slots;
    table.forEach((m, i) => {
      const x = padX + i * bw;
      const y = H - bucketH;
      const col = bucketColor(m, maxM);
      const active = highlight === i;
      // rounded rect
      const rx = x + 1.5, ry = y, rw = bw - 3, rh = bucketH - 6, rr = 7;
      ctx.beginPath();
      ctx.moveTo(rx + rr, ry);
      ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, rr);
      ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, rr);
      ctx.arcTo(rx, ry + rh, rx, ry, rr);
      ctx.arcTo(rx, ry, rx + rw, ry, rr);
      ctx.closePath();
      ctx.fillStyle = col;
      if (active) {
        ctx.shadowColor = col;
        ctx.shadowBlur = 18;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      if (active) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.fillStyle = "#1e1b4b";
      ctx.font = `bold ${Math.max(8, Math.min(11, bw * 0.42))}px system-ui,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = m >= 10 ? `×${Math.round(m)}` : `×${m}`;
      ctx.fillText(label, x + bw / 2, y + (bucketH - 6) / 2);
    });

    // ball
    const b = ballRef.current;
    if (b.visible) {
      // map normalized coords: x 0..1 across board, y 0..1 peg area
      const bx = padX + b.x * (W - padX * 2);
      const by = topY + b.y * pegAreaH;
      ctx.beginPath();
      ctx.arc(bx, by, Math.max(5, pegR * 1.35), 0, Math.PI * 2);
      const bg = ctx.createRadialGradient(bx - 2, by - 2, 0, bx, by, 8);
      bg.addColorStop(0, "#ffffff");
      bg.addColorStop(0.35, "#e9d5ff");
      bg.addColorStop(1, "#a855f7");
      ctx.fillStyle = bg;
      ctx.shadowColor = "#c084fc";
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, [rows, table, maxM]);

  useEffect(() => {
    draw(hit);
  }, [draw, hit, risk, rows]);

  useEffect(() => {
    const onR = () => draw(hit);
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, [draw, hit]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const animatePath = (path: number[], finalSlot: number) =>
    new Promise<void>((resolve) => {
      cancelAnimationFrame(animRef.current);
      ballRef.current = { x: 0.5, y: 0.02, visible: true };
      let step = 0;
      let pos = 0;
      const total = path.length;

      const runStep = () => {
        if (step >= total) {
          ballRef.current.x = (finalSlot + 0.5) / table.length;
          ballRef.current.y = 1.05;
          setHit(finalSlot);
          draw(finalSlot);
          haptic("medium");
          resolve();
          return;
        }
        const right = path[step]!;
        pos += right;
        const r = step + 1;
        const count = r; // pegs in this row index matching draw
        // place ball between pegs of current row
        const span = count <= 1 ? 0 : 1;
        // x relative: binomial position / rows
        const toX = (pos + 0.5) / (step + 2); // growing row width approx
        // better: final path converges to slot/(rows)
        const progress = r / rows;
        const targetX = ((pos + 0.5) / (r + 1)) * progress + 0.5 * (1 - progress);
        // use slot-aware interpolation for accuracy
        const slotFrac = finalSlot / Math.max(rows, 1);
        const blend = 0.35 + 0.65 * progress;
        const aimX = pos / Math.max(r, 1);
        const nx = aimX * blend + 0.5 * (1 - blend) * 0 + (slotFrac) * 0; // simplify
        void span; void toX; void targetX; void nx;

        const start = performance.now();
        const fromX = ballRef.current.x;
        const fromY = ballRef.current.y;
        // position: row r has `r+1` peg gaps conceptually — map pos in 0..r to board x
        const toX2 = (pos + 0.5) / (r + 1);
        const toY2 = (r + 0.35) / rows;

        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / 85);
          const ease = 1 - Math.pow(1 - p, 2);
          ballRef.current.x = fromX + (toX2 - fromX) * ease;
          ballRef.current.y = fromY + (toY2 - fromY) * ease;
          if (p > 0.35 && p < 0.65) ballRef.current.y -= 0.012;
          draw(null);
          if (p < 1) animRef.current = requestAnimationFrame(tick);
          else {
            haptic("light");
            step += 1;
            runStep();
          }
        };
        animRef.current = requestAnimationFrame(tick);
      };
      runStep();
    });

  const play = async () => {
    if (busy || !telegramId) return;
    if (stake > balance) { flash("Недостаточно TON"); return; }
    setBusy(true);
    setHit(null);
    setLast(null);
    haptic("medium");
    try {
      const res = await fetch("/api/mini/games/plinko/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, stake, risk, rows }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(d.error ?? "Ошибка");
        setBusy(false);
        return;
      }
      await animatePath(d.path ?? [], Number(d.slot) || 0);
      const profit = Number(d.profit) || 0;
      setLast({ mult: Number(d.multiplier) || 0, profit });
      if (profit >= 0) hapticNotify("success");
      else hapticNotify("error");
      flash(profit >= 0 ? `+${profit.toFixed(3)} TON · ×${d.multiplier}` : `${profit.toFixed(3)} TON`);
      onBalanceChange();
    } catch {
      flash("Сеть недоступна");
    } finally {
      ballRef.current.visible = false;
      setBusy(false);
      draw(hit);
    }
  };

  return (
    <div style={root}>
      {toast && <div style={toastStyle}>{toast}</div>}

      {/* Risk */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {([
          ["low", "Лёгкий"],
          ["med", "Средний"],
          ["high", "Сложный"],
        ] as [Risk, string][]).map(([r, label]) => (
          <button
            key={r}
            type="button"
            disabled={busy}
            onClick={() => { setRisk(r); setHit(null); }}
            style={{
              ...chip,
              flex: 1,
              padding: "10px 0",
              borderColor: risk === r ? "rgba(192,132,252,0.7)" : "rgba(255,255,255,0.1)",
              background: risk === r ? "rgba(124,58,237,0.35)" : "rgba(255,255,255,0.04)",
              color: risk === r ? "#e9d5ff" : "#94a3b8",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Rows */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>Ряды</span>
          <span style={{ fontSize: 12, fontWeight: 900, color: "#e9d5ff" }}>{rows}</span>
        </div>
        <input
          type="range"
          min={8}
          max={16}
          step={1}
          value={rows}
          disabled={busy}
          onChange={(e) => { setRows(Number(e.target.value)); setHit(null); }}
          style={{ width: "100%", accentColor: "#a855f7" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b" }}>
          <span>8</span><span>16</span>
        </div>
      </div>

      <div style={board}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      </div>

      {last && (
        <div style={{
          textAlign: "center", fontWeight: 900, fontSize: 16, marginBottom: 10,
          color: last.profit >= 0 ? "#4ade80" : "#f87171",
        }}>
          ×{last.mult} → {last.profit >= 0 ? "+" : ""}{last.profit.toFixed(3)} TON
        </div>
      )}

      <div style={panel}>
        <span style={lab}>Ставка TON</span>
        <input
          type="number"
          min={MIN_BET}
          step="0.1"
          value={stake}
          disabled={busy}
          onChange={(e) => setStake(Math.max(MIN_BET, Number(e.target.value) || MIN_BET))}
          style={inp}
        />
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {PRESETS.map((p) => (
            <button key={p} type="button" disabled={busy} onClick={() => setStake(p)} style={chip}>{p}</button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "#64748b", margin: "12px 0" }}>
          Баланс <b style={{ color: "#e2e8f0" }}>{balance.toFixed(3)} TON</b>
        </div>
        <button type="button" disabled={busy || stake > balance} onClick={play} style={btn}>
          {busy ? "Падает…" : "Дропать"}
        </button>
      </div>
    </div>
  );
}

const root: CSSProperties = { color: "#e2e8f0", position: "relative" };
const board: CSSProperties = {
  height: 340,
  borderRadius: 24,
  overflow: "hidden",
  marginBottom: 12,
  background: "radial-gradient(ellipse at 50% 0%, #4c1d95 0%, #1e1b4b 40%, #0a0612 100%)",
  border: "1px solid rgba(167,139,250,0.35)",
  boxShadow: "0 0 50px rgba(124,58,237,0.2), inset 0 1px 0 rgba(255,255,255,0.06)",
};
const panel: CSSProperties = {
  background: "rgba(15,23,42,0.8)", borderRadius: 18, padding: 14,
  border: "1px solid rgba(255,255,255,0.08)",
};
const lab: CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 6 };
const inp: CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.4)",
  color: "#fff", fontSize: 16, fontWeight: 800, fontFamily: "inherit",
};
const chip: CSSProperties = {
  padding: "6px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)", color: "#cbd5e1", fontWeight: 700, fontSize: 12,
  cursor: "pointer", fontFamily: "inherit",
};
const btn: CSSProperties = {
  width: "100%", padding: "15px 0", borderRadius: 14, border: "none",
  background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff",
  fontSize: 16, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
  boxShadow: "0 8px 28px rgba(168,85,247,0.4)",
};
const toastStyle: CSSProperties = {
  position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 50,
  padding: "10px 18px", borderRadius: 12, fontWeight: 800, fontSize: 13,
  background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff",
};
