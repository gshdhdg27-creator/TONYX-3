import { useEffect, useRef, useState, type CSSProperties } from "react";

const MIN_BET = 0.1;
const PRESETS = [0.1, 0.5, 1, 2, 5];
const TABLES: Record<string, number[]> = {
  low: [0.5, 0.7, 0.9, 1.0, 1.1, 1.2, 1.4, 1.2, 1.1, 1.0, 0.9, 0.7, 0.5],
  med: [0.2, 0.4, 0.6, 0.9, 1.2, 1.8, 3.0, 1.8, 1.2, 0.9, 0.6, 0.4, 0.2],
  high: [0, 0.1, 0.3, 0.6, 1.0, 2.5, 15, 2.5, 1.0, 0.6, 0.3, 0.1, 0],
};
const ROWS = 12;

type Risk = "low" | "med" | "high";

type Props = {
  telegramId: string;
  balance: number;
  onBalanceChange: () => void;
};

export default function PlinkoGame({ telegramId, balance, onBalanceChange }: Props) {
  const [stake, setStake] = useState(0.5);
  const [risk, setRisk] = useState<Risk>("med");
  const [busy, setBusy] = useState(false);
  const [hitSlot, setHitSlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<null | { mult: number; payout: number; profit: number }>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);

  const table = TABLES[risk]!;

  const drawBoard = (ball: { x: number; y: number } | null, highlight: number | null) => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== w * dpr || c.height !== h * dpr) {
      c.width = w * dpr;
      c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.clearRect(0, 0, w, h);

    const top = 18;
    const bottom = h - 36;
    const pegR = 3.2;
    const rowH = (bottom - top) / ROWS;

    // pegs
    for (let row = 0; row < ROWS; row++) {
      const n = row + 3;
      const y = top + rowH * row;
      const spacing = (w - 40) / (n - 1 || 1);
      for (let i = 0; i < n; i++) {
        const x = 20 + i * spacing;
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
    const bw = (w - 16) / table.length;
    table.forEach((m, i) => {
      const x = 8 + i * bw;
      const active = highlight === i;
      let col = "#1e3a5f";
      if (m >= 3) col = active ? "#fbbf24" : "#b45309";
      else if (m >= 1) col = active ? "#4ade80" : "#166534";
      else if (m > 0) col = active ? "#60a5fa" : "#1e40af";
      else col = active ? "#f87171" : "#7f1d1d";
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect?.(x + 1, h - 30, bw - 2, 24, 6);
      if (!ctx.roundRect) {
        ctx.fillRect(x + 1, h - 30, bw - 2, 24);
      } else {
        ctx.fill();
      }
      ctx.fillStyle = active ? "#0b1020" : "#e2e8f0";
      ctx.font = `bold ${Math.max(8, Math.min(11, bw * 0.45))}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${m}x`, x + bw / 2, h - 18);
    });

    // ball
    if (ball) {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 7, 0, Math.PI * 2);
      const bg = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 0, ball.x, ball.y, 8);
      bg.addColorStop(0, "#fff");
      bg.addColorStop(0.5, "#38bdf8");
      bg.addColorStop(1, "#0284c7");
      ctx.fillStyle = bg;
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  };

  useEffect(() => {
    drawBoard(null, null);
    const onResize = () => drawBoard(null, hitSlot);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animRef.current);
    };
  }, [risk]);

  const animatePath = (path: number[], finalSlot: number) =>
    new Promise<void>((resolve) => {
      const c = canvasRef.current;
      if (!c) {
        resolve();
        return;
      }
      const w = c.clientWidth;
      const h = c.clientHeight;
      const top = 18;
      const bottom = h - 36;
      const rowH = (bottom - top) / ROWS;

      let row = 0;
      let slotPos = 0; // cumulative rights
      let x = w / 2;
      let y = 4;

      const step = () => {
        if (row >= path.length) {
          // settle into bucket
          const bw = (w - 16) / table.length;
          const tx = 8 + finalSlot * bw + bw / 2;
          const ty = h - 38;
          const startX = x;
          const startY = y;
          const t0 = performance.now();
          const settle = (now: number) => {
            const p = Math.min(1, (now - t0) / 280);
            const ease = 1 - Math.pow(1 - p, 3);
            x = startX + (tx - startX) * ease;
            y = startY + (ty - startY) * ease;
            drawBoard({ x, y }, finalSlot);
            if (p < 1) animRef.current = requestAnimationFrame(settle);
            else resolve();
          };
          animRef.current = requestAnimationFrame(settle);
          return;
        }

        const right = path[row]! === 1;
        if (right) slotPos += 1;
        const n = row + 3;
        const spacing = (w - 40) / (n - 1 || 1);
        // approximate peg column index
        const pegIdx = Math.min(n - 1, Math.max(0, Math.round(slotPos)));
        const targetX = 20 + pegIdx * spacing + (right ? spacing * 0.25 : -spacing * 0.25);
        const targetY = top + rowH * row + rowH * 0.55;

        const sx = x;
        const sy = y;
        const t0 = performance.now();
        const dur = 70 + row * 4;

        const move = (now: number) => {
          const p = Math.min(1, (now - t0) / dur);
          const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          // slight arc
          const arc = Math.sin(p * Math.PI) * 6;
          x = sx + (targetX - sx) * ease;
          y = sy + (targetY - sy) * ease - arc * 0.3;
          drawBoard({ x, y }, null);
          if (p < 1) {
            animRef.current = requestAnimationFrame(move);
          } else {
            row += 1;
            animRef.current = requestAnimationFrame(step);
          }
        };
        animRef.current = requestAnimationFrame(move);
      };

      animRef.current = requestAnimationFrame(step);
    });

  const play = async () => {
    if (busy || !telegramId) return;
    if (stake > balance) {
      setError("Недостаточно TON");
      return;
    }
    setBusy(true);
    setError(null);
    setHitSlot(null);
    setLast(null);
    drawBoard({ x: (canvasRef.current?.clientWidth || 300) / 2, y: 8 }, null);

    try {
      const res = await fetch("/api/mini/games/plinko/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, stake, risk }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Ошибка");
        setBusy(false);
        return;
      }
      const path: number[] = Array.isArray(d.path) ? d.path : [];
      // ensure path length matches rows
      while (path.length < ROWS) path.push(Math.random() > 0.5 ? 1 : 0);
      await animatePath(path.slice(0, ROWS), Number(d.slot) || 0);
      setHitSlot(Number(d.slot));
      setLast({
        mult: Number(d.multiplier) || 0,
        payout: Number(d.payout) || 0,
        profit: Number(d.profit) || 0,
      });
      onBalanceChange();
    } catch {
      setError("Сеть недоступна");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={wrap}>
      <style>{`
        @keyframes slotPop {
          0% { transform: scale(1); }
          40% { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
      `}</style>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["low", "med", "high"] as Risk[]).map((r) => (
          <button
            key={r}
            type="button"
            disabled={busy}
            onClick={() => {
              setRisk(r);
              setHitSlot(null);
              setLast(null);
            }}
            style={{
              ...chip,
              flex: 1,
              padding: "10px 0",
              borderColor: risk === r ? "rgba(56,189,248,0.65)" : "rgba(255,255,255,0.1)",
              background:
                risk === r
                  ? "linear-gradient(135deg,rgba(14,165,233,0.35),rgba(56,189,248,0.15))"
                  : "rgba(255,255,255,0.05)",
              color: risk === r ? "#7dd3fc" : "#94a3b8",
              boxShadow: risk === r ? "0 0 20px rgba(56,189,248,0.2)" : "none",
            }}
          >
            {r === "low" ? "Low" : r === "med" ? "Med" : "High"}
          </button>
        ))}
      </div>

      <div style={board}>
        <canvas ref={canvasRef} style={{ width: "100%", height: 320, display: "block" }} />
        {last && (
          <div
            style={{
              marginTop: 12,
              textAlign: "center",
              fontWeight: 900,
              fontSize: 18,
              color: last.profit >= 0 ? "#4ade80" : "#f87171",
              textShadow: last.profit >= 0 ? "0 0 20px rgba(74,222,128,0.4)" : "0 0 16px rgba(248,113,113,0.35)",
              animation: "slotPop 0.45s ease",
            }}
          >
            {last.mult}x · {last.profit >= 0 ? "+" : ""}
            {last.profit.toFixed(3)} TON
          </div>
        )}
      </div>

      <div style={row}>
        <label style={lab}>Ставка TON</label>
        <input
          type="number"
          min={MIN_BET}
          step="0.1"
          value={stake}
          disabled={busy}
          onChange={(e) => setStake(Math.max(MIN_BET, Number(e.target.value) || MIN_BET))}
          style={inp}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {PRESETS.map((p) => (
            <button key={p} type="button" disabled={busy} onClick={() => setStake(p)} style={chip}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
        Баланс: <b style={{ color: "#e2e8f0" }}>{balance.toFixed(3)} TON</b>
      </div>
      {error && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{error}</div>}

      <button type="button" disabled={busy || stake > balance} onClick={play} style={btn}>
        {busy ? "Падает…" : `Дропать · ${stake} TON`}
      </button>
    </div>
  );
}

const wrap: CSSProperties = { color: "#e2e8f0" };
const board: CSSProperties = {
  borderRadius: 22,
  padding: "12px 10px 16px",
  marginBottom: 14,
  background: "linear-gradient(180deg,#0c1929 0%,#0a1628 40%,#0f172a 100%)",
  border: "1px solid rgba(56,189,248,0.28)",
  boxShadow: "0 16px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
};
const row: CSSProperties = { marginBottom: 12 };
const lab: CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  marginBottom: 6,
};
const inp: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(0,0,0,0.35)",
  color: "#fff",
  fontSize: 15,
  fontWeight: 700,
  fontFamily: "inherit",
};
const chip: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "#cbd5e1",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
};
const btn: CSSProperties = {
  width: "100%",
  padding: "15px 0",
  borderRadius: 14,
  border: "none",
  background: "linear-gradient(135deg,#0369a1,#22d3ee)",
  color: "#0b1020",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 8px 28px rgba(14,165,233,0.35)",
};
