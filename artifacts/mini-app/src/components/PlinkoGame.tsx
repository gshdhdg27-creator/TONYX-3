import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

const MIN_BET = 0.1;
const PRESETS = [0.1, 0.5, 1, 2, 5];

type Risk = "low" | "med" | "high";

/** Multipliers: slots = rows + 1. High/12 matches the reference image exactly. */
function buildTable(rows: number, risk: Risk): number[] {
  if (rows === 12 && risk === "high")
    return [76, 17, 6, 2.2, 0.8, 0.2, 0.1, 0.2, 0.8, 2.2, 6, 17, 76];
  if (rows === 12 && risk === "med")
    return [13, 6, 3, 1.5, 0.7, 0.5, 0.4, 0.5, 0.7, 1.5, 3, 6, 13];
  if (rows === 12 && risk === "low")
    return [4, 2.2, 1.4, 1.1, 1, 0.9, 0.8, 0.9, 1, 1.1, 1.4, 2.2, 4];
  if (rows === 8 && risk === "high") return [29, 8, 2.5, 0.8, 0.4, 0.8, 2.5, 8, 29];
  if (rows === 8 && risk === "med") return [5.6, 2.1, 1.1, 0.8, 0.6, 0.8, 1.1, 2.1, 5.6];
  if (rows === 8 && risk === "low") return [2.5, 1.5, 1.2, 1, 0.9, 1, 1.2, 1.5, 2.5];
  if (rows === 16 && risk === "high")
    return [170, 45, 12, 5, 2.2, 0.8, 0.4, 0.2, 0.1, 0.2, 0.4, 0.8, 2.2, 5, 12, 45, 170];
  if (rows === 16 && risk === "med")
    return [16, 9, 4, 2, 1.2, 0.7, 0.5, 0.4, 0.3, 0.4, 0.5, 0.7, 1.2, 2, 4, 9, 16];
  if (rows === 16 && risk === "low")
    return [5, 2.5, 1.6, 1.2, 1, 0.9, 0.8, 0.7, 0.7, 0.7, 0.8, 0.9, 1, 1.2, 1.6, 2.5, 5];

  const n = rows + 1;
  const half = (n - 1) / 2;
  const edge = risk === "high" ? 90 : risk === "med" ? 14 : 4;
  const mid = risk === "high" ? 0.15 : risk === "med" ? 0.45 : 0.85;
  return Array.from({ length: n }, (_, i) => {
    const d = Math.abs(i - half) / Math.max(half, 1);
    let m = mid + (edge - mid) * Math.pow(d, risk === "high" ? 2.6 : 1.7);
    if (m >= 10) m = Math.round(m);
    else if (m >= 2) m = Math.round(m * 10) / 10;
    else m = Math.round(m * 100) / 100;
    return m;
  });
}

/** Pink edges → orange → yellow → green center (like reference) */
function bucketColor(m: number, max: number): string {
  const t = max > 0 ? Math.min(1, m / max) : 0;
  if (t >= 0.7) return "#ff4d8d";
  if (t >= 0.45) return "#ff7a45";
  if (t >= 0.28) return "#ffb020";
  if (t >= 0.15) return "#e8d44a";
  if (t >= 0.08) return "#9fd84a";
  return "#3dd68c";
}

