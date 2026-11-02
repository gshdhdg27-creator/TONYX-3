import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

const MIN_BET = 0.1;
const PRESETS = [0.1, 0.5, 1, 2, 5];
const TABLES: Record<string, number[]> = {
  low: [0.5, 0.7, 0.9, 1.0, 1.1, 1.2, 1.4, 1.2, 1.1, 1.0, 0.9, 0.7, 0.5],
  med: [0.2, 0.4, 0.6, 0.9, 1.2, 1.8, 3.0, 1.8, 1.2, 0.9, 0.6, 0.4, 0.2],
  high: [0, 0.1, 0.3, 0.6, 1.0, 2.5, 15, 2.5, 1.0, 0.6, 0.3, 0.1, 0],
};

type Risk = "low" | "med" | "high";

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
  const [risk, setRisk] = useState<Risk>("med");
  const [busy, setBusy] = useState(false);
  const [hit, setHit] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [last, setLast] = useState<null | { mult: number; profit: number }>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ballRef = useRef<{ x: number; y: number; visible: boolean }>({ x: 0.5, y: 0, visible: false });
  const pathAnimRef = useRef(0);

  const table = TABLES[risk];
  const rows = table.length - 1;

  const drawBoard = useCallback((highlight: number | null) => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== Math.floor(w * dpr)) {
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const padX = 18;
    const topY = 18;
    const bucketH = 36;
    const pegAreaH = h - topY - bucketH - 10;
    const pegR = 3.2;

    // pegs
    for (let r = 0; r < rows; r++) {
      const cols = r + 1;
      const y = topY + ((r + 1) / (rows + 1)) * pegAreaH;
      for (let col = 0; col < cols; col++) {
        const x = padX + ((col + 0.5) / cols) * (w - padX * 2);
        ctx.beginPath();
        ctx.arc(x, y, pegR, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(x - 1, y - 1, 0, x, y, pegR);
        g.addColorStop(0, "#e2e8f0");
        g.addColorStop(1, "#64748b");
        ctx.fillStyle = g;
        ctx.fill();
      }
    }

    // buckets
    const bw = (w - padX * 2) / table.length;
    table.forEach((m, i) => {
      const x = padX + i * bw;
      const y = h - bucketH;
      let col = "#3b82f6";
      if (m >= 3) col = "#fbbf24";
      else if (m >= 1) col = "#22c55e";
      else if (m <= 0) col = "#ef4444";
      const active = highlight === i;
      ctx.fillStyle = active ? col : col + "99";
      ctx.beginPath();
      ctx.roundRect(x + 1, y, bw - 2, bucketH - 4, 6);
      ctx.fill();
      if (active) {
        ctx.shadowColor = col;
        ctx.shadowBlur = 16;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = active ? "#0b1020" : "rgba(11,16,32,0.85)";
      ctx.font = `bold ${Math.max(8, Math.min(11, bw * 0.35))}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${m}x`, x + bw / 2, y + (bucketH - 4) / 2);
    });

    // ball
    const b = ballRef.current;
    if (b.visible) {
      const bx = padX + b.x * (w - padX * 2);
      const by = topY + b.y * pegAreaH;
      ctx.beginPath();
      ctx.arc(bx, by, 7, 0, Math.PI * 2);
      const bg = ctx.createRadialGradient(bx - 2, by - 2, 0, bx, by, 7);
      bg.addColorStop(0, "#fff");
      bg.addColorStop(0.4, "#38bdf8");
      bg.addColorStop(1, "#0284c7");
      ctx.fillStyle = bg;
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, [rows, table]);

  useEffect(() => {
    drawBoard(hit);
  }, [drawBoard, hit, risk]);

  useEffect(() => {
    const onResize = () => drawBoard(hit);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [drawBoard, hit]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const animatePath = (path: number[], finalSlot: number) =>
    new Promise<void>((resolve) => {
      cancelAnimationFrame(pathAnimRef.current);
      ballRef.current.visible = true;
      let step = 0;
      let pos = 0; // cumulative rights
      const total = path.length;

      const runStep = () => {
        if (step >= total) {
          // settle into bucket
          ballRef.current.x = (finalSlot + 0.5) / table.length;
          ballRef.current.y = 1.02;
          setHit(finalSlot);
          drawBoard(finalSlot);
          haptic("medium");
          resolve();
          return;
        }
        const right = path[step]!;
        pos += right;
        const r = step + 1;
        const cols = r + 1;
        // interpolate within row
        const start = performance.now();
        const fromX = ballRef.current.x;
        const toX = (pos + 0.5) / cols;
        const fromY = ballRef.current.y;
        const toY = (r + 1) / (rows + 1);

        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / 90);
          const ease = 1 - Math.pow(1 - p, 2);
          ballRef.current.x = fromX + (toX - fromX) * ease;
          ballRef.current.y = fromY + (toY - fromY) * ease;
          // slight bounce mid
          if (p > 0.4 && p < 0.7) ballRef.current.y -= 0.015;
          drawBoard(null);
          if (p < 1) pathAnimRef.current = requestAnimationFrame(tick);
          else {
            haptic("light");
            step += 1;
            runStep();
          }
        };
        pathAnimRef.current = requestAnimationFrame(tick);
      };

      ballRef.current = { x: 0.5, y: 0, visible: true };
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
        body: JSON.stringify({ telegramId, stake, risk }),
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
      flash(profit >= 0 ? `+${profit.toFixed(3)} TON · ${d.multiplier}x` : `${profit.toFixed(3)} TON`);
      onBalanceChange();
    } catch {
      flash("Сеть недоступна");
    } finally {
      ballRef.current.visible = false;
      setBusy(false);
      drawBoard(hit);
    }
  };

  return (
    <div style={root}>
      {toast && <div style={toastStyle}>{toast}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {(["low", "med", "high"] as Risk[]).map((r) => (
          <button key={r} type="button" disabled={busy} onClick={() => { setRisk(r); setHit(null); }}
            style={{
              ...chip, flex: 1, padding: "10px 0",
              borderColor: risk === r ? "rgba(56,189,248,0.6)" : "rgba(255,255,255,0.1)",
              background: risk === r ? "rgba(14,165,233,0.2)" : "rgba(255,255,255,0.04)",
              color: risk === r ? "#7dd3fc" : "#94a3b8",
            }}>
            {r === "low" ? "Low" : r === "med" ? "Med" : "High"}
          </button>
        ))}
      </div>

      <div style={board}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      </div>

      {last && (
        <div style={{
          textAlign: "center", fontWeight: 900, fontSize: 16, marginBottom: 10,
          color: last.profit >= 0 ? "#4ade80" : "#f87171",
        }}>
          {last.mult}x → {last.profit >= 0 ? "+" : ""}{last.profit.toFixed(3)} TON
        </div>
      )}

      <div style={panel}>
        <span style={lab}>Ставка TON</span>
        <input type="number" min={MIN_BET} step="0.1" value={stake} disabled={busy}
          onChange={(e) => setStake(Math.max(MIN_BET, Number(e.target.value) || MIN_BET))} style={inp} />
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {PRESETS.map((p) => (
            <button key={p} type="button" disabled={busy} onClick={() => setStake(p)} style={chip}>{p}</button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "#64748b", margin: "12px 0" }}>
          Баланс <b style={{ color: "#e2e8f0" }}>{balance.toFixed(3)} TON</b>
        </div>
        <button type="button" disabled={busy || stake > balance} onClick={play} style={btn}>
          {busy ? "Падает…" : "⚪  Дропать"}
        </button>
      </div>
    </div>
  );
}

const root: CSSProperties = { color: "#e2e8f0", position: "relative" };
const board: CSSProperties = {
  height: 280, borderRadius: 20, overflow: "hidden", marginBottom: 12,
  background: "radial-gradient(ellipse at 50% 0%, #0c4a6e 0%, #020617 70%)",
  border: "1px solid rgba(56,189,248,0.3)",
  boxShadow: "0 0 40px rgba(14,165,233,0.12)",
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
  background: "linear-gradient(135deg,#0284c7,#38bdf8)", color: "#0b1020",
  fontSize: 16, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
  boxShadow: "0 8px 28px rgba(56,189,248,0.35)",
};
const toastStyle: CSSProperties = {
  position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 50,
  padding: "10px 18px", borderRadius: 12, fontWeight: 800, fontSize: 13,
  background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff",
};
