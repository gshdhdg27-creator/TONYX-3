import { useMemo, useRef, useState, type CSSProperties } from "react";

const MIN_BET = 0.1;
const PRESETS = [0.1, 0.5, 1, 2, 5];
const HOUSE = 0.04;

function haptic(t: "light" | "medium" | "heavy" = "light") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(t); } catch { /* */ }
}
function hapticNotify(t: "success" | "error") {
  try { (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(t); } catch { /* */ }
}

export default function UpgradeGame({
  telegramId, balance, onBalanceChange,
}: { telegramId: string; balance: number; onBalanceChange: () => void }) {
  const [stake, setStake] = useState(0.5);
  const [chance, setChance] = useState(35);
  const [busy, setBusy] = useState(false);
  const [angle, setAngle] = useState(-90);
  const [result, setResult] = useState<null | { won: boolean; profit: number; roll: number }>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sparks, setSparks] = useState<{ id: number; x: number; y: number; c: string }[]>([]);
  const animRef = useRef(0);

  const mult = useMemo(() => Math.round(((100 / chance) * (1 - HOUSE)) * 1000) / 1000, [chance]);
  const potential = useMemo(() => Math.round(stake * mult * 1000) / 1000, [stake, mult]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const spinTo = (rollPercent: number) =>
    new Promise<void>((resolve) => {
      cancelAnimationFrame(animRef.current);
      const targetDeg = -90 + rollPercent * 3.6 + 360 * (4 + Math.floor(Math.random() * 2));
      const start = angle;
      const t0 = performance.now();
      const dur = 2800;

      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        const a = start + (targetDeg - start) * e;
        setAngle(a);
        if (p < 1) {
          if (Math.floor(p * 20) !== Math.floor((p - 0.016) * 20)) haptic("light");
          animRef.current = requestAnimationFrame(tick);
        } else {
          setAngle(-90 + rollPercent * 3.6);
          resolve();
        }
      };
      animRef.current = requestAnimationFrame(tick);
    });

  const play = async () => {
    if (busy || !telegramId) return;
    if (stake > balance) { flash("Недостаточно TON"); return; }
    setBusy(true);
    setResult(null);
    setSparks([]);
    haptic("medium");
    try {
      const res = await fetch("/api/mini/games/upgrade/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, stake, chance }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(d.error ?? "Ошибка");
        setBusy(false);
        return;
      }
      const roll = Number(d.roll) || 0;
      await spinTo(roll);
      const won = !!d.won;
      setResult({ won, profit: Number(d.profit) || 0, roll });
      if (won) {
        hapticNotify("success");
        haptic("heavy");
        const s = Array.from({ length: 18 }, (_, i) => ({
          id: i,
          x: 50 + (Math.random() - 0.5) * 80,
          y: 40 + (Math.random() - 0.5) * 60,
          c: ["#f472b6", "#fbbf24", "#4ade80", "#38bdf8", "#fff"][i % 5]!,
        }));
        setSparks(s);
        setTimeout(() => setSparks([]), 900);
        flash(`+${Number(d.profit).toFixed(3)} TON · ${mult}x`);
      } else {
        hapticNotify("error");
        flash(`Мимо · −${stake} TON`);
      }
      onBalanceChange();
    } catch {
      flash("Сеть недоступна");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={root}>
      <style>{`
        @keyframes upSpark {
          0% { opacity: 1; transform: translate(-50%,-50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%,-50%) scale(0) translateY(-30px); }
        }
        .up-spark { position:absolute; width:8px; height:8px; border-radius:50%; animation:upSpark .9s ease-out forwards; }
      `}</style>
      {toast && <div style={toastStyle}>{toast}</div>}

      <div style={dialWrap}>
        <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ display: "block" }}>
          <defs>
            <linearGradient id="winG" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#16a34a" />
              <stop offset="100%" stopColor="#4ade80" />
            </linearGradient>
            <linearGradient id="loseG" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7f1d1d" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <circle cx="100" cy="100" r="78" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="16" />
          <circle cx="100" cy="100" r="78" fill="none" stroke="url(#loseG)" strokeWidth="16"
            strokeDasharray={`${(100 - chance) * 4.9} 490`} strokeDashoffset={-chance * 4.9}
            transform="rotate(-90 100 100)" strokeLinecap="butt" opacity={0.85} />
          <circle cx="100" cy="100" r="78" fill="none" stroke="url(#winG)" strokeWidth="16"
            strokeDasharray={`${chance * 4.9} 490`} strokeDashoffset={0}
            transform="rotate(-90 100 100)" strokeLinecap="butt" filter="url(#glow)" />
          <circle cx="100" cy="100" r="58" fill="#0b1020" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          <text x="100" y="92" textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="700">CHANCE</text>
          <text x="100" y="114" textAnchor="middle" fill="#fff" fontSize="28" fontWeight="900">{chance}%</text>
          <g transform={`rotate(${angle} 100 100)`}>
            <polygon points="100,28 106,100 94,100" fill="#fff" filter="url(#glow)" />
            <circle cx="100" cy="100" r="8" fill="#fff" />
            <circle cx="100" cy="100" r="4" fill="#ec4899" />
          </g>
        </svg>

        {sparks.map((s) => (
          <span
            key={s.id}
            className="up-spark"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              background: s.c,
            }}
          />
        ))}

        {result && !busy && (
          <div style={{
            position: "absolute", left: 0, right: 0, bottom: 8, textAlign: "center",
            fontWeight: 900, fontSize: 15,
            color: result.won ? "#4ade80" : "#f87171",
          }}>
            {result.won ? `УСПЕХ +${result.profit.toFixed(3)} TON` : `МИМО (${result.roll.toFixed(1)}%)`}
          </div>
        )}
      </div>

      <div style={stats}>
        <div style={stat}><div style={statL}>Множитель</div><div style={statV}>{mult}x</div></div>
        <div style={stat}><div style={statL}>Выплата</div><div style={{ ...statV, color: "#4ade80" }}>{potential}</div></div>
      </div>

      <div style={panel}>
        <span style={lab}>Шанс победы · {chance}%</span>
        <input type="range" min={5} max={90} value={chance} disabled={busy}
          onChange={(e) => setChance(Number(e.target.value))} style={{ width: "100%", accentColor: "#ec4899" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b", marginTop: 4 }}>
          <span>5% · x19</span><span>90% · x1.06</span>
        </div>

        <span style={{ ...lab, marginTop: 14 }}>Ставка TON</span>
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
          {busy ? "Крутим…" : "⬆️  Upgrade"}
        </button>
      </div>
    </div>
  );
}

const root: CSSProperties = { color: "#e2e8f0", position: "relative" };
const dialWrap: CSSProperties = {
  position: "relative", height: 240, marginBottom: 12, borderRadius: 20, overflow: "hidden",
  background: "radial-gradient(ellipse at 50% 40%, rgba(236,72,153,0.2) 0%, #0a0612 70%)",
  border: "1px solid rgba(244,114,182,0.3)",
  boxShadow: "0 0 40px rgba(236,72,153,0.12)",
  padding: 8,
};
const stats: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 };
const stat: CSSProperties = {
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14, padding: "12px 14px",
};
const statL: CSSProperties = { fontSize: 10, color: "#64748b", fontWeight: 700 };
const statV: CSSProperties = { fontSize: 20, fontWeight: 900, marginTop: 2 };
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
  background: "linear-gradient(135deg,#db2777,#f472b6)", color: "#fff",
  fontSize: 16, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
  boxShadow: "0 8px 28px rgba(236,72,153,0.35)",
};
const toastStyle: CSSProperties = {
  position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 50,
  padding: "10px 18px", borderRadius: 12, fontWeight: 800, fontSize: 13,
  background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff",
};
