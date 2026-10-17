import { useState, useRef, useEffect, type CSSProperties } from "react";

type Side = "heads" | "tails";

const MULTIPLIER = 1.92;
const MIN_BET = 0.1;
const BET_PRESETS = [0.1, 0.5, 1, 2, 5];
const FLIP_MS = 3200;

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

/** Golden eagle emblem for heads */
function EagleSvg() {
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden>
      <defs>
        <linearGradient id="eg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff7cc" />
          <stop offset="45%" stopColor="#f5d76e" />
          <stop offset="100%" stopColor="#a16207" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="28" fill="none" stroke="url(#eg)" strokeWidth="1.5" opacity="0.55" />
      <path
        fill="url(#eg)"
        d="M32 10c2 6 4 10 4 14 0 2-1 4-2 5 4-1 9-1 13 1-3 2-7 3-11 3h-1c1 3 2 7 2 11 0 4-1 7-3 10-2-3-3-6-3-10 0-4 1-8 2-11h-1c-4 0-8-1-11-3 4-2 9-2 13-1-1-1-2-3-2-5 0-4 2-8 4-14z"
      />
      <path
        fill="#78350f"
        opacity="0.35"
        d="M28 28c-3 1-6 3-8 6 3 0 6-1 9-2m16 0c2 1 5 2 8 2-2-3-5-5-8-6"
      />
      <circle cx="32" cy="24" r="2.2" fill="#78350f" opacity="0.5" />
    </svg>
  );
}

/** Silver crest for tails */
function CrestSvg() {
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden>
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="28" fill="none" stroke="url(#sg)" strokeWidth="1.5" opacity="0.5" />
      <path
        fill="url(#sg)"
        d="M32 12l10 4v12c0 10-6 18-10 22-4-4-10-12-10-22V16l10-4z"
      />
      <path
        fill="#334155"
        opacity="0.4"
        d="M32 18l6 2.5v9c0 7-3.5 13-6 16-2.5-3-6-9-6-16v-9L32 18z"
      />
      <circle cx="32" cy="30" r="3" fill="#f8fafc" opacity="0.85" />
    </svg>
  );
}

