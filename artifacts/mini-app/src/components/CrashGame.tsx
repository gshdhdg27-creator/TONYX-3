import { useEffect, useRef, useState, type CSSProperties } from "react";

const MIN_BET = 0.1;
const PRESETS = [0.1, 0.5, 1, 2, 5];

type Props = {
  telegramId: string;
  balance: number;
  onBalanceChange: () => void;
};

export default function CrashGame({ telegramId, balance, onBalanceChange }: Props) {
  const [stake, setStake] = useState(0.5);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "flying" | "crash" | "win">("idle");
  const [display, setDisplay] = useState(1);
  const [history, setHistory] = useState<number[]>([2.14, 1.03, 5.67, 1.42, 3.21]);
  const [result, setResult] = useState<null | {
    won: boolean;
    crashPoint: number;
    cashoutAt: number;
    payout: number;
    profit: number;
  }>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoCashout, setAutoCashout] = useState(1.5);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<{ t: number; m: number }[]>([]);
  const animRef = useRef(0);

  const drawGraph = (mult: number, crashed: boolean) => {
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

    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const y = (h / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const pts = pointsRef.current;
    if (pts.length < 2) return;

    const maxM = Math.max(2, mult * 1.15, ...pts.map((p) => p.m));
    const maxT = pts[pts.length - 1]!.t || 1;

    const toX = (t: number) => (t / maxT) * (w - 24) + 8;
    const toY = (m: number) => h - 16 - ((m - 1) / (maxM - 1 || 1)) * (h - 32);

    // glow fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, crashed ? "rgba(248,113,113,0.25)" : "rgba(74,222,128,0.22)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.beginPath();
    ctx.moveTo(toX(pts[0]!.t), h);
    for (const p of pts) ctx.lineTo(toX(p.t), toY(p.m));
    ctx.lineTo(toX(pts[pts.length - 1]!.t), h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // line
    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeStyle = crashed ? "#f87171" : "#4ade80";
    ctx.shadowColor = crashed ? "#f87171" : "#4ade80";
    ctx.shadowBlur = 12;
    for (let i = 0; i < pts.length; i++) {
      const x = toX(pts[i]!.t);
      const y = toY(pts[i]!.m);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // rocket head
    const last = pts[pts.length - 1]!;
    const lx = toX(last.t);
    const ly = toY(last.m);
    ctx.beginPath();
    ctx.arc(lx, ly, 7, 0, Math.PI * 2);
    ctx.fillStyle = crashed ? "#fca5a5" : "#fff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lx, ly, 12, 0, Math.PI * 2);
    ctx.strokeStyle = crashed ? "rgba(248,113,113,0.5)" : "rgba(74,222,128,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  const play = async () => {
    if (busy || phase === "flying") return;
    if (!telegramId) return;
    if (stake > balance) {
      setError("Недостаточно TON");
      return;
    }
    setError(null);
    setResult(null);
    setBusy(true);
    setPhase("flying");
    setDisplay(1);
    pointsRef.current = [{ t: 0, m: 1 }];

    const target = Math.max(1.01, Math.min(100, autoCashout));

    // Start server request in parallel with animation
    const apiPromise = fetch("/api/mini/games/crash/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId, stake, cashoutAt: target }),
    }).then(async (res) => {
      const d = await res.json();
      return { res, d };
    });

    const start = performance.now();
    let resolved = false;
    let serverData: any = null;

    const tick = async (now: number) => {
      const t = (now - start) / 1000;
      // smooth curve
      const m = Math.max(1, Math.pow(Math.E, t * 0.42));
      const show = Math.round(m * 100) / 100;
      setDisplay(show);
      pointsRef.current.push({ t, m: show });
      if (pointsRef.current.length > 180) pointsRef.current.shift();
      drawGraph(show, false);

      if (!resolved && show >= target * 0.92) {
        // wait for server near cashout
        try {
          const { res, d } = await apiPromise;
          resolved = true;
          serverData = { res, d };
        } catch {
          resolved = true;
          serverData = { res: { ok: false }, d: { error: "Сеть" } };
        }
      }

      if (!resolved) {
        animRef.current = requestAnimationFrame(tick);
        return;
      }

      const { res, d } = serverData;
      if (!res.ok) {
        setError(d.error ?? "Ошибка");
        setPhase("idle");
        setBusy(false);
        setDisplay(1);
        return;
      }

      const crash = Number(d.crashPoint);
      const won = !!d.won;

      if (won) {
        // stop at cashout
        setDisplay(target);
        pointsRef.current.push({ t: t + 0.05, m: target });
        drawGraph(target, false);
        setPhase("win");
        setResult({
          won: true,
          crashPoint: crash,
          cashoutAt: target,
          payout: Number(d.payout) || 0,
          profit: Number(d.profit) || 0,
        });
        setHistory((h) => [target, ...h].slice(0, 8));
      } else {
        // continue to crash point if higher, else snap crash
        const crashShow = Math.max(crash, 1);
        setDisplay(crashShow);
        pointsRef.current.push({ t: t + 0.08, m: crashShow });
        drawGraph(crashShow, true);
        setPhase("crash");
        setResult({
          won: false,
          crashPoint: crash,
          cashoutAt: target,
          payout: 0,
          profit: Number(d.profit) || -stake,
        });
        setHistory((h) => [crash, ...h].slice(0, 8));
      }
      onBalanceChange();
      setBusy(false);
    };

    animRef.current = requestAnimationFrame(tick);
  };

  const multColor =
    phase === "crash" ? "#f87171" : phase === "win" ? "#4ade80" : phase === "flying" ? "#fbbf24" : "#e2e8f0";

  return (
    <div style={wrap}>
      <style>{`
        @keyframes crashPulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.06); opacity: 0.85; }
        }
        @keyframes winGlow {
          0%,100% { box-shadow: 0 0 24px rgba(74,222,128,0.25); }
          50% { box-shadow: 0 0 48px rgba(74,222,128,0.55); }
        }
        @keyframes rocketShake {
          0%,100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
      `}</style>

      {/* history strip */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 12, paddingBottom: 4 }}>
        {history.map((h, i) => (
          <span
            key={i}
            style={{
              flexShrink: 0,
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 800,
              background: h >= 2 ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
              color: h >= 2 ? "#4ade80" : "#f87171",
              border: `1px solid ${h >= 2 ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
            }}
          >
            {h.toFixed(2)}x
          </span>
        ))}
      </div>

      <div
        style={{
          ...panel,
          animation:
            phase === "crash"
              ? "crashPulse 0.45s ease 2"
              : phase === "win"
                ? "winGlow 1.2s ease infinite"
                : undefined,
          borderColor:
            phase === "crash"
              ? "rgba(248,113,113,0.55)"
              : phase === "win"
                ? "rgba(74,222,128,0.5)"
                : "rgba(167,139,250,0.35)",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: 160, display: "block", marginBottom: 8 }}
        />
        <div
          style={{
            fontSize: 56,
            fontWeight: 900,
            color: multColor,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.04em",
            textShadow: phase === "flying" ? `0 0 28px ${multColor}88` : undefined,
            animation: phase === "flying" ? "rocketShake 0.4s ease infinite" : undefined,
          }}
        >
          {display.toFixed(2)}x
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, fontWeight: 600 }}>
          {phase === "flying" && "🚀 В полёте…"}
          {phase === "crash" && "💥 CRASHED"}
          {phase === "win" && "✅ CASHED OUT"}
          {phase === "idle" && "Ждём раунд"}
        </div>
        {result && (
          <div
            style={{
              marginTop: 12,
              fontSize: 14,
              fontWeight: 800,
              color: result.won ? "#4ade80" : "#f87171",
            }}
          >
            {result.won
              ? `+${result.profit.toFixed(3)} TON · кэш ${result.cashoutAt.toFixed(2)}x`
              : `Краш ${result.crashPoint.toFixed(2)}x · −${stake.toFixed(3)} TON`}
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

      <div style={row}>
        <label style={lab}>Авто-кэшаут</label>
        <input
          type="number"
          min={1.01}
          max={100}
          step="0.1"
          value={autoCashout}
          disabled={busy}
          onChange={(e) => setAutoCashout(Math.max(1.01, Number(e.target.value) || 1.5))}
          style={inp}
        />
      </div>

      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
        Баланс: <b style={{ color: "#e2e8f0" }}>{balance.toFixed(3)} TON</b>
      </div>
      {error && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{error}</div>}

      <button type="button" disabled={busy || stake > balance} onClick={play} style={btn}>
        {busy ? "В игре…" : `🚀 Играть · ${stake} TON`}
      </button>
    </div>
  );
}

const wrap: CSSProperties = { color: "#e2e8f0" };
const panel: CSSProperties = {
  borderRadius: 22,
  padding: "16px 14px 20px",
  textAlign: "center",
  marginBottom: 16,
  background: "linear-gradient(165deg,#1a1035 0%,#0b1020 55%,#0f172a 100%)",
  border: "1px solid rgba(167,139,250,0.35)",
  boxShadow: "0 16px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
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
  background: "linear-gradient(135deg,#7c3aed,#a855f7 50%,#c084fc)",
  color: "#fff",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 8px 28px rgba(124,58,237,0.4)",
};
