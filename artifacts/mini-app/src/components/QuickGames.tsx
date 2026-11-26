import { useState } from "react";
import type { CSSProperties } from "react";

type QuickGameKind = "dice" | "roulette";
type Props = { game: QuickGameKind; telegramId: string; balance: number; onBalanceChange: () => void };

export default function QuickGames({ game, telegramId, balance, onBalanceChange }: Props) {
  const [stake, setStake] = useState(10);
  const [threshold, setThreshold] = useState(50);
  const [direction, setDirection] = useState<"over" | "under">("over");
  const [color, setColor] = useState<"red" | "black" | "green">("red");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const play = async () => {
    if (busy || stake < 0.1 || stake > balance) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const payload = game === "dice"
        ? { telegramId, stake, threshold, direction }
        : { telegramId, stake, color };
      const response = await fetch(`/api/mini/games/${game}/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Не удалось сыграть"); return; }
      setResult(data);
      onBalanceChange();
    } catch {
      setError("Ошибка соединения");
    } finally {
      setBusy(false);
    }
  };

  const field: CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10,
    border: "1px solid #263449", background: "#111b2a", color: "#f8fafc", fontSize: 15,
  };
  const button: React.CSSProperties = {
    border: "1px solid #2b3b52", borderRadius: 10, padding: "10px 12px",
    background: "#172438", color: "#dbeafe", fontWeight: 700, cursor: "pointer",
  };

  return (
    <div style={{ padding: 16, color: "#e5e7eb" }}>
      <div style={{ background: "rgba(15,23,42,.92)", border: "1px solid #243247", borderRadius: 16, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 800, letterSpacing: ".12em", marginBottom: 7 }}>DEMO CREDITS</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#fbbf24" }}>{balance.toFixed(3)}</div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>Тестовые кредиты · не TON · нельзя вывести</div>
      </div>

      <div style={{ background: "rgba(15,23,42,.92)", border: "1px solid #243247", borderRadius: 16, padding: 16 }}>
        <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 7 }}>Размер игры (демо-кредиты)</label>
        <input type="number" min="0.1" max="100" step="0.1" value={stake} onChange={e => setStake(Math.max(0, Number(e.target.value)))} style={field} />

        {game === "dice" ? (
          <>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button type="button" onClick={() => setDirection("under")} style={{ ...button, flex: 1, background: direction === "under" ? "#164e63" : button.background }}>Меньше</button>
              <button type="button" onClick={() => setDirection("over")} style={{ ...button, flex: 1, background: direction === "over" ? "#164e63" : button.background }}>Больше</button>
            </div>
            <label style={{ display: "block", fontSize: 12, color: "#94a3b8", margin: "14px 0 7px" }}>Порог: {threshold}</label>
            <input type="range" min="1" max="98" value={threshold} onChange={e => setThreshold(Number(e.target.value))} style={{ width: "100%" }} />
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: "#94a3b8", margin: "14px 0 8px" }}>Выбери цвет</div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["red", "black", "green"] as const).map(c => (
                <button key={c} type="button" onClick={() => setColor(c)} style={{ ...button, flex: 1, borderColor: color === c ? "#f8fafc" : "#2b3b52", background: c === "red" ? "#991b1b" : c === "black" ? "#111827" : "#166534" }}>{c === "red" ? "Красный" : c === "black" ? "Чёрный" : "Зеро"}</button>
              ))}
            </div>
          </>
        )}

        <button type="button" disabled={busy || stake < 0.1 || stake > balance} onClick={play} style={{ width: "100%", marginTop: 18, border: 0, borderRadius: 12, padding: 15, background: busy || stake > balance ? "#334155" : "linear-gradient(135deg,#0e7490,#2563eb)", color: "white", fontSize: 15, fontWeight: 900, cursor: busy ? "wait" : "pointer" }}>
          {busy ? "Играем…" : game === "dice" ? "Бросить кубик" : "Крутить рулетку"}
        </button>
        {error && <div style={{ color: "#f87171", fontSize: 13, marginTop: 12 }}>{error}</div>}
      </div>

      {result && (
        <div style={{ marginTop: 12, padding: 18, borderRadius: 16, textAlign: "center", border: `1px solid ${result.won ? "#166534" : "#7f1d1d"}`, background: result.won ? "rgba(22,101,52,.18)" : "rgba(127,29,29,.18)" }}>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>{game === "dice" ? "Выпало" : "Выпал номер"}</div>
          <div style={{ fontSize: 42, fontWeight: 900, margin: "5px 0", color: result.won ? "#4ade80" : "#f87171" }}>{game === "dice" ? result.roll : result.number}</div>
          {game === "roulette" && <div style={{ marginTop: 2, color: result.resultColor === "red" ? "#f87171" : result.resultColor === "black" ? "#cbd5e1" : "#4ade80", fontWeight: 800 }}>{result.resultColor === "red" ? "КРАСНОЕ" : result.resultColor === "black" ? "ЧЁРНОЕ" : "ЗЕРО"}</div>}
          <div style={{ fontWeight: 800, marginTop: 4 }}>{result.won ? "ПОБЕДА" : "НЕ УГАДАЛ"}</div>
          <div style={{ marginTop: 6, color: "#cbd5e1", fontSize: 13 }}>Выплата: {Number(result.payout).toFixed(3)} демо-кредитов</div>
          <div style={{ marginTop: 4, color: "#fbbf24", fontSize: 12 }}>Баланс: {Number(result.newBalance).toFixed(3)}</div>
          {result.serverSeedHash && <div style={{ marginTop: 8, color: "#64748b", fontSize: 10, wordBreak: "break-all" }}>Hash: {result.serverSeedHash}</div>}
        </div>
      )}
    </div>
  );
}
