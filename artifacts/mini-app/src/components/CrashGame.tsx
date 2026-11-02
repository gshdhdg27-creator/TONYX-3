import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

const MIN_BET = 0.1;
const PRESETS = [0.1, 0.5, 1, 2, 5, 10];

function haptic(t: "light" | "medium" | "heavy" = "light") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(t); } catch { /* */ }
}
function hapticNotify(t: "success" | "error") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(t); } catch { /* */ }
}

type Hist = { mult: number; won: boolean };

export default function CrashGame({
  telegramId, balance, onBalanceChange,
}: { telegramId: string; balance: number; onBalanceChange: () => void }) {
  const [stake, setStake] = useState(0.5);
  const [autoCashout, setAutoCashout] = useState(2);
  const [busy, setBusy] = useState(false);
  const [mult, setMult] = useState(1);
  const [phase, setPhase] = useState<"idle" | "fly" | "crash" | "win">("idle");
  const [toast, setToast] = useState<string | null>(null);
  const [history, setHistory] = useState<Hist[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<{ t: number; m: number }[]>([{ t: 0, m: 1 }]);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const wonRef = useRef(false);

  const draw = useCallback((current: number, crashed: boolean) => {
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

    ctx.strokeStyle = "rgba(255,255,255,0.045)";
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
    const maxT = Math.max(pts[pts.length - 1]!.t, 0.001);
    const maxM = Math.max(current, 2, ...pts.map((p) => p.m));
    const xOf = (t: number) => (t / maxT) * (w - 24) + 8;
    const yOf = (m: number) => h - 16 - ((m - 1) / (maxM - 1 || 1)) * (h - 32);

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (crashed && !wonRef.current) {
      grad.addColorStop(0, "rgba(248,113,113,0.4)");
      grad.addColorStop(1, "rgba(248,113,113,0)");
    } else {
      grad.addColorStop(0, "rgba(74,222,128,0.4)");
      grad.addColorStop(1, "rgba(74,222,128,0)");
    }
    ctx.beginPath();
    ctx.moveTo(xOf(pts[0]!.t), h);
    for (const p of pts) ctx.lineTo(xOf(p.t), yOf(p.m));
    ctx.lineTo(xOf(pts[pts.length - 1]!.t), h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.lineWidth = 3.5;
    ctx.lineJoin = "round";
    ctx.strokeStyle = crashed && !wonRef.current ? "#f87171" : "#4ade80";
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 14;
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(xOf(p.t), yOf(p.m)) : ctx.lineTo(xOf(p.t), yOf(p.m))));
    ctx.stroke();
    ctx.shadowBlur = 0;

    const last = pts[pts.length - 1]!;
    const x = xOf(last.t);
    const y = yOf(last.m);
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;

    if (!crashed) {
      for (let i = 0; i < 8; i++) {
        const j = Math.max(0, pts.length - 1 - i * 2);
        const p = pts[j]!;
        ctx.beginPath();
        ctx.arc(xOf(p.t) - i * 1.5, yOf(p.m) + i * 0.8, Math.max(1, 4 - i * 0.45), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(74,222,128,${0.55 - i * 0.06})`;
        ctx.fill();
      }
    }
  }, []);

  useEffect(() => { draw(1, false); }, [draw]);
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const play = async () => {
    if (busy || !telegramId) return;
    if (stake > balance) { flash("Недостаточно TON"); return; }
    const target = Math.max(1.01, Math.min(100, autoCashout));
    setBusy(true);
    setPhase("fly");
    setMult(1);
    pointsRef.current = [{ t: 0, m: 1 }];
    wonRef.current = false;
    haptic("medium");

    let serverData: any = null;
    const apiP = fetch("/api/mini/games/crash/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId, stake, cashoutAt: target }),
    }).then(async (r) => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Ошибка");
      return d;
    });

    startRef.current = performance.now();
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        const t = (now - startRef.current) / 1000;
        const m = Math.min(target * 1.02, 1 + (Math.exp(t * 0.55) - 1) * 0.85);
        const rounded = Math.round(m * 100) / 100;
        pointsRef.current.push({ t, m: rounded });
        if (pointsRef.current.length > 500) pointsRef.current.shift();
        setMult(rounded);
        draw(rounded, false);
        if (serverData) {
          if (rounded >= Math.min(target, Number(serverData.crashPoint) || target) * 0.96 || rounded >= target * 0.98) {
            resolve();
            return;
          }
        }
        if (rounded < target * 0.98) rafRef.current = requestAnimationFrame(tick);
        else resolve();
      };
      rafRef.current = requestAnimationFrame(tick);
      apiP.then((d) => { serverData = d; }).catch((e) => { serverData = { error: e.message }; });
    });
    cancelAnimationFrame(rafRef.current);

    try {
      const d = serverData ?? (await apiP);
      if (d.error) {
        flash(d.error);
        setPhase("idle");
        setBusy(false);
        setMult(1);
        return;
      }
      const crash = Number(d.crashPoint);
      wonRef.current = !!d.won;

      if (d.won) {
        setMult(target);
        pointsRef.current.push({ t: pointsRef.current[pointsRef.current.length - 1]!.t + 0.05, m: target });
        draw(target, false);
        setPhase("win");
        hapticNotify("success");
        flash(`+${Number(d.profit).toFixed(3)} TON  ·  ${target}x`);
        setHistory((h) => [{ mult: target, won: true }, ...h].slice(0, 14));
      } else {
        const from = mult;
        const end = Math.max(crash, 1);
        const t0 = performance.now();
        await new Promise<void>((resolve) => {
          const tick = (now: number) => {
            const p = Math.min(1, (now - t0) / 480);
            const m = from + (end - from) * p;
            const rounded = Math.round(m * 100) / 100;
            const t = pointsRef.current[pointsRef.current.length - 1]!.t + 0.02;
            pointsRef.current.push({ t, m: rounded });
            setMult(rounded);
            draw(rounded, p > 0.8);
            if (p < 1) rafRef.current = requestAnimationFrame(tick);
            else resolve();
          };
          rafRef.current = requestAnimationFrame(tick);
        });
        setPhase("crash");
        hapticNotify("error");
        haptic("heavy");
        flash(`CRASH ${crash.toFixed(2)}x`);
        setHistory((h) => [{ mult: crash, won: false }, ...h].slice(0, 14));
      }
      onBalanceChange();
    } catch (e: any) {
      flash(e?.message || "Сеть");
      setPhase("idle");
    } finally {
      setBusy(false);
      setTimeout(() => setPhase("idle"), 2000);
    }
  };

  const multColor =
    phase === "crash" ? "#f87171" : phase === "win" ? "#4ade80" : phase === "fly" ? "#fbbf24" : "#e2e8f0";

  return (
    <div style={root}>
      <style>{`
        @keyframes crashPulse { 0%,100%{text-shadow:0 0 18px currentColor} 50%{text-shadow:0 0 42px currentColor,0 0 80px currentColor} }
        @keyframes crashShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
        .cm.fly{animation:crashPulse .75s ease-in-out infinite}
        .cm.crash{animation:crashShake .45s ease-in-out;color:#f87171!important}
        .cm.win{color:#4ade80!important;animation:crashPulse 1s ease-in-out infinite}
      `}</style>
      {toast && <div style={toastStyle}>{toast}</div>}
      <div style={histRow}>
        {history.length === 0 && <span style={{ color: "#475569", fontSize: 11 }}>история</span>}
        {history.map((h, i) => (
          <span key={i} style={{
            ...histChip,
            color: h.won ? "#86efac" : "#fca5a5",
            borderColor: h.won ? "rgba(74,222,128,0.35)" : "rgba(248,113,113,0.35)",
            background: h.won ? "rgba(22,163,74,0.15)" : "rgba(185,28,28,0.15)",
          }}>{h.mult.toFixed(2)}x</span>
        ))}
      </div>
      <div style={graphWrap}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
        <div className={`cm ${phase}`} style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none", fontSize: 54, fontWeight: 900, letterSpacing: "-0.04em",
          color: multColor, fontVariantNumeric: "tabular-nums",
        }}>{mult.toFixed(2)}x</div>
        {phase === "crash" && <div style={crashBanner}>CRASHED</div>}
      </div>
      <div style={panel}>
        <div style={field}>
          <span style={lab}>Ставка</span>
          <input type="number" min={MIN_BET} step="0.1" value={stake} disabled={busy}
            onChange={(e) => setStake(Math.max(MIN_BET, Number(e.target.value) || MIN_BET))} style={inp} />
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {PRESETS.map((p) => (
              <button key={p} type="button" disabled={busy} onClick={() => setStake(p)} style={chip}>{p}</button>
            ))}
          </div>
        </div>
        <div style={field}>
          <span style={lab}>Авто-кэшаут</span>
          <input type="number" min={1.01} max={100} step="0.1" value={autoCashout} disabled={busy}
            onChange={(e) => setAutoCashout(Math.max(1.01, Number(e.target.value) || 2))} style={inp} />
        </div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
          Баланс <b style={{ color: "#e2e8f0" }}>{balance.toFixed(3)} TON</b>
          {" · "}Потенциал <b style={{ color: "#4ade80" }}>{(stake * autoCashout).toFixed(3)} TON</b>
        </div>
        <button type="button" disabled={busy || stake > balance} onClick={play} style={btn}>
          {busy ? (phase === "fly" ? "Полёт…" : "…") : "🚀  Играть"}
        </button>
      </div>
    </div>
  );
}

const root: CSSProperties = { color: "#e2e8f0", position: "relative" };
const histRow: CSSProperties = { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10, minHeight: 28 };
const histChip: CSSProperties = { flexShrink: 0, fontSize: 11, fontWeight: 800, padding: "4px 8px", borderRadius: 8, border: "1px solid" };
const graphWrap: CSSProperties = {
  position: "relative", height: 230, borderRadius: 20, overflow: "hidden", marginBottom: 14,
  background: "linear-gradient(180deg,#0c1222 0%,#06080f 100%)",
  border: "1px solid rgba(74,222,128,0.22)",
  boxShadow: "0 0 40px rgba(74,222,128,0.1), inset 0 1px 0 rgba(255,255,255,0.04)",
};
const crashBanner: CSSProperties = {
  position: "absolute", left: 0, right: 0, bottom: 14, textAlign: "center",
  fontSize: 13, fontWeight: 900, letterSpacing: 5, color: "#f87171",
};
const panel: CSSProperties = { background: "rgba(15,23,42,0.8)", borderRadius: 18, padding: 14, border: "1px solid rgba(255,255,255,0.08)" };
const field: CSSProperties = { marginBottom: 12 };
const lab: CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 6 };
const inp: CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.4)", color: "#fff", fontSize: 16, fontWeight: 800, fontFamily: "inherit",
};
const chip: CSSProperties = {
  padding: "6px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)", color: "#cbd5e1", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
};
const btn: CSSProperties = {
  width: "100%", padding: "15px 0", borderRadius: 14, border: "none",
  background: "linear-gradient(135deg,#16a34a,#4ade80)", color: "#052e16",
  fontSize: 16, fontWeight: 900, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 8px 28px rgba(74,222,128,0.35)",
};
const toastStyle: CSSProperties = {
  position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 50,
  padding: "10px 18px", borderRadius: 12, fontWeight: 800, fontSize: 13,
  background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff",
};
