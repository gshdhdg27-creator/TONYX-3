import { useState, useRef, type CSSProperties } from "react";

type Side = "heads" | "tails";

const MULTIPLIER = 1.92;
const MIN_BET = 0.1;
const BET_PRESETS = [0.1, 0.5, 1, 2, 5];

function haptic(type: "light" | "medium" | "heavy" = "light") {
  try {
    (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(type);
  } catch {
    /* */
  }
}
function hapticNotify(type: "success" | "error" | "warning") {
  try {
    (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(type);
  } catch {
    /* */
  }
}

const CSS = `
@keyframes cfSpin {
  0%   { transform: rotateY(0deg) rotateX(12deg); }
  100% { transform: rotateY(var(--spins)) rotateX(12deg); }
}
@keyframes cfBounce {
  0%, 100% { transform: translateY(0); }
  40% { transform: translateY(-18px); }
  70% { transform: translateY(-6px); }
}
@keyframes cfGlowWin {
  0%, 100% { box-shadow: 0 0 24px rgba(250,204,21,0.35), 0 0 60px rgba(250,204,21,0.15); }
  50% { box-shadow: 0 0 40px rgba(250,204,21,0.7), 0 0 90px rgba(250,204,21,0.3); }
}
@keyframes cfGlowLose {
  0%, 100% { box-shadow: 0 0 16px rgba(148,163,184,0.25); }
  50% { box-shadow: 0 0 28px rgba(248,113,113,0.4); }
}
.cf-stage {
  perspective: 900px;
  width: 180px;
  height: 180px;
  margin: 0 auto;
  position: relative;
}
.cf-coin {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  border-radius: 50%;
}
.cf-coin.spinning {
  animation: cfSpin var(--dur) cubic-bezier(0.15, 0.7, 0.2, 1) forwards;
}
.cf-face {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  backface-visibility: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  border: 3px solid rgba(255,255,255,0.25);
  box-shadow:
    inset 0 2px 8px rgba(255,255,255,0.35),
    inset 0 -6px 16px rgba(0,0,0,0.35),
    0 12px 28px rgba(0,0,0,0.45);
}
.cf-heads {
  background:
    radial-gradient(circle at 35% 30%, #fef9c3 0%, #facc15 28%, #ca8a04 70%, #854d0e 100%);
  transform: rotateY(0deg);
}
.cf-tails {
  background:
    radial-gradient(circle at 35% 30%, #f8fafc 0%, #cbd5e1 30%, #94a3b8 65%, #64748b 100%);
  transform: rotateY(180deg);
}
.cf-edge {
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  border: 2px dashed rgba(255,255,255,0.22);
  pointer-events: none;
}
.cf-label {
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-shadow: 0 1px 2px rgba(0,0,0,0.35);
}
.cf-heads .cf-label { color: #422006; }
.cf-tails .cf-label { color: #1e293b; }
.cf-emoji { font-size: 42px; line-height: 1; margin-bottom: 4px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25)); }
.cf-bounce { animation: cfBounce 0.55s ease-out; }
.cf-win { animation: cfGlowWin 1.2s ease-in-out infinite; border-radius: 50%; }
.cf-lose { animation: cfGlowLose 1.2s ease-in-out infinite; border-radius: 50%; }
`;

export default function CoinFlipGame({
  telegramId,
  balance,
  onBalanceChange,
}: {
  telegramId: string;
  balance: number;
  onBalanceChange: () => void;
}) {
  const [bet, setBet] = useState(1);
  const [choice, setChoice] = useState<Side>("heads");
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [displaySide, setDisplaySide] = useState<Side>("heads");
  const [lastResult, setLastResult] = useState<{
    won: boolean;
    result: Side;
    payout: number;
    profit: number;
  } | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const coinRef = useRef<HTMLDivElement>(null);

  const flash = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2600);
  };

  const play = async () => {
    if (busy || spinning) return;
    const stake = Math.round(Number(bet) * 1000) / 1000;
    if (!telegramId) {
      flash("Нет Telegram ID", false);
      return;
    }
    if (!Number.isFinite(stake) || stake < MIN_BET) {
      flash(`Мин. ставка ${MIN_BET} TON`, false);
      return;
    }
    if (stake > balance) {
      flash("Недостаточно TON", false);
      return;
    }

    setBusy(true);
    setLastResult(null);
    haptic("medium");

    try {
      const r = await fetch("/api/mini/games/coin/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, stake, side: choice }),
      });
      const d = await r.json();
      if (!r.ok) {
        flash(d.error ?? "Ошибка сети", false);
        setBusy(false);
        return;
      }

      const result = d.result as Side;
      // Animate to land on result
      // heads = even half-turns, tails = odd half-turns (from heads start)
      const baseSpins = 6 + Math.floor(Math.random() * 3); // 6–8 full turns
      const endDeg =
        result === "heads"
          ? baseSpins * 360
          : baseSpins * 360 + 180;

      const el = coinRef.current;
      if (el) {
        el.style.setProperty("--spins", `${endDeg}deg`);
        el.style.setProperty("--dur", "2.4s");
        el.classList.remove("spinning");
        // force reflow
        void el.offsetWidth;
        el.classList.add("spinning");
      }

      setSpinning(true);
      setDisplaySide(result);

      await new Promise((res) => setTimeout(res, 2450));

      setSpinning(false);
      setLastResult({
        won: !!d.won,
        result,
        payout: Number(d.payout) || 0,
        profit: Number(d.profit) || 0,
      });

      if (d.won) {
        hapticNotify("success");
        flash(`+${Number(d.payout).toFixed(2)} TON  ·  ×${MULTIPLIER}`, true);
      } else {
        hapticNotify("error");
        flash(`−${stake.toFixed(2)} TON`, false);
      }
      onBalanceChange();
    } catch {
      flash("Ошибка сети", false);
    } finally {
      setBusy(false);
    }
  };

  const potential = Math.round(Number(bet) * MULTIPLIER * 1000) / 1000;

  return (
    <div style={root}>
      <style>{CSS}</style>

      {toast && (
        <div
          style={{
            ...toastStyle,
            background: toast.ok
              ? "linear-gradient(135deg,#166534,#22c55e)"
              : "linear-gradient(135deg,#7f1d1d,#ef4444)",
          }}
        >
          {toast.msg}
        </div>
      )}

      <div style={hero}>
        <div style={multBadge}>×{MULTIPLIER}</div>
        <div style={heroTitle}>Coin Flip</div>
        <div style={heroSub}>Орёл или решка · 50 / 50</div>
      </div>

      {/* Coin */}
      <div
        className={`cf-stage ${
          lastResult ? (lastResult.won ? "cf-win" : "cf-lose") : ""
        } ${!spinning && lastResult ? "cf-bounce" : ""}`}
        style={{ marginTop: 8, marginBottom: 8 }}
      >
        <div
          ref={coinRef}
          className="cf-coin"
          style={{
            transform:
              !spinning && displaySide === "tails"
                ? "rotateY(180deg) rotateX(12deg)"
                : !spinning
                  ? "rotateY(0deg) rotateX(12deg)"
                  : undefined,
          }}
        >
          <div className="cf-face cf-heads">
            <div className="cf-edge" />
            <div className="cf-emoji">🦅</div>
            <div className="cf-label">Орёл</div>
          </div>
          <div className="cf-face cf-tails">
            <div className="cf-edge" />
            <div className="cf-emoji">⚪</div>
            <div className="cf-label">Решка</div>
          </div>
        </div>
      </div>

      {lastResult && !spinning && (
        <div
          style={{
            textAlign: "center",
            marginBottom: 10,
            fontWeight: 800,
            fontSize: 15,
            color: lastResult.won ? "#86efac" : "#fca5a5",
          }}
        >
          {lastResult.won
            ? `Выигрыш ${lastResult.payout.toFixed(2)} TON`
            : `Выпало: ${lastResult.result === "heads" ? "Орёл" : "Решка"}`}
        </div>
      )}

      {/* Side pick */}
      <div style={sectionLabel}>Твой выбор</div>
      <div style={sideRow}>
        <button
          type="button"
          disabled={busy || spinning}
          onClick={() => {
            setChoice("heads");
            haptic("light");
          }}
          style={{
            ...sideBtn,
            background:
              choice === "heads"
                ? "linear-gradient(145deg,#ca8a04,#facc15)"
                : "rgba(30,41,59,0.9)",
            borderColor:
              choice === "heads" ? "rgba(250,204,21,0.7)" : "rgba(148,163,184,0.15)",
            color: choice === "heads" ? "#422006" : "#e2e8f0",
            boxShadow:
              choice === "heads" ? "0 0 22px rgba(250,204,21,0.35)" : "none",
          }}
        >
          <span style={{ fontSize: 28 }}>🦅</span>
          <span style={{ fontWeight: 900 }}>Орёл</span>
          <span style={{ fontSize: 11, opacity: 0.75 }}>золото</span>
        </button>
        <button
          type="button"
          disabled={busy || spinning}
          onClick={() => {
            setChoice("tails");
            haptic("light");
          }}
          style={{
            ...sideBtn,
            background:
              choice === "tails"
                ? "linear-gradient(145deg,#64748b,#e2e8f0)"
                : "rgba(30,41,59,0.9)",
            borderColor:
              choice === "tails" ? "rgba(226,232,240,0.7)" : "rgba(148,163,184,0.15)",
            color: choice === "tails" ? "#0f172a" : "#e2e8f0",
            boxShadow:
              choice === "tails" ? "0 0 22px rgba(148,163,184,0.35)" : "none",
          }}
        >
          <span style={{ fontSize: 28 }}>⚪</span>
          <span style={{ fontWeight: 900 }}>Решка</span>
          <span style={{ fontSize: 11, opacity: 0.75 }}>серебро</span>
        </button>
      </div>

      {/* Stake */}
      <div style={{ ...sectionLabel, marginTop: 16 }}>Ставка</div>
      <div style={betRow}>
        <button
          type="button"
          style={betAdj}
          disabled={busy || spinning}
          onClick={() => {
            setBet((b) => {
              const next = Math.round((Number(b) / 2) * 1000) / 1000;
              return next < MIN_BET ? MIN_BET : next;
            });
            haptic("light");
          }}
        >
          ½
        </button>
        <input
          value={bet === 0 ? "" : bet}
          disabled={busy || spinning}
          onChange={(e) => {
            const raw = e.target.value.replace(",", ".").trim();
            if (raw === "" || raw === ".") {
              setBet(0);
              return;
            }
            const v = parseFloat(raw);
            if (!Number.isNaN(v) && v >= 0) setBet(Math.round(v * 1000) / 1000);
          }}
          style={betInput}
          inputMode="decimal"
        />
        <button
          type="button"
          style={betAdj}
          disabled={busy || spinning}
          onClick={() => {
            setBet((b) => {
              const cur = Number(b) || MIN_BET;
              let next = Math.round(cur * 2 * 1000) / 1000;
              if (balance > 0 && next > balance) next = Math.round(balance * 1000) / 1000;
              return next < MIN_BET ? MIN_BET : next;
            });
            haptic("light");
          }}
        >
          2×
        </button>
      </div>

      <div style={pills}>
        {BET_PRESETS.map((v) => (
          <button
            key={v}
            type="button"
            disabled={busy || spinning}
            onClick={() => {
              setBet(v);
              haptic("light");
            }}
            style={{
              ...pill,
              flex: 1,
              background: bet === v ? "rgba(250,204,21,0.22)" : "rgba(30,41,59,0.9)",
              borderColor: bet === v ? "rgba(250,204,21,0.55)" : "rgba(148,163,184,0.1)",
              color: bet === v ? "#fef08a" : "#94a3b8",
            }}
          >
            {v}
          </button>
        ))}
        <button
          type="button"
          disabled={busy || spinning}
          onClick={() => {
            const max = Math.round(Math.max(0, balance) * 1000) / 1000;
            setBet(max >= MIN_BET ? max : MIN_BET);
            haptic("light");
          }}
          style={{
            ...pill,
            flex: 1.2,
            background: "linear-gradient(135deg,#ca8a04,#eab308)",
            borderColor: "transparent",
            color: "#422006",
            fontWeight: 900,
          }}
        >
          Max
        </button>
      </div>

      <div style={metaRow}>
        <span>Баланс {balance.toFixed(2)} TON</span>
        <span style={{ color: "#fde68a" }}>Выплата ~{potential.toFixed(2)}</span>
      </div>

      <button
        type="button"
        disabled={busy || spinning || Number(bet) < MIN_BET}
        onClick={play}
        style={{
          ...flipBtn,
          opacity: busy || spinning || Number(bet) < MIN_BET ? 0.55 : 1,
          cursor: busy || spinning || Number(bet) < MIN_BET ? "not-allowed" : "pointer",
        }}
      >
        {spinning ? "Крутится…" : busy ? "…" : "Подбросить монету"}
      </button>
    </div>
  );
}

