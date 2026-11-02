import { useMemo, useRef, useState, type CSSProperties } from "react";

const MIN_BET = 0.1;
const PRESETS = [0.1, 0.5, 1, 2, 5];
const HOUSE = 0.04;

type Props = {
  telegramId: string;
  balance: number;
  onBalanceChange: () => void;
};

export default function UpgradeGame({ telegramId, balance, onBalanceChange }: Props) {
  const [stake, setStake] = useState(0.5);
  const [chance, setChance] = useState(40);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [needle, setNeedle] = useState(-1); // degrees 0-360 mapped from roll
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<null | { won: boolean; payout: number; profit: number; roll: number }>(null);
  const [flash, setFlash] = useState<"win" | "lose" | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const mult = useMemo(
    () => Math.round(((100 / chance) * (1 - HOUSE)) * 1000) / 1000,
    [chance],
  );
  const potential = useMemo(() => Math.round(stake * mult * 1000) / 1000, [stake, mult]);

  const drawWheel = (pointerDeg: number, animChance: number) => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const size = Math.min(c.clientWidth, 280);
    if (c.width !== size * dpr || c.height !== size * dpr) {
      c.width = size * dpr;
      c.height = size * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 12;
    ctx.clearRect(0, 0, size, size);

    // outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 10;
    ctx.stroke();

    // lose arc (full circle base)
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "#7f1d1d";
    ctx.lineWidth = 22;
    ctx.lineCap = "butt";
    ctx.stroke();

    // win arc from top, clockwise amount = chance%
    const winAngle = (animChance / 100) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + winAngle);
    const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    grad.addColorStop(0, "#16a34a");
    grad.addColorStop(1, "#4ade80");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 22;
    ctx.stroke();

    // inner disk
    ctx.beginPath();
    ctx.arc(cx, cy, r - 28, 0, Math.PI * 2);
    const ig = ctx.createRadialGradient(cx, cy - 20, 0, cx, cy, r - 28);
    ig.addColorStop(0, "#2a1848");
    ig.addColorStop(1, "#0f0a1a");
    ctx.fillStyle = ig;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // center text
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "900 28px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${animChance}%`, cx, cy - 8);
    ctx.font = "700 12px system-ui";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(`${mult}x`, cx, cy + 16);

    // pointer needle from center
    if (pointerDeg >= 0) {
      const rad = ((pointerDeg - 90) * Math.PI) / 180;
      const nx = cx + Math.cos(rad) * (r - 8);
      const ny = cy + Math.sin(rad) * (r - 8);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(nx, ny);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#fff";
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(nx, ny, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#f472b6";
      ctx.fill();
    }
  };

  // redraw on chance change
  useMemo(() => {
    requestAnimationFrame(() => drawWheel(needle, chance));
  }, [chance, mult, needle]);

  const play = async () => {
    if (busy || !telegramId) return;
    if (stake > balance) {
      setError("Недостаточно TON");
      return;
    }
    setBusy(true);
    setSpinning(true);
    setError(null);
    setLast(null);
    setFlash(null);

    try {
      const res = await fetch("/api/mini/games/upgrade/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, stake, chance }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Ошибка");
        setSpinning(false);
        setBusy(false);
        return;
      }

      const roll = Number(d.roll) || 0; // 0..100
      const targetDeg = (roll / 100) * 360;
      // spin multiple revolutions then land
      const totalSpin = 360 * 4 + targetDeg;
      const start = performance.now();
      const dur = 2200;

      await new Promise<void>((resolve) => {
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / dur);
          // ease out cubic
          const ease = 1 - Math.pow(1 - p, 3);
          const deg = totalSpin * ease;
          setNeedle(deg % 360);
          drawWheel(deg % 360, chance);
          if (p < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });

      setNeedle(targetDeg);
      drawWheel(targetDeg, chance);
      const won = !!d.won;
      setFlash(won ? "win" : "lose");
      setLast({
        won,
        payout: Number(d.payout) || 0,
        profit: Number(d.profit) || 0,
        roll,
      });
      onBalanceChange();
    } catch {
      setError("Сеть недоступна");
    } finally {
      setSpinning(false);
      setBusy(false);
    }
  };

  return (
    <div style={wrap}>
      <style>{`
        @keyframes upWin {
          0%,100% { box-shadow: 0 0 24px rgba(74,222,128,0.25); }
          50% { box-shadow: 0 0 50px rgba(74,222,128,0.55); }
        }
        @keyframes upLose {
          0%,100% { box-shadow: 0 0 16px rgba(248,113,113,0.2); }
          50% { box-shadow: 0 0 36px rgba(248,113,113,0.45); }
        }
      `}</style>

      <div
        style={{
          ...panel,
          animation:
            flash === "win"
              ? "upWin 0.9s ease 3"
              : flash === "lose"
                ? "upLose 0.7s ease 2"
                : undefined,
          borderColor:
            flash === "win"
              ? "rgba(74,222,128,0.55)"
              : flash === "lose"
                ? "rgba(248,113,113,0.5)"
                : "rgba(244,114,182,0.35)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center" }}>
          <canvas
            ref={canvasRef}
            style={{ width: "min(100%, 280px)", height: "min(100vw, 280px)", maxHeight: 280 }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
          <div style={stat}>
            <div style={statL}>Шанс</div>
            <div style={statV}>{chance}%</div>
          </div>
          <div style={stat}>
            <div style={statL}>Множитель</div>
            <div style={statV}>{mult}x</div>
          </div>
          <div style={stat}>
            <div style={statL}>Ставка</div>
            <div style={statV}>{stake} TON</div>
          </div>
          <div style={stat}>
            <div style={statL}>Выплата</div>
            <div style={{ ...statV, color: "#4ade80" }}>{potential} TON</div>
          </div>
        </div>

        {last && (
          <div
            style={{
              marginTop: 14,
              textAlign: "center",
              fontWeight: 900,
              fontSize: 17,
              color: last.won ? "#4ade80" : "#f87171",
            }}
          >
            {last.won
              ? `Успех! +${last.profit.toFixed(3)} TON`
              : `Мимо (${last.roll.toFixed(1)}%) · −${stake} TON`}
          </div>
        )}
      </div>

      <div style={row}>
        <label style={lab}>Шанс победы: {chance}%</label>
        <input
          type="range"
          min={5}
          max={90}
          value={chance}
          disabled={busy}
          onChange={(e) => {
            const v = Number(e.target.value);
            setChance(v);
            setFlash(null);
            drawWheel(needle, v);
          }}
          style={{ width: "100%", accentColor: "#f472b6" }}
        />
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
        {spinning ? "Крутим…" : `⬆️ Upgrade · ${stake} TON`}
      </button>
    </div>
  );
}

const wrap: CSSProperties = { color: "#e2e8f0" };
const panel: CSSProperties = {
  borderRadius: 22,
  padding: 16,
  marginBottom: 14,
  background: "linear-gradient(165deg,#3b0764 0%,#1a0a2e 45%,#0f0a1a 100%)",
  border: "1px solid rgba(244,114,182,0.35)",
  boxShadow: "0 16px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
};
const stat: CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  borderRadius: 12,
  padding: "10px 12px",
  border: "1px solid rgba(255,255,255,0.08)",
};
const statL: CSSProperties = { fontSize: 10, color: "#94a3b8", fontWeight: 700 };
const statV: CSSProperties = { fontSize: 16, fontWeight: 900, marginTop: 2 };
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
  background: "linear-gradient(135deg,#be185d,#f472b6 55%,#fbcfe8)",
  color: "#1a0a14",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 8px 28px rgba(219,39,119,0.4)",
};
