import { useState } from "react";
import type { CSSProperties } from "react";

type QuickGameKind = "dice" | "roulette";
type Props = { game: QuickGameKind; telegramId: string; balance: number; onBalanceChange: () => void };

const gold = "#e5bd70";
const panel: CSSProperties = {
  background: "linear-gradient(145deg,rgba(31,25,17,.98),rgba(14,16,20,.98))",
  border: "1px solid rgba(194,151,76,.25)", borderRadius: 18,
  boxShadow: "0 12px 30px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.035)",
};

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
        method: "POST", headers: { "Content-Type": "application/json" },
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
    width: "100%", boxSizing: "border-box", padding: "14px 15px", borderRadius: 12,
    border: "1px solid rgba(194,151,76,.28)", background: "#101116",
    color: "#fff4df", fontSize: 17, fontWeight: 800, outline: "none",
  };
  const option = (active: boolean, accent = gold): CSSProperties => ({
    flex: 1, minHeight: 43, borderRadius: 11,
    border: `1px solid ${active ? accent : "rgba(194,151,76,.18)"}`,
    background: active ? `linear-gradient(145deg,${accent}30,#201a11)` : "rgba(255,255,255,.035)",
    color: active ? "#fff0cc" : "#a79b87", fontWeight: 800, fontSize: 12,
    cursor: "pointer", boxShadow: active ? `0 0 18px ${accent}20` : "none",
  });

  return (
    <div style={{ padding: "14px 16px 30px", color: "#f8f1e5" }}>
      <style>{`
        @keyframes casinoGlow { 0%,100%{box-shadow:0 0 22px rgba(220,174,91,.12)} 50%{box-shadow:0 0 38px rgba(220,174,91,.28)} }
        @keyframes diceRoll { 0%{transform:rotate(0) scale(.8)} 70%{transform:rotate(350deg) scale(1.12)} 100%{transform:rotate(360deg) scale(1)} }
        @keyframes wheelRoll { from{transform:rotate(0)} to{transform:rotate(1080deg)} }
      `}</style>

      <div style={{ ...panel, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ color: "#9b8b70", fontSize: 9, fontWeight: 900, letterSpacing: ".2em" }}>TONYX • DEMO TABLE</div>
          <div style={{ color: gold, fontSize: 25, fontWeight: 900, marginTop: 5, fontVariantNumeric: "tabular-nums" }}>{balance.toFixed(3)}</div>
          <div style={{ color: "#817866", fontSize: 10, marginTop: 3 }}>Демо-кредиты · не TON · без вывода</div>
        </div>
        <div style={{ width: 58, height: 58, borderRadius: 18, display: "grid", placeItems: "center", fontSize: 34, background: "linear-gradient(145deg,#3a2b16,#17130e)", border: "1px solid #806033", boxShadow: "0 0 25px #d6a84b20" }}>
          {game === "dice" ? "🎲" : "🎯"}
        </div>
      </div>

      <div style={{ ...panel, padding: 16, marginBottom: 13 }}>
        <div style={{ textAlign: "center", padding: "12px 0 18px" }}>
          <div style={{ color: "#a9946f", fontSize: 9, fontWeight: 900, letterSpacing: ".22em" }}>{game === "dice" ? "THE DICE TABLE" : "EUROPEAN ROULETTE"}</div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-.03em", marginTop: 5 }}>{game === "dice" ? "Бросок кубика" : "Колесо рулетки"}</div>
          <div style={{ color: "#857b6b", fontSize: 11, marginTop: 4 }}>{game === "dice" ? "Выбери направление и порог" : "Выбери цвет сектора"}</div>
          <div style={{
            width: 124, height: 124, borderRadius: "50%", margin: "18px auto 0",
            display: "grid", placeItems: "center", fontSize: game === "dice" ? 67 : 57,
            background: game === "dice"
              ? "radial-gradient(circle at 35% 25%,#fff8e9,#d8c6a5 55%,#786347)"
              : "conic-gradient(#b91c1c 0 10%,#161616 10% 20%,#b91c1c 20% 30%,#161616 30% 40%,#b91c1c 40% 50%,#161616 50% 60%,#b91c1c 60% 70%,#161616 70% 80%,#b91c1c 80% 90%,#16834b 90% 100%)",
            border: "5px solid #8c6b38",
            boxShadow: "0 0 0 5px #241b10,0 0 30px rgba(222,174,91,.22)",
            animation: busy ? (game === "dice" ? "diceRoll .75s ease-in-out infinite" : "wheelRoll 1s cubic-bezier(.1,.7,.2,1) infinite") : "casinoGlow 3s ease-in-out infinite",
          }}>
            {result ? (
              <span style={{ fontSize: 36, fontWeight: 900, color: result.won ? "#226b42" : "#9b2222" }}>
                {game === "dice" ? result.roll : result.number}
              </span>
            ) : game === "dice" ? "🎲" : <span style={{ textShadow: "0 2px 5px #000" }}>🎯</span>}
          </div>
        </div>

        <label style={{ display: "block", color: "#aa9a7e", fontSize: 10, fontWeight: 900, letterSpacing: ".12em", marginBottom: 8 }}>СТАВКА • ДЕМО-КРЕДИТЫ</label>
        <input type="number" min="0.1" max={balance} step="0.1" value={stake}
          onChange={e => setStake(Math.max(0, Number(e.target.value)))} style={field} />
        <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
          {[1, 5, 10, 25].map(v => (
            <button key={v} type="button" onClick={() => setStake(Math.min(balance, v))} style={option(stake === v, "#c79b50")}>{v}</button>
          ))}
          <button type="button" onClick={() => setStake(balance)} style={option(stake === balance, "#c79b50")}>MAX</button>
        </div>

        {game === "dice" ? (
          <>
            <div style={{ color: "#aa9a7e", fontSize: 10, fontWeight: 900, letterSpacing: ".12em", margin: "18px 0 8px" }}>НАПРАВЛЕНИЕ</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setDirection("under")} style={option(direction === "under", "#c79b50")}>МЕНЬШЕ</button>
              <button type="button" onClick={() => setDirection("over")} style={option(direction === "over", "#c79b50")}>БОЛЬШЕ</button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#aa9a7e", fontSize: 11, fontWeight: 800, margin: "17px 0 8px" }}>
              <span>ПОРОГ</span><span style={{ color: gold }}>{threshold}</span>
            </div>
            <input type="range" min="1" max="98" value={threshold} onChange={e => setThreshold(Number(e.target.value))} style={{ width: "100%", accentColor: gold }} />
          </>
        ) : (
          <>
            <div style={{ color: "#aa9a7e", fontSize: 10, fontWeight: 900, letterSpacing: ".12em", margin: "18px 0 8px" }}>ЦВЕТ СЕКТОРА</div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["red", "black", "green"] as const).map(c => (
                <button key={c} type="button" onClick={() => setColor(c)} style={{
                  ...option(color === c, c === "red" ? "#e34b4b" : c === "black" ? "#d7d1c6" : "#35b879"),
                  background: c === "red" ? (color === c ? "linear-gradient(145deg,#a92c2c,#451414)" : "#351719")
                    : c === "black" ? (color === c ? "linear-gradient(145deg,#4b4b4b,#111)" : "#17191d")
                    : (color === c ? "linear-gradient(145deg,#16834b,#0c3826)" : "#10291f"),
                  color: "#f7ead2",
                }}>{c === "red" ? "КРАСНЫЙ" : c === "black" ? "ЧЁРНЫЙ" : "ЗЕРО"}</button>
              ))}
            </div>
          </>
        )}

        <button type="button" disabled={busy || stake < 0.1 || stake > balance} onClick={play} style={{
          width: "100%", marginTop: 20, padding: 16, borderRadius: 13,
          border: "1px solid #f0d18c", background: busy || stake > balance
            ? "#37312a" : "linear-gradient(180deg,#f0d18c 0%,#bd8d3e 52%,#8d6329 100%)",
          color: busy || stake > balance ? "#8a8173" : "#21180d",
          fontSize: 13, fontWeight: 1000, letterSpacing: ".12em",
          cursor: busy || stake > balance ? "not-allowed" : "pointer",
          boxShadow: busy || stake > balance ? "none" : "0 5px 0 #60421f,0 9px 22px #d5a34b26",
        }}>{busy ? "ИДЁТ ИГРА…" : game === "dice" ? "БРОСИТЬ КУБИК" : "ЗАПУСТИТЬ РУЛЕТКУ"}</button>
        {stake > balance && <div style={{ color: "#f08d7e", fontSize: 11, marginTop: 8 }}>Недостаточно демо-кредитов</div>}
        {error && <div style={{ color: "#f08d7e", fontSize: 12, marginTop: 12 }}>{error}</div>}
      </div>

      {result && (
        <div style={{ ...panel, marginTop: 14, padding: 18, textAlign: "center", borderColor: result.won ? "rgba(71,180,112,.55)" : "rgba(202,82,68,.4)" }}>
          <div style={{ color: result.won ? "#79d89b" : "#e78a7e", fontSize: 10, fontWeight: 900, letterSpacing: ".2em" }}>{result.won ? "ПОБЕДА" : "НЕ В ЭТОТ РАЗ"}</div>
          <div style={{ fontSize: 42, fontWeight: 1000, color: result.won ? "#e9c77e" : "#e4d9c8", margin: "5px 0" }}>{game === "dice" ? result.roll : result.number}</div>
          {game === "roulette" && <div style={{ color: result.resultColor === "red" ? "#f27c75" : result.resultColor === "black" ? "#ddd4c7" : "#71d69b", fontWeight: 900, fontSize: 11, letterSpacing: ".15em" }}>{result.resultColor === "red" ? "КРАСНОЕ" : result.resultColor === "black" ? "ЧЁРНОЕ" : "ЗЕРО"}</div>}
          <div style={{ color: "#a99c86", fontSize: 11, marginTop: 8 }}>Выплата: <b style={{ color: gold }}>{Number(result.payout).toFixed(3)} DEMO</b></div>
          <div style={{ color: "#a99c86", fontSize: 11, marginTop: 4 }}>Новый баланс: <b style={{ color: "#f4e4c7" }}>{Number(result.newBalance).toFixed(3)} DEMO</b></div>
          {result.serverSeedHash && <div style={{ marginTop: 10, color: "#716957", fontSize: 9, wordBreak: "break-all" }}>FAIRNESS HASH · {result.serverSeedHash}</div>}
        </div>
      )}
    </div>
  );
}
