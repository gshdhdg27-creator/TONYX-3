import { useMemo, useState, type CSSProperties } from "react";

const MIN_BET = 0.1;
const PRESETS = [0.1, 0.5, 1, 2, 5];
const TABLES: Record<string, number[]> = {
  low: [0.5, 0.7, 0.9, 1.0, 1.1, 1.2, 1.4, 1.2, 1.1, 1.0, 0.9, 0.7, 0.5],
  med: [0.2, 0.4, 0.6, 0.9, 1.2, 1.8, 3.0, 1.8, 1.2, 0.9, 0.6, 0.4, 0.2],
  high: [0, 0.1, 0.3, 0.6, 1.0, 2.5, 15, 2.5, 1.0, 0.6, 0.3, 0.1, 0],
};

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
  const [slot, setSlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<null | { mult: number; payout: number; profit: number }>(null);

  const table = TABLES[risk];

  const bucketColors = useMemo(
    () =>
      table.map((m) => {
        if (m >= 3) return "#fbbf24";
        if (m >= 1) return "#4ade80";
        if (m > 0) return "#60a5fa";
        return "#f87171";
      }),
    [table],
  );

  const play = async () => {
    if (busy || !telegramId) return;
    if (stake > balance) {
      setError("Недостаточно TON");
      return;
    }
    setBusy(true);
    setError(null);
    setSlot(null);
    setLast(null);
    try {
      const res = await fetch("/api/mini/games/plinko/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, stake, risk }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Ошибка");
        return;
      }
      // animate path briefly
      const path: number[] = d.path ?? [];
      let pos = 0;
      for (let i = 0; i < path.length; i++) {
        pos += path[i] ? 1 : 0;
        setSlot(pos);
        await new Promise((r) => setTimeout(r, 55));
      }
      setSlot(Number(d.slot));
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
      <div style={title}>Plinko</div>
      <div style={sub}>Шарик падает · выбери риск</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["low", "med", "high"] as Risk[]).map((r) => (
          <button
            key={r}
            type="button"
            disabled={busy}
            onClick={() => setRisk(r)}
            style={{
              ...chip,
              flex: 1,
              borderColor: risk === r ? "rgba(96,165,250,0.6)" : "rgba(255,255,255,0.1)",
              background: risk === r ? "rgba(37,99,235,0.25)" : "rgba(255,255,255,0.05)",
              color: risk === r ? "#93c5fd" : "#94a3b8",
            }}
          >
            {r === "low" ? "Low" : r === "med" ? "Med" : "High"}
          </button>
        ))}
      </div>

      <div style={board}>
        <div style={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "nowrap" }}>
          {table.map((m, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "8px 2px",
                borderRadius: 8,
                textAlign: "center",
                fontSize: 9,
                fontWeight: 800,
                color: "#0b1020",
                background: bucketColors[i],
                outline: slot === i ? "2px solid #fff" : "none",
                transform: slot === i ? "translateY(-4px)" : undefined,
                transition: "transform 0.15s",
              }}
            >
              {m}x
            </div>
          ))}
        </div>
        {last && (
          <div style={{ marginTop: 14, textAlign: "center", fontWeight: 800, fontSize: 15,
            color: last.profit >= 0 ? "#4ade80" : "#f87171" }}>
            {last.mult}x → {last.profit >= 0 ? "+" : ""}{last.profit.toFixed(3)} TON
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
const title: CSSProperties = { fontSize: 22, fontWeight: 900 };
const sub: CSSProperties = { fontSize: 12, color: "#67e8f9", marginBottom: 14, fontWeight: 600 };
const board: CSSProperties = {
  borderRadius: 18, padding: 14, marginBottom: 14,
  background: "linear-gradient(160deg,#0c4a6e 0%,#0f172a 100%)",
  border: "1px solid rgba(56,189,248,0.3)",
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
  background: "linear-gradient(135deg,#0284c7,#22d3ee)", color: "#0b1020",
  fontSize: 15, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
};
