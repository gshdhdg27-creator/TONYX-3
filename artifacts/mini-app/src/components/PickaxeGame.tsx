/**
 * PickaxeGame — Falling Pickaxe (Кирка)
 */
import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  telegramId: string;
  balance: number;
  onBalanceChange?: () => void;
};

const BETS = [0.1, 0.5, 1, 2, 5, 10, 25, 50];
const TIER_EMOJI: Record<string, string> = {
  wood: "🪵",
  stone: "🪨",
  iron: "⚙️",
  diamond: "💎",
};

export default function PickaxeGame({ telegramId, balance, onBalanceChange }: Props) {
  const [bet, setBet] = useState(0.5);
  const [busy, setBusy] = useState(false);
  const [localBal, setLocalBal] = useState(balance);
  const [result, setResult] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => setLocalBal(balance), [balance]);

  const play = useCallback(async () => {
    if (busy || !telegramId) return;
    if (localBal < bet) {
      setToast("Недостаточно TON");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/mini/games/pickaxe/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, bet }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(data?.error || "Ошибка");
        setBusy(false);
        return;
      }
      if (typeof data.balance === "number") {
        setLocalBal(data.balance);
        onBalanceChange?.();
      }
      if (!data.tier) {
        setResult("Пусто 💨");
      } else {
        const emoji = TIER_EMOJI[data.tier] || "⛏️";
        const net = data.net >= 0 ? `+${data.net}` : String(data.net);
        setResult(`${emoji} ${data.tier} · ${net} TON`);
      }
    } catch {
      setToast("Сеть недоступна");
    } finally {
      setBusy(false);
    }
  }, [busy, telegramId, localBal, bet, onBalanceChange]);

  return (
    <div style={{ minHeight: "100%", padding: 14, color: "#f1f5f9", paddingBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>⛏️ КИРКА</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Падай · ломай · добывай TON</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 12, color: "#94a3b8" }}>
          Баланс
          <div style={{ fontWeight: 800, color: "#fbbf24", fontSize: 14 }}>{localBal.toFixed(3)} TON</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {BETS.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBet(b)}
            disabled={busy}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: bet === b ? "1px solid #22c55e" : "1px solid #334155",
              background: bet === b ? "rgba(34,197,94,0.2)" : "rgba(30,41,59,0.8)",
              color: "#e2e8f0",
              fontWeight: 800,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {b}
          </button>
        ))}
      </div>

      <div
        style={{
          borderRadius: 16,
          border: "1px solid #1e293b",
          background: "linear-gradient(180deg,#0f172a,#020617)",
          padding: 24,
          textAlign: "center",
          marginBottom: 16,
          minHeight: 180,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {result ? (
          <div style={{ fontSize: 22, fontWeight: 900 }}>{result}</div>
        ) : (
          <div style={{ fontSize: 48, marginBottom: 8 }}>⛏️</div>
        )}
        <div style={{ color: "#64748b", fontSize: 12, marginTop: 8 }}>
          {busy ? "Копаем..." : "Нажми ИГРАТЬ"}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void play()}
        disabled={busy}
        style={{
          width: "100%",
          height: 52,
          borderRadius: 14,
          border: "none",
          background: busy
            ? "#334155"
            : "linear-gradient(135deg,#166534,#22c55e)",
          color: "#fff",
          fontWeight: 900,
          fontSize: 16,
          cursor: busy ? "wait" : "pointer",
          boxShadow: "0 8px 24px rgba(34,197,94,0.3)",
        }}
      >
        {busy ? "..." : `ИГРАТЬ · ${bet} TON`}
      </button>

      {toast && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 90,
            transform: "translateX(-50%)",
            background: "rgba(15,23,42,0.95)",
            border: "1px solid #334155",
            color: "#f1f5f9",
            padding: "10px 16px",
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 13,
            zIndex: 50,
          }}
          onClick={() => setToast(null)}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
