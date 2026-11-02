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
  const [running, setRunning] = useState(false);
  const [display, setDisplay] = useState(1);
  const [result, setResult] = useState<null | {
    won: boolean;
    crashPoint: number;
    cashoutAt: number;
    payout: number;
    profit: number;
  }>(null);
  const [error, setError] = useState<string | null>(null);
  const cashoutRef = useRef(1.5);
  const [autoCashout, setAutoCashout] = useState(1.5);
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const play = async () => {
    if (busy || running) return;
    if (!telegramId) return;
    if (stake > balance) {
      setError("Недостаточно TON");
      return;
    }
    setError(null);
    setResult(null);
    setBusy(true);
    setRunning(true);
    setDisplay(1);

    const target = Math.max(1.01, Math.min(100, autoCashout));
    cashoutRef.current = target;

    // Animate climb until ~target then resolve with server
    const start = performance.now();
    const climb = () => {
      const t = (performance.now() - start) / 1000;
      // exponential-ish growth
      const m = Math.min(target * 1.05, Math.pow(Math.E, t * 0.45));
      setDisplay(Math.max(1, Math.round(m * 100) / 100));
      if (m < target * 0.98) {
        raf.current = requestAnimationFrame(climb);
      }
    };
    raf.current = requestAnimationFrame(climb);

    try {
      const res = await fetch("/api/mini/games/crash/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, stake, cashoutAt: target }),
      });
      const d = await res.json();
      cancelAnimationFrame(raf.current);

      if (!res.ok) {
        setError(d.error ?? "Ошибка");
        setRunning(false);
        setBusy(false);
        setDisplay(1);
        return;
      }

      // show crash animation endpoint
      const crash = Number(d.crashPoint);
      const endShow = d.won ? target : Math.min(crash, target);
      setDisplay(endShow);

      // brief pause then flash crash if lost
      await new Promise((r) => setTimeout(r, 350));
      if (!d.won) setDisplay(crash);

      setResult({
        won: !!d.won,
        crashPoint: crash,
        cashoutAt: target,
        payout: Number(d.payout) || 0,
        profit: Number(d.profit) || 0,
      });
      onBalanceChange();
    } catch {
      setError("Сеть недоступна");
    } finally {
      setRunning(false);
      setBusy(false);
    }
  };

  const color =
    result?.won ? "#4ade80" : result && !result.won ? "#f87171" : running ? "#fbbf24" : "#e2e8f0";

  return (
    <div style={wrap}>
      <div style={title}>Crash</div>
      <div style={sub}>Выведи до краша · авто-кэшаут</div>

      <div style={panel}>
        <div style={{ fontSize: 48, fontWeight: 900, color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" }}>
          {display.toFixed(2)}x
        </div>
        {result && (
          <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: result.won ? "#4ade80" : "#f87171" }}>
            {result.won
              ? `Выигрыш +${result.profit.toFixed(3)} TON (кэш ${result.cashoutAt}x)`
              : `Краш на ${result.crashPoint.toFixed(2)}x · −${stake.toFixed(3)} TON`}
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
        {busy ? "Играем…" : `Играть · ${stake} TON`}
      </button>
    </div>
  );
}

const wrap: CSSProperties = { color: "#e2e8f0" };
const title: CSSProperties = { fontSize: 22, fontWeight: 900 };
const sub: CSSProperties = { fontSize: 12, color: "#a78bfa", marginBottom: 14, fontWeight: 600 };
const panel: CSSProperties = {
  borderRadius: 20, padding: "28px 16px", textAlign: "center", marginBottom: 16,
  background: "linear-gradient(160deg,#1e1b4b 0%,#0f172a 100%)",
  border: "1px solid rgba(167,139,250,0.35)",
  boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
};
const row: CSSProperties = { marginBottom: 12 };
const lab: CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 6 };
const inp: CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.35)",
  color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "inherit",
};
const chip: CSSProperties = {
  padding: "6px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)", color: "#cbd5e1", fontWeight: 700, fontSize: 12,
  cursor: "pointer", fontFamily: "inherit",
};
const btn: CSSProperties = {
  width: "100%", padding: "14px 0", borderRadius: 14, border: "none",
  background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff",
  fontSize: 15, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
};