function haptic(t: "light" | "medium" | "heavy" = "light") {
  try {
    (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(t);
  } catch {
    /* */
  }
}
function hapticNotify(t: "success" | "error") {
  try {
    (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(t);
  } catch {
    /* */
  }
}

/**
 * Peg geometry: for `rows` decision rows, draw `rows` peg-rows.
 * Row r (0..rows-1) has (r + 3) pegs — top starts at 3 like the reference.
 * Bottom gaps ≈ rows+1 buckets.
 */
function pegPositions(rows: number, W: number, topY: number, pegAreaH: number, padX: number) {
  const pts: { x: number; y: number; r: number }[][] = [];
  for (let r = 0; r < rows; r++) {
    const count = r + 3;
    const y = topY + ((r + 0.55) / rows) * pegAreaH;
    // Bottom row spans nearly full width between pads
    const spanFrac = (count - 1) / (rows + 2); // grows with row
    const usable = W - padX * 2;
    const span = usable * Math.min(1, spanFrac * 1.05 + 0.15);
    const row: { x: number; y: number; r: number }[] = [];
    for (let c = 0; c < count; c++) {
      const x =
        count === 1 ? W / 2 : W / 2 - span / 2 + (c / (count - 1)) * span;
      row.push({ x, y, r });
    }
    pts.push(row);
  }
  return pts;
}

export default function PlinkoGame({
  telegramId,
  balance,
  onBalanceChange,
}: {
  telegramId: string;
  balance: number;
  onBalanceChange: () => void;
}) {
  const [stake, setStake] = useState(0.5);
  const [risk, setRisk] = useState<Risk>("high");
  const [rows, setRows] = useState(12);
  const [busy, setBusy] = useState(false);
  const [hit, setHit] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [last, setLast] = useState<null | { mult: number; profit: number }>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ballRef = useRef<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });
  const animRef = useRef(0);
  const pegsRef = useRef<{ x: number; y: number; r: number }[][]>([]);

  const table = useMemo(() => buildTable(rows, risk), [rows, risk]);
  const maxM = useMemo(() => Math.max(...table, 1), [table]);

  const draw = useCallback(
    (highlight: number | null) => {
      const c = canvasRef.current;
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = c.clientWidth;
      const H = c.clientHeight;
      if (c.width !== Math.floor(W * dpr) || c.height !== Math.floor(H * dpr)) {
        c.width = Math.floor(W * dpr);
        c.height = Math.floor(H * dpr);
      }
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // background already on container — soft vignette stars
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      const stars = [
        [0.12, 0.08],
        [0.88, 0.1],
        [0.2, 0.35],
        [0.8, 0.32],
        [0.08, 0.55],
        [0.92, 0.5],
        [0.15, 0.75],
        [0.85, 0.7],
      ];
      for (const [sx, sy] of stars) {
        ctx.beginPath();
        ctx.arc(sx * W, sy * H, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }

      const padX = 16;
      const topY = 40;
      const bucketH = 38;
      const pegAreaH = H - topY - bucketH - 6;
      const slots = table.length;

      // ——— gold dropper ———
      const dx = W / 2;
      const dy = 12;
      const g = ctx.createLinearGradient(dx - 30, dy, dx + 30, dy + 14);
      g.addColorStop(0, "#ffe9a8");
      g.addColorStop(0.5, "#f5c542");
      g.addColorStop(1, "#c99212");
      ctx.fillStyle = g;
      ctx.shadowColor = "rgba(245,197,66,0.7)";
      ctx.shadowBlur = 14;
      roundRect(ctx, dx - 28, dy, 56, 14, 7);
      ctx.fill();
      ctx.shadowBlur = 0;

      // ——— pegs ———
      const pegs = pegPositions(rows, W, topY, pegAreaH, padX);
      pegsRef.current = pegs;
      const pegR = Math.max(3, Math.min(5, (W - padX * 2) / (rows * 2.8)));

      for (const row of pegs) {
        for (const p of row) {
          const gg = ctx.createRadialGradient(
            p.x - pegR * 0.35,
            p.y - pegR * 0.35,
            0,
            p.x,
            p.y,
            pegR,
          );
          gg.addColorStop(0, "#ffffff");
          gg.addColorStop(0.35, "#ddd6fe");
          gg.addColorStop(1, "#8b5cf6");
          ctx.beginPath();
          ctx.arc(p.x, p.y, pegR, 0, Math.PI * 2);
          ctx.fillStyle = gg;
          ctx.fill();
          // specular
          ctx.beginPath();
          ctx.arc(p.x - pegR * 0.28, p.y - pegR * 0.28, pegR * 0.28, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.65)";
          ctx.fill();
        }
      }

      // ——— buckets ———
      const bw = (W - padX * 2) / slots;
      table.forEach((m, i) => {
        const x = padX + i * bw;
        const y = H - bucketH;
        const col = bucketColor(m, maxM);
        const active = highlight === i;
        ctx.shadowColor = active ? col : "transparent";
        ctx.shadowBlur = active ? 16 : 0;
        ctx.fillStyle = col;
        roundRect(ctx, x + 1.5, y, bw - 3, bucketH - 8, 8);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (active) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          roundRect(ctx, x + 1.5, y, bw - 3, bucketH - 8, 8);
          ctx.stroke();
        }
        ctx.fillStyle = "#1a1030";
        const fs = Math.max(7, Math.min(11, bw * 0.38));
        ctx.font = `800 ${fs}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const label = m >= 10 ? `×${Math.round(m)}` : `×${m}`;
        ctx.fillText(label, x + bw / 2, y + (bucketH - 8) / 2);
      });

      // ——— ball ———
      const b = ballRef.current;
      if (b.visible) {
        const br = Math.max(5.5, pegR * 1.25);
        ctx.beginPath();
        ctx.arc(b.x, b.y, br, 0, Math.PI * 2);
        const bg = ctx.createRadialGradient(b.x - 2, b.y - 2, 0, b.x, b.y, br);
        bg.addColorStop(0, "#ffffff");
        bg.addColorStop(0.4, "#e9d5ff");
        bg.addColorStop(1, "#a855f7");
        ctx.fillStyle = bg;
        ctx.shadowColor = "#c084fc";
        ctx.shadowBlur = 18;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    },
    [rows, table, maxM],
  );

  useEffect(() => {
    draw(hit);
  }, [draw, hit, risk, rows]);

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
      if (!pegs.length) {
        resolve();
        return;
      }

      // Start above first row, center
      const first = pegs[0]!;
      const startX = first.length ? (first[0]!.x + first[first.length - 1]!.x) / 2 : 0;
      ballRef.current = {
        x: startX,
        y: first[0]!.y - 22,
        visible: true,
      };

      let step = 0;
      let pegIndex = 0; // which peg in current row we "hit" near

      const go = () => {
        if (step >= path.length || step >= pegs.length) {
          // fall into bucket
          const c = canvasRef.current;
          const W = c?.clientWidth ?? 300;
          const H = c?.clientHeight ?? 360;
          const padX = 16;
          const bw = (W - padX * 2) / table.length;
          const targetX = padX + finalSlot * bw + bw / 2;
          const targetY = H - 20;
          const fromX = ballRef.current.x;
          const fromY = ballRef.current.y;
          const t0 = performance.now();
          const tick = (now: number) => {
            const p = Math.min(1, (now - t0) / 220);
            const e = 1 - Math.pow(1 - p, 2);
            ballRef.current.x = fromX + (targetX - fromX) * e;
            ballRef.current.y = fromY + (targetY - fromY) * e;
            draw(p > 0.85 ? finalSlot : null);
            if (p < 1) animRef.current = requestAnimationFrame(tick);
            else {
              setHit(finalSlot);
              haptic("medium");
              resolve();
            }
          };
          animRef.current = requestAnimationFrame(tick);
          return;
        }

        const right = path[step]! === 1;
        pegIndex = Math.min(
          pegIndex + (right ? 1 : 0),
          (pegs[step]?.length ?? 1) - 1,
        );
        // aim slightly left/right of peg center
        const row = pegs[step]!;
        const idx = Math.min(Math.max(pegIndex, 0), row.length - 1);
        const peg = row[idx]!;
        const offset = right ? 10 : -10;
        const toX = peg.x + offset;
        const toY = peg.y;

        const fromX = ballRef.current.x;
        const fromY = ballRef.current.y;
        const t0 = performance.now();
        const dur = 70 + Math.min(40, step * 2);

        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / dur);
          // arc: bounce over peg
          const e = p;
          const arc = Math.sin(p * Math.PI) * 8;
          ballRef.current.x = fromX + (toX - fromX) * e;
          ballRef.current.y = fromY + (toY - fromY) * e - arc;
          draw(null);
          if (p < 1) animRef.current = requestAnimationFrame(tick);
          else {
            haptic("light");
            step += 1;
            go();
          }
        };
        animRef.current = requestAnimationFrame(tick);
      };

      go();
    });

  const play = async () => {
    if (busy || !telegramId) return;
    if (stake > balance) {
      flash("Недостаточно TON");
      return;
    }
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
      // ensure pegs drawn before anim
      draw(null);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await animatePath(Array.isArray(d.path) ? d.path : [], Number(d.slot) || 0);
      const profit = Number(d.profit) || 0;
      setLast({ mult: Number(d.multiplier) || 0, profit });
      if (profit >= 0) hapticNotify("success");
      else hapticNotify("error");
      flash(
        profit >= 0
          ? `+${profit.toFixed(3)} TON  ·  ×${d.multiplier}`
          : `${profit.toFixed(3)} TON`,
      );
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

      <div style={seg}>
        {(
          [
            ["low", "Лёгкий"],
            ["med", "Средний"],
            ["high", "Сложный"],
          ] as [Risk, string][]
        ).map(([r, label]) => (
          <button
            key={r}
            type="button"
            disabled={busy}
            onClick={() => {
              setRisk(r);
              setHit(null);
            }}
            style={{
              ...segBtn,
              background:
                risk === r
                  ? "linear-gradient(135deg,#6d28d9,#a855f7)"
                  : "transparent",
              color: risk === r ? "#fff" : "#94a3b8",
              boxShadow: risk === r ? "0 4px 16px rgba(168,85,247,0.4)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>Количество рядов</span>
          <span style={{ fontSize: 13, fontWeight: 900, color: "#e9d5ff" }}>{rows}</span>
        </div>
        <input
          type="range"
          min={8}
          max={16}
          step={1}
          value={rows}
          disabled={busy}
          onChange={(e) => {
            setRows(Number(e.target.value));
            setHit(null);
          }}
          style={{ width: "100%", accentColor: "#a855f7" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b" }}>
          <span>8</span>
          <span>16</span>
        </div>
      </div>

      <div style={board}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      </div>

      {last && (
        <div
          style={{
            textAlign: "center",
            fontWeight: 900,
            fontSize: 17,
            marginBottom: 10,
            color: last.profit >= 0 ? "#4ade80" : "#f87171",
          }}
        >
          ×{last.mult} → {last.profit >= 0 ? "+" : ""}
          {last.profit.toFixed(3)} TON
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
            <button key={p} type="button" disabled={busy} onClick={() => setStake(p)} style={chip}>
              {p}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "#64748b", margin: "12px 0" }}>
          Баланс <b style={{ color: "#e2e8f0" }}>{balance.toFixed(3)} TON</b>
        </div>
        <button type="button" disabled={busy || stake > balance} onClick={play} style={btn}>
          {busy ? "Падает…" : "Играть"}
        </button>
      </div>
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const root: CSSProperties = { color: "#e2e8f0", position: "relative" };
const seg: CSSProperties = {
  display: "flex",
  gap: 4,
  padding: 4,
  borderRadius: 14,
  background: "rgba(0,0,0,0.35)",
  border: "1px solid rgba(255,255,255,0.08)",
  marginBottom: 12,
};
const segBtn: CSSProperties = {
  flex: 1,
  padding: "10px 0",
  borderRadius: 11,
  border: "none",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "0.15s",
};
const board: CSSProperties = {
  height: 360,
  borderRadius: 28,
  overflow: "hidden",
  marginBottom: 12,
  background:
    "radial-gradient(ellipse 90% 70% at 50% 0%, #5b21b6 0%, #2e1065 45%, #0c0618 100%)",
  border: "1px solid rgba(167,139,250,0.4)",
  boxShadow:
    "0 0 60px rgba(124,58,237,0.25), inset 0 1px 0 rgba(255,255,255,0.08)",
};
const panel: CSSProperties = {
  background: "rgba(15,23,42,0.85)",
  borderRadius: 18,
  padding: 14,
  border: "1px solid rgba(255,255,255,0.08)",
};
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
  background: "rgba(0,0,0,0.4)",
  color: "#fff",
  fontSize: 16,
  fontWeight: 800,
  fontFamily: "inherit",
};
const chip: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)",
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
  background: "linear-gradient(135deg,#7c3aed,#c084fc)",
  color: "#fff",
  fontSize: 16,
  fontWeight: 900,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 8px 28px rgba(168,85,247,0.45)",
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