const CSS = `
@keyframes cfIdleFloat {
  0%, 100% { transform: translateY(0) rotateX(14deg) rotateY(0deg); }
  50% { transform: translateY(-6px) rotateX(14deg) rotateY(8deg); }
}
@keyframes cfToss {
  0% {
    transform: translateY(0) scale(1) rotateX(14deg) rotateY(0deg);
  }
  12% {
    transform: translateY(-110px) scale(1.08) rotateX(40deg) rotateY(calc(var(--spins) * 0.18));
  }
  55% {
    transform: translateY(-40px) scale(1.02) rotateX(20deg) rotateY(calc(var(--spins) * 0.72));
  }
  82% {
    transform: translateY(-8px) scale(1) rotateX(10deg) rotateY(calc(var(--spins) * 0.94));
  }
  92% {
    transform: translateY(4px) scale(0.97) rotateX(16deg) rotateY(var(--spins));
  }
  100% {
    transform: translateY(0) scale(1) rotateX(14deg) rotateY(var(--spins));
  }
}
@keyframes cfShadowPulse {
  0% { transform: translateX(-50%) scaleX(1); opacity: 0.45; }
  12% { transform: translateX(-50%) scaleX(0.45); opacity: 0.18; }
  82% { transform: translateX(-50%) scaleX(0.85); opacity: 0.35; }
  92% { transform: translateX(-50%) scaleX(1.15); opacity: 0.55; }
  100% { transform: translateX(-50%) scaleX(1); opacity: 0.4; }
}
@keyframes cfRingSpin {
  to { transform: rotate(360deg); }
}
@keyframes cfSpark {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0); }
}
@keyframes cfWinPulse {
  0%, 100% {
    box-shadow:
      0 0 0 0 rgba(250,204,21,0),
      0 0 32px rgba(250,204,21,0.35),
      0 0 80px rgba(250,204,21,0.15);
  }
  50% {
    box-shadow:
      0 0 0 12px rgba(250,204,21,0.08),
      0 0 48px rgba(250,204,21,0.65),
      0 0 100px rgba(250,204,21,0.28);
  }
}
@keyframes cfLosePulse {
  0%, 100% { box-shadow: 0 0 24px rgba(148,163,184,0.2); }
  50% { box-shadow: 0 0 36px rgba(248,113,113,0.35); }
}
@keyframes cfShine {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@keyframes cfPop {
  0% { opacity: 0; transform: translateY(8px) scale(0.92); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

.cf-root {
  position: relative;
  overflow: hidden;
}
.cf-ambient {
  pointer-events: none;
  position: absolute;
  inset: -40px -20px auto;
  height: 280px;
  background:
    radial-gradient(ellipse 70% 55% at 50% 40%, rgba(250,204,21,0.14) 0%, transparent 70%),
    radial-gradient(ellipse 50% 40% at 20% 60%, rgba(124,58,237,0.12) 0%, transparent 70%),
    radial-gradient(ellipse 50% 40% at 80% 50%, rgba(56,189,248,0.08) 0%, transparent 70%);
  z-index: 0;
}
.cf-arena {
  position: relative;
  z-index: 1;
  height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 4px 0 8px;
}
.cf-floor {
  position: absolute;
  bottom: 28px;
  left: 50%;
  width: 140px;
  height: 18px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(0,0,0,0.55) 0%, transparent 70%);
  transform: translateX(-50%);
  z-index: 0;
}
.cf-floor.tossing {
  animation: cfShadowPulse ${FLIP_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}
.cf-ring {
  position: absolute;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  border: 1px solid rgba(250,204,21,0.12);
  box-shadow: inset 0 0 40px rgba(250,204,21,0.04);
  z-index: 0;
}
.cf-ring::before {
  content: "";
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  border: 1px dashed rgba(167,139,250,0.2);
  animation: cfRingSpin 18s linear infinite;
}
.cf-stage {
  perspective: 1200px;
  width: 168px;
  height: 168px;
  position: relative;
  z-index: 2;
}
.cf-coin {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transform: rotateX(14deg) rotateY(0deg);
}
.cf-coin.idle {
  animation: cfIdleFloat 3.2s ease-in-out infinite;
}
.cf-coin.tossing {
  animation: cfToss ${FLIP_MS}ms cubic-bezier(0.18, 0.7, 0.15, 1) forwards;
}
.cf-face {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}
.cf-heads {
  background:
    radial-gradient(circle at 32% 28%, #fffbeb 0%, #fde68a 18%, #fbbf24 42%, #d97706 72%, #92400e 100%);
  transform: translateZ(5px);
  box-shadow:
    inset 0 3px 10px rgba(255,255,255,0.45),
    inset 0 -8px 20px rgba(120,53,15,0.45),
    0 0 0 3px rgba(180,120,20,0.55),
    0 0 0 5px rgba(120,70,10,0.35),
    0 16px 40px rgba(0,0,0,0.5);
}
.cf-tails {
  background:
    radial-gradient(circle at 32% 28%, #ffffff 0%, #f1f5f9 18%, #cbd5e1 42%, #94a3b8 72%, #475569 100%);
  transform: rotateY(180deg) translateZ(5px);
  box-shadow:
    inset 0 3px 10px rgba(255,255,255,0.5),
    inset 0 -8px 20px rgba(30,41,59,0.4),
    0 0 0 3px rgba(148,163,184,0.55),
    0 0 0 5px rgba(71,85,105,0.35),
    0 16px 40px rgba(0,0,0,0.5);
}
.cf-rim {
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.28);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);
  pointer-events: none;
}
.cf-rim-inner {
  position: absolute;
  inset: 14px;
  border-radius: 50%;
  border: 1px dashed rgba(255,255,255,0.18);
  pointer-events: none;
}
.cf-shine {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: linear-gradient(
    115deg,
    transparent 30%,
    rgba(255,255,255,0.35) 48%,
    transparent 62%
  );
  background-size: 200% 100%;
  animation: cfShine 4s ease-in-out infinite;
  pointer-events: none;
  mix-blend-mode: soft-light;
}
.cf-label {
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  margin-top: 2px;
}
.cf-heads .cf-label { color: #78350f; text-shadow: 0 1px 0 rgba(255,255,255,0.25); }
.cf-tails .cf-label { color: #1e293b; text-shadow: 0 1px 0 rgba(255,255,255,0.35); }

.cf-stage.win .cf-coin {
  animation: none;
  transform: rotateX(14deg) rotateY(var(--land, 0deg));
}
.cf-stage.win {
  border-radius: 50%;
  animation: cfWinPulse 1.4s ease-in-out infinite;
}
.cf-stage.lose {
  border-radius: 50%;
  animation: cfLosePulse 1.4s ease-in-out infinite;
}

.cf-sparks {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
}
.cf-spark {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: radial-gradient(circle, #fff 0%, #facc15 40%, transparent 70%);
  animation: cfSpark 0.9s ease-out forwards;
}
.cf-result {
  animation: cfPop 0.35s ease-out;
  text-align: center;
  margin: 0 0 12px;
}
.cf-result-title {
  font-size: 18px;
  font-weight: 900;
  letter-spacing: -0.02em;
}
.cf-result-sub {
  font-size: 13px;
  margin-top: 2px;
  opacity: 0.85;
  font-weight: 700;
}
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
  const [landDeg, setLandDeg] = useState(0);
  const [sparks, setSparks] = useState<{ id: number; dx: number; dy: number; delay: number }[]>([]);
  const [lastResult, setLastResult] = useState<{
    won: boolean;
    result: Side;
    payout: number;
    profit: number;
  } | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const coinRef = useRef<HTMLDivElement>(null);
  const sparkId = useRef(0);

  const flash = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2800);
  };

  useEffect(() => {
    if (!lastResult?.won) return;
    const list = Array.from({ length: 14 }, () => {
      const ang = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 70;
      return {
        id: ++sparkId.current,
        dx: Math.cos(ang) * dist,
        dy: Math.sin(ang) * dist,
        delay: Math.random() * 0.25,
      };
    });
    setSparks(list);
    const t = setTimeout(() => setSparks([]), 1000);
    return () => clearTimeout(t);
  }, [lastResult]);

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
    setSparks([]);
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
      // Continue from current face so animation always starts coherent
      const fromDeg = displaySide === "tails" ? 180 : 0;
      const baseSpins = 7 + Math.floor(Math.random() * 3); // 7–9 turns
      const targetExtra = result === "heads" ? 0 : 180;
      // land on correct face relative to start
      let endDeg = fromDeg + baseSpins * 360 + targetExtra;
      // if starting on tails and want heads: from 180 + n*360 + 180 = heads
      if (displaySide === "tails") {
        endDeg = 180 + baseSpins * 360 + (result === "tails" ? 0 : 180);
      } else {
        endDeg = baseSpins * 360 + (result === "heads" ? 0 : 180);
      }

      const el = coinRef.current;
      if (el) {
        el.style.setProperty("--spins", `${endDeg}deg`);
        el.classList.remove("tossing", "idle");
        void el.offsetWidth;
        el.classList.add("tossing");
      }

      setSpinning(true);
      setLandDeg(endDeg);

      // mid-flight haptics
      setTimeout(() => haptic("light"), 400);
      setTimeout(() => haptic("light"), 1200);
      setTimeout(() => haptic("heavy"), FLIP_MS - 200);

      await new Promise((res) => setTimeout(res, FLIP_MS + 40));

      setDisplaySide(result);
      setSpinning(false);
      if (el) {
        el.classList.remove("tossing");
        el.style.setProperty("--land", `${endDeg}deg`);
      }

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
  const canPlay = !busy && !spinning && Number(bet) >= MIN_BET;

  return (
    <div className="cf-root" style={root}>
      <style>{CSS}</style>
      <div className="cf-ambient" />

      {toast && (
        <div
          style={{
            ...toastStyle,
            background: toast.ok
              ? "linear-gradient(135deg,#14532d,#22c55e)"
              : "linear-gradient(135deg,#7f1d1d,#ef4444)",
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Hero */}
      <div style={hero}>
        <div style={multBadge}>
          <span style={{ opacity: 0.7, fontWeight: 700 }}>PAYOUT</span>
          <span style={{ marginLeft: 6 }}>×{MULTIPLIER}</span>
        </div>
        <div style={heroTitle}>Coin Flip</div>
        <div style={heroSub}>Орёл · золото &nbsp;|&nbsp; Решка · серебро</div>
      </div>

      {/* Arena */}
      <div className="cf-arena">
        <div className="cf-ring" />
        <div className={`cf-floor ${spinning ? "tossing" : ""}`} />
        <div
          className={`cf-stage ${
            !spinning && lastResult ? (lastResult.won ? "win" : "lose") : ""
          }`}
          style={{ ["--land" as string]: `${landDeg}deg` } as CSSProperties}
        >
          <div
            ref={coinRef}
            className={`cf-coin ${spinning ? "tossing" : lastResult ? "" : "idle"}`}
            style={
              !spinning
                ? {
                    transform:
                      displaySide === "tails"
                        ? `rotateX(14deg) rotateY(${landDeg || 180}deg)`
                        : `rotateX(14deg) rotateY(${landDeg || 0}deg)`,
                  }
                : undefined
            }
          >
            <div className="cf-face cf-heads">
              <div className="cf-rim" />
              <div className="cf-rim-inner" />
              <div className="cf-shine" />
              <EagleSvg />
              <div className="cf-label">Орёл</div>
            </div>
            <div className="cf-face cf-tails">
              <div className="cf-rim" />
              <div className="cf-rim-inner" />
              <div className="cf-shine" />
              <CrestSvg />
              <div className="cf-label">Решка</div>
            </div>
          </div>

          {sparks.length > 0 && (
            <div className="cf-sparks">
              {sparks.map((s) => (
                <span
                  key={s.id}
                  className="cf-spark"
                  style={
                    {
                      ["--dx" as string]: `${s.dx}px`,
                      ["--dy" as string]: `${s.dy}px`,
                      animationDelay: `${s.delay}s`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {lastResult && !spinning && (
        <div className="cf-result">
          <div
            className="cf-result-title"
            style={{ color: lastResult.won ? "#86efac" : "#fca5a5" }}
          >
            {lastResult.won ? "Победа!" : "Мимо"}
          </div>
          <div
            className="cf-result-sub"
            style={{ color: lastResult.won ? "#bbf7d0" : "#fecaca" }}
          >
            {lastResult.won
              ? `+${lastResult.payout.toFixed(2)} TON`
              : `Выпало: ${lastResult.result === "heads" ? "Орёл" : "Решка"}`}
          </div>
        </div>
      )}

      {/* Choice */}
      <div style={panel}>
        <div style={sectionLabel}>Выбери сторону</div>
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
                  ? "linear-gradient(160deg,#a16207 0%,#fbbf24 55%,#fef3c7 100%)"
                  : "rgba(15,23,42,0.75)",
              borderColor:
                choice === "heads" ? "rgba(250,204,21,0.75)" : "rgba(148,163,184,0.12)",
              color: choice === "heads" ? "#422006" : "#e2e8f0",
              boxShadow:
                choice === "heads"
                  ? "0 0 28px rgba(250,204,21,0.4), inset 0 1px 0 rgba(255,255,255,0.35)"
                  : "inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            <div style={{ transform: "scale(0.72)", marginBottom: -4 }}>
              <EagleSvg />
            </div>
            <span style={{ fontWeight: 900, fontSize: 15 }}>Орёл</span>
            <span style={{ fontSize: 10, opacity: 0.7, fontWeight: 700 }}>GOLD</span>
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
                  ? "linear-gradient(160deg,#475569 0%,#cbd5e1 55%,#f8fafc 100%)"
                  : "rgba(15,23,42,0.75)",
              borderColor:
                choice === "tails" ? "rgba(226,232,240,0.7)" : "rgba(148,163,184,0.12)",
              color: choice === "tails" ? "#0f172a" : "#e2e8f0",
              boxShadow:
                choice === "tails"
                  ? "0 0 28px rgba(148,163,184,0.35), inset 0 1px 0 rgba(255,255,255,0.4)"
                  : "inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            <div style={{ transform: "scale(0.72)", marginBottom: -4 }}>
              <CrestSvg />
            </div>
            <span style={{ fontWeight: 900, fontSize: 15 }}>Решка</span>
            <span style={{ fontSize: 10, opacity: 0.7, fontWeight: 700 }}>SILVER</span>
          </button>
        </div>

        <div style={{ ...sectionLabel, marginTop: 18 }}>Ставка</div>
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
                background: bet === v ? "rgba(250,204,21,0.2)" : "rgba(15,23,42,0.8)",
                borderColor: bet === v ? "rgba(250,204,21,0.5)" : "rgba(148,163,184,0.1)",
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
              flex: 1.15,
              background: "linear-gradient(135deg,#a16207,#facc15)",
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
          <span style={{ color: "#fde68a", fontWeight: 800 }}>
            ≈ {potential.toFixed(2)} TON
          </span>
        </div>

        <button
          type="button"
          disabled={!canPlay}
          onClick={play}
          style={{
            ...flipBtn,
            opacity: canPlay ? 1 : 0.5,
            cursor: canPlay ? "pointer" : "not-allowed",
            transform: spinning ? "scale(0.98)" : undefined,
          }}
        >
          {spinning ? (
            <span style={{ letterSpacing: "0.06em" }}>FLIPPING…</span>
          ) : busy ? (
            "…"
          ) : (
            "Подбросить монету"
          )}
        </button>
      </div>
    </div>
  );
}

const root: CSSProperties = {
  position: "relative",
  padding: "2px 0 28px",
  color: "#fff",
  fontFamily: "inherit",
};
const toastStyle: CSSProperties = {
  position: "fixed",
  top: 14,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 60,
  padding: "11px 20px",
  borderRadius: 16,
  fontWeight: 800,
  fontSize: 14,
  boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
  maxWidth: "90vw",
  backdropFilter: "blur(8px)",
};
const hero: CSSProperties = { textAlign: "center", marginBottom: 2, position: "relative", zIndex: 1 };
const multBadge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 14px",
  borderRadius: 999,
  background: "linear-gradient(135deg,rgba(161,98,7,0.9),rgba(250,204,21,0.95))",
  color: "#422006",
  fontWeight: 900,
  fontSize: 13,
  letterSpacing: "0.04em",
  marginBottom: 8,
  boxShadow: "0 4px 20px rgba(250,204,21,0.25)",
};
const heroTitle: CSSProperties = {
  fontSize: 30,
  fontWeight: 900,
  letterSpacing: "-0.04em",
  background: "linear-gradient(180deg,#fff 0%,#e2e8f0 100%)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
};
const heroSub: CSSProperties = {
  fontSize: 12,
  color: "#a78bfa",
  marginTop: 4,
  fontWeight: 600,
  letterSpacing: "0.02em",
};
const panel: CSSProperties = {
  position: "relative",
  zIndex: 1,
  marginTop: 4,
  padding: "16px 14px 18px",
  borderRadius: 20,
  background: "linear-gradient(180deg,rgba(24,16,48,0.92),rgba(10,6,18,0.96))",
  border: "1px solid rgba(167,139,250,0.18)",
  boxShadow: "0 12px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
};
const sectionLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#94a3b8",
  marginBottom: 10,
};
const sideRow: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
const sideBtn: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 2,
  padding: "12px 8px 14px",
  borderRadius: 18,
  border: "1.5px solid",
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "transform 0.15s, box-shadow 0.2s",
};
const betRow: CSSProperties = { display: "flex", gap: 8, alignItems: "center" };
const betAdj: CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(15,23,42,0.95)",
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
  border: "1px solid rgba(250,204,21,0.28)",
  background: "rgba(8,10,24,0.9)",
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
  marginTop: 14,
  fontSize: 12,
  color: "#94a3b8",
  fontWeight: 600,
};
const flipBtn: CSSProperties = {
  width: "100%",
  marginTop: 16,
  height: 56,
  borderRadius: 18,
  border: "none",
  background: "linear-gradient(135deg,#92400e 0%,#eab308 45%,#fde68a 100%)",
  color: "#422006",
  fontWeight: 900,
  fontSize: 17,
  letterSpacing: "0.02em",
  boxShadow:
    "0 10px 32px rgba(234,179,8,0.4), inset 0 1px 0 rgba(255,255,255,0.35)",
  fontFamily: "inherit",
  transition: "transform 0.15s, opacity 0.15s",
};