const root: CSSProperties = {
  position: "relative",
  padding: "4px 2px 24px",
  color: "#fff",
  fontFamily: "inherit",
};
const toastStyle: CSSProperties = {
  position: "fixed",
  top: 16,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 50,
  padding: "10px 18px",
  borderRadius: 14,
  fontWeight: 800,
  fontSize: 14,
  boxShadow: "0 8px 28px rgba(0,0,0,0.4)",
  maxWidth: "90vw",
};
const hero: CSSProperties = { textAlign: "center", marginBottom: 6 };
const multBadge: CSSProperties = {
  display: "inline-block",
  padding: "4px 12px",
  borderRadius: 999,
  background: "linear-gradient(135deg,#ca8a04,#facc15)",
  color: "#422006",
  fontWeight: 900,
  fontSize: 13,
  letterSpacing: "0.04em",
  marginBottom: 6,
};
const heroTitle: CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  letterSpacing: "-0.03em",
};
const heroSub: CSSProperties = { fontSize: 13, color: "#c4b5fd", marginTop: 2 };
const sectionLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#94a3b8",
  marginBottom: 8,
};
const sideRow: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
const sideBtn: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
  padding: "14px 8px",
  borderRadius: 16,
  border: "1.5px solid",
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "all 0.2s",
};
const betRow: CSSProperties = { display: "flex", gap: 8, alignItems: "center" };
const betAdj: CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(30,41,59,0.95)",
  color: "#e2e8f0",
  fontWeight: 900,
  fontSize: 16,
  cursor: "pointer",
  fontFamily: "inherit",
};
const betInput: CSSProperties = {
  flex: 1,
  height: 48,
  borderRadius: 14,
  border: "1px solid rgba(250,204,21,0.25)",
  background: "rgba(15,23,42,0.9)",
  color: "#fff",
  fontWeight: 800,
  fontSize: 18,
  textAlign: "center",
  fontFamily: "inherit",
  outline: "none",
};
const pills: CSSProperties = { display: "flex", gap: 6, marginTop: 10 };
const pill: CSSProperties = {
  height: 36,
  borderRadius: 999,
  border: "1px solid",
  fontWeight: 800,
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
};
const metaRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginTop: 12,
  fontSize: 12,
  color: "#94a3b8",
  fontWeight: 600,
};
const flipBtn: CSSProperties = {
  width: "100%",
  marginTop: 16,
  height: 54,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(135deg,#ca8a04 0%,#facc15 50%,#eab308 100%)",
  color: "#422006",
  fontWeight: 900,
  fontSize: 17,
  letterSpacing: "0.02em",
  boxShadow: "0 8px 28px rgba(234,179,8,0.35)",
  fontFamily: "inherit",
};
