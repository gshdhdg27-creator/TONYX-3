import { useMemo, useState, type CSSProperties } from "react";

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
  const [needle, setNeedle] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<null | { won: boolean; payout: number; profit: number; roll: number }>(null);

  const mult = useMemo(
    () => Math.round(((100 / chance) * (1 - HOUSE)) * 1000) / 1000,
    [chance],
  );
  const potential = useMemo(() => Math.round(stake * mult * 1000) / 1000, [stake, mult]);

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
        return;
      }
      // animate needle to roll position (0-100)
      const roll = Number(d.roll) || 0;
      const steps = 24;
      for (let i = 1; i <= steps; i++) {
        setNeedle((roll * i) / steps);
        await new Promise((r) => setTimeout(r, 28));
      }
      setNeedle(roll);
      setLast({
        won: !!d.won,
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
      <div style={title}>Upgrade</div>
      <div style={sub}>Шанс vs множитель · классика</div>

      <div style={panel}>
        <div style={{
          height: 18, borderRadius: 999, overflow: "hidden", position: "relative",
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
        }}>
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: `${chance}%`,
            background: "linear-gradient(90deg,#16a34a,#4ade80)",
          }} />
          <div style={{
            position: "absolute", top: -4, bottom: -4, width: 3,
            left: `calc(${needle}% - 1px)`,
            background: "#fff",
            boxShadow: "0 0 8px #fff",
            borderRadius: 2,
            transition: spinning ? undefined : "left 0.2s",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: "#94a3b8" }}>
          <span>Win zone 0–{chance}%</span>
          <span>Lose {chance}–100%</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
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
          <div style={{
            marginTop: 14, textAlign: "center", fontWeight: 800, fontSize: 15,
            color: last.won ? "#4ade80" : "#f87171",
          }}>
            {last.won ? `Успех! +${last.profit.toFixed(3)} TON` : `Мимо (${last.roll}%) · −${stake} TON`}
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
          onChange={(e) => setChance(Number(e.target.value))}
          style={{ width: "100%" }}
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
        {busy ? "Крутим…" : `Upgrade · ${stake} TON`}
      </button>
    </div>
  );
}

const wrap: CSSProperties = { color: "#e2e8f0" };
const title: CSSProperties = { fontSize: 22, fontWeight: 900 };
const sub: CSSProperties = { fontSize: 12, color: "#f9a8d4", marginBottom: 14, fontWeight: 600 };
const panel: CSSProperties = {
  borderRadius: 18, padding: 16, marginBottom: 14,
  background: "linear-gradient(160deg,#4a044e 0%,#0f172a 100%)",
  border: "1px solid rgba(244,114,182,0.35)",
};
const stat: CSSProperties = {
  background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "10px 12px",
  border: "1px solid rgba(255,255,255,0.08)",
};
const statL: CSSProperties = { fontSize: 10, color: "#94a3b8", fontWeight: 700 };
const statV: CSSProperties = { fontSize: 16, fontWeight: 900, marginTop: 2 };
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
  background: "linear-gradient(135deg,#db2777,#f472b6)", color: "#fff",
  fontSize: 15, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
};
