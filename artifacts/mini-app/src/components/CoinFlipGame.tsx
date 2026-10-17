import { useState, useRef, useEffect, type CSSProperties } from "react";

type Side = "heads" | "tails";

const MULTIPLIER = 1.92;
const MIN_BET = 0.1;
const BET_PRESETS = [0.1, 0.5, 1, 2, 5];
const FLIP_MS = 2800;

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

function EagleSvg({ size = 56 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
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
      <circle cx="32" cy="24" r="2.2" fill="#78350f" opacity="0.5" />
    </svg>
  );
}

function CrestSvg({ size = 56 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="28" fill="none" stroke="url(#sg)" strokeWidth="1.5" opacity="0.5" />
      <path fill="url(#sg)" d="M32 12l10 4v12c0 10-6 18-10 22-4-4-10-12-10-22V16l10-4z" />
      <circle cx="32" cy="30" r="3" fill="#f8fafc" opacity="0.85" />
    </svg>
  );
}

/** Theme by player choice */
const THEME = {
  heads: {
    accent: "#facc15",
    accentDim: "rgba(250,204,21,0.22)",
    border: "rgba(250,204,21,0.55)",
    text: "#422006",
    btnGrad: "linear-gradient(135deg,#92400e 0%,#eab308 45%,#fde68a 100%)",
    btnShadow: "0 10px 32px rgba(234,179,8,0.4), inset 0 1px 0 rgba(255,255,255,0.35)",
    pillActive: "rgba(250,204,21,0.22)",
    pillBorder: "rgba(250,204,21,0.5)",
    pillColor: "#fef08a",
    inputBorder: "rgba(250,204,21,0.35)",
    ambient: "rgba(250,204,21,0.16)",
    ring: "rgba(250,204,21,0.2)",
  },
  tails: {
    accent: "#e2e8f0",
    accentDim: "rgba(226,232,240,0.18)",
    border: "rgba(226,232,240,0.5)",
    text: "#0f172a",
    btnGrad: "linear-gradient(135deg,#475569 0%,#94a3b8 45%,#f1f5f9 100%)",
    btnShadow: "0 10px 32px rgba(148,163,184,0.35), inset 0 1px 0 rgba(255,255,255,0.4)",
    pillActive: "rgba(226,232,240,0.18)",
    pillBorder: "rgba(226,232,240,0.45)",
    pillColor: "#e2e8f0",
    inputBorder: "rgba(148,163,184,0.4)",
    ambient: "rgba(148,163,184,0.14)",
    ring: "rgba(148,163,184,0.22)",
  },
};

const CSS = `
@keyframes cfIdleFloat {
  0%, 100% { transform: translateY(0px) rotateX(12deg) rotateY(var(--faceY, 0deg)); }
  50% { transform: translateY(-7px) rotateX(12deg) rotateY(calc(var(--faceY, 0deg) + 6deg)); }
}
@keyframes cfShadowPulse {
  0% { transform: translateX(-50%) scaleX(1); opacity: 0.45; }
  15% { transform: translateX(-50%) scaleX(0.4); opacity: 0.15; }
  85% { transform: translateX(-50%) scaleX(0.9); opacity: 0.35; }
  95% { transform: translateX(-50%) scaleX(1.2); opacity: 0.55; }
  100% { transform: translateX(-50%) scaleX(1); opacity: 0.4; }
}
@keyframes cfRingSpin {
  to { transform: rotate(360deg); }
}
@keyframes cfSpark {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
  25% { opacity: 1; }
  100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0); }
}
@keyframes cfWinPulse {
  0%, 100% { box-shadow: 0 0 28px rgba(250,204,21,0.3), 0 0 70px rgba(250,204,21,0.12); }
  50% { box-shadow: 0 0 44px rgba(250,204,21,0.65), 0 0 100px rgba(250,204,21,0.25); }
}
@keyframes cfLosePulse {
  0%, 100% { box-shadow: 0 0 20px rgba(148,163,184,0.2); }
  50% { box-shadow: 0 0 32px rgba(248,113,113,0.35); }
}
@keyframes cfShine {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@keyframes cfPop {
  0% { opacity: 0; transform: translateY(8px) scale(0.92); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

.cf-root { position: relative; overflow: hidden; }
.cf-ambient {
  pointer-events: none;
  position: absolute;
  inset: -40px -20px auto;
  height: 280px;
  z-index: 0;
  transition: background 0.35s ease;
}
.cf-arena {
  position: relative;
  z-index: 1;
  height: 230px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 4px 0 6px;
}
.cf-floor {
  position: absolute;
  bottom: 24px;
  left: 50%;
  width: 130px;
  height: 16px;
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
  width: 196px;
  height: 196px;
  border-radius: 50%;
  z-index: 0;
  transition: border-color 0.35s;
}
.cf-ring::before {
  content: "";
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  border: 1px dashed rgba(167,139,250,0.18);
  animation: cfRingSpin 18s linear infinite;
}
.cf-stage {
  perspective: 1100px;
  width: 160px;
  height: 160px;
  position: relative;
  z-index: 2;
  border-radius: 50%;
}
.cf-stage.win { animation: cfWinPulse 1.4s ease-in-out infinite; }
.cf-stage.lose { animation: cfLosePulse 1.4s ease-in-out infinite; }

.cf-coin {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transform: translateY(0) rotateX(12deg) rotateY(var(--faceY, 0deg));
  will-change: transform;
}
.cf-coin.idle {
  animation: cfIdleFloat 3.2s ease-in-out infinite;
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
  background: radial-gradient(circle at 32% 28%, #fffbeb 0%, #fde68a 18%, #fbbf24 42%, #d97706 72%, #92400e 100%);
  transform: rotateY(0deg) translateZ(4px);
  box-shadow:
    inset 0 3px 10px rgba(255,255,255,0.45),
    inset 0 -8px 18px rgba(120,53,15,0.45),
    0 0 0 3px rgba(180,120,20,0.5),
    0 14px 36px rgba(0,0,0,0.5);
}
.cf-tails {
  background: radial-gradient(circle at 32% 28%, #ffffff 0%, #f1f5f9 18%, #cbd5e1 42%, #94a3b8 72%, #475569 100%);
  transform: rotateY(180deg) translateZ(4px);
  box-shadow:
    inset 0 3px 10px rgba(255,255,255,0.5),
    inset 0 -8px 18px rgba(30,41,59,0.4),
    0 0 0 3px rgba(148,163,184,0.5),
    0 14px 36px rgba(0,0,0,0.5);
}
.cf-rim {
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.28);
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
  background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.35) 48%, transparent 62%);
  background-size: 200% 100%;
  animation: cfShine 4s ease-in-out infinite;
  pointer-events: none;
  mix-blend-mode: soft-light;
}
.cf-label {
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin-top: 2px;
}
.cf-heads .cf-label { color: #78350f; }
.cf-tails .cf-label { color: #1e293b; }

.cf-sparks { position: absolute; inset: 0; pointer-events: none; z-index: 5; }
.cf-spark {
  position: absolute;
  left: 50%; top: 50%;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: radial-gradient(circle, #fff 0%, #facc15 40%, transparent 70%);
  animation: cfSpark 0.9s ease-out forwards;
}
.cf-result { animation: cfPop 0.35s ease-out; text-align: center; margin: 0 0 12px; }
.cf-result-title { font-size: 18px; font-weight: 900; }
.cf-result-sub { font-size: 13px; margin-top: 2px; font-weight: 700; opacity: 0.9; }
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
  /** Current resting face of the coin (what user sees when idle) */
  const [face, setFace] = useState<Side>("heads");
  const [sparks, setSparks] = useState<{ id: number; dx: number; dy: number; delay: number }[]>([]);
  const [lastResult, setLastResult] = useState<{
    won: boolean;
    result: Side;
    payout: number;
    profit: number;
  } | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const coinRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);
  const faceYRef = useRef(0); // absolute rotateY degrees (0 = heads, 180 = tails, +360n)
  const sparkId = useRef(0);

  const th = THEME[choice];

  const flash = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2800);
  };

  useEffect(() => {
    if (!lastResult?.won) return;
    const list = Array.from({ length: 14 }, () => {
      const ang = Math.random() * Math.PI * 2;
      const dist = 48 + Math.random() * 70;
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

  /** Sync CSS var for idle animation */
  useEffect(() => {
    const el = coinRef.current;
    if (!el || spinning) return;
    el.style.setProperty("--faceY", `${faceYRef.current}deg`);
  }, [face, spinning]);

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
      const el = coinRef.current;
      if (!el) {
        setBusy(false);
        return;
      }

      // Cancel any running animation
      animRef.current?.cancel();

      const startY = faceYRef.current;
      // Normalize: heads = even half-turns (0, 360…), tails = odd (180, 540…)
      const startNorm = ((startY % 360) + 360) % 360;
      const wantNorm = result === "heads" ? 0 : 180;
      const spins = 6 + Math.floor(Math.random() * 3); // 6–8 full turns
      let delta = spins * 360 + (wantNorm - startNorm);
      if (delta < spins * 360) delta += 360; // always go forward enough
      const endY = startY + delta;

      setSpinning(true);
      el.classList.remove("idle");

      // Web Animations API — reliable, no CSS calc bugs
      const keyframes: Keyframe[] = [
        {
          transform: `translateY(0px) scale(1) rotateX(12deg) rotateY(${startY}deg)`,
          offset: 0,
        },
        {
          transform: `translateY(-120px) scale(1.1) rotateX(55deg) rotateY(${startY + delta * 0.22}deg)`,
          offset: 0.18,
        },
        {
          transform: `translateY(-55px) scale(1.04) rotateX(25deg) rotateY(${startY + delta * 0.55}deg)`,
          offset: 0.45,
        },
        {
          transform: `translateY(-12px) scale(1) rotateX(14deg) rotateY(${startY + delta * 0.88}deg)`,
          offset: 0.78,
        },
        {
          transform: `translateY(6px) scale(0.96) rotateX(16deg) rotateY(${endY}deg)`,
          offset: 0.9,
        },
        {
          transform: `translateY(0px) scale(1) rotateX(12deg) rotateY(${endY}deg)`,
          offset: 1,
        },
      ];

      const anim = el.animate(keyframes, {
        duration: FLIP_MS,
        easing: "cubic-bezier(0.2, 0.7, 0.15, 1)",
        fill: "forwards",
      });
      animRef.current = anim;

      setTimeout(() => haptic("light"), 350);
      setTimeout(() => haptic("light"), 1100);
      setTimeout(() => haptic("heavy"), FLIP_MS - 180);

      await anim.finished.catch(() => undefined);

      faceYRef.current = endY;
      el.style.setProperty("--faceY", `${endY}deg`);
      el.style.transform = `translateY(0px) rotateX(12deg) rotateY(${endY}deg)`;
      // commit final state so fill:forwards can be cleared
      anim.cancel();

      setFace(result);
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
      setSpinning(false);
    } finally {
      setBusy(false);
    }
  };

  const potential = Math.round(Number(bet) * MULTIPLIER * 1000) / 1000;
  const canPlay = !busy && !spinning && Number(bet) >= MIN_BET;

  return (
    <div className="cf-root" style={root}>
      <style>{CSS}</style>
      <div
        className="cf-ambient"
        style={{
          background: `radial-gradient(ellipse 70% 55% at 50% 40%, ${th.ambient} 0%, transparent 70%),
            radial-gradient(ellipse 50% 40% at 20% 60%, rgba(124,58,237,0.1) 0%, transparent 70%)`,
        }}
      />

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

      <div style={hero}>
        <div
          style={{
            ...multBadge,
            background: th.btnGrad,
            color: th.text,
            boxShadow: `0 4px 18px ${th.accentDim}`,
          }}
        >
          <span style={{ opacity: 0.75, fontWeight: 700 }}>PAYOUT</span>
          <span style={{ marginLeft: 6 }}>×{MULTIPLIER}</span>
        </div>
        <div style={heroTitle}>Coin Flip</div>
        <div style={heroSub}>
          {choice === "heads" ? "Ставка на Орёл · золото" : "Ставка на Решку · серебро"}
        </div>
      </div>

      <div className="cf-arena">
        <div
          className="cf-ring"
          style={{ border: `1px solid ${th.ring}`, boxShadow: `inset 0 0 36px ${th.accentDim}` }}
        />
        <div className={`cf-floor ${spinning ? "tossing" : ""}`} />
        <div
          className={`cf-stage ${
            !spinning && lastResult ? (lastResult.won ? "win" : "lose") : ""
          }`}
        >
          <div
            ref={coinRef}
            className={`cf-coin ${!spinning && !lastResult ? "idle" : ""}`}
            style={{ ["--faceY" as string]: `${faceYRef.current}deg` } as CSSProperties}
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
                      background:
                        choice === "tails"
                          ? "radial-gradient(circle, #fff 0%, #cbd5e1 40%, transparent 70%)"
                          : undefined,
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
            <EagleSvg size={40} />
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
            <CrestSvg size={40} />
            <span style={{ fontWeight: 900, fontSize: 15 }}>Решка</span>
            <span style={{ fontSize: 10, opacity: 0.7, fontWeight: 700 }}>SILVER</span>
          </button>
        </div>

        <div style={{ ...sectionLabel, marginTop: 18 }}>Ставка</div>
        <div style={betRow}>
          <button
            type="button"
            style={{
              ...betAdj,
              borderColor: th.border,
              color: choice === "heads" ? "#fde68a" : "#e2e8f0",
            }}
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
            style={{ ...betInput, borderColor: th.inputBorder }}
            inputMode="decimal"
          />
          <button
            type="button"
            style={{
              ...betAdj,
              borderColor: th.border,
              color: choice === "heads" ? "#fde68a" : "#e2e8f0",
            }}
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
                background: bet === v ? th.pillActive : "rgba(15,23,42,0.8)",
                borderColor: bet === v ? th.pillBorder : "rgba(148,163,184,0.1)",
                color: bet === v ? th.pillColor : "#94a3b8",
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
              background: th.btnGrad,
              borderColor: "transparent",
              color: th.text,
              fontWeight: 900,
            }}
          >
            Max
          </button>
        </div>

        <div style={metaRow}>
          <span>Баланс {balance.toFixed(2)} TON</span>
          <span style={{ color: choice === "heads" ? "#fde68a" : "#e2e8f0", fontWeight: 800 }}>
            ≈ {potential.toFixed(2)} TON
          </span>
        </div>

        <button
          type="button"
          disabled={!canPlay}
          onClick={play}
          style={{
            ...flipBtn,
            background: th.btnGrad,
            color: th.text,
            boxShadow: canPlay ? th.btnShadow : "none",
            opacity: canPlay ? 1 : 0.5,
            cursor: canPlay ? "pointer" : "not-allowed",
          }}
        >
          {spinning ? "FLIPPING…" : busy ? "…" : "Подбросить монету"}
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
};
const hero: CSSProperties = { textAlign: "center", marginBottom: 2, position: "relative", zIndex: 1 };
const multBadge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 14px",
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 13,
  letterSpacing: "0.04em",
  marginBottom: 8,
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
};
const panel: CSSProperties = {
  position: "relative",
  zIndex: 1,
  marginTop: 4,
  padding: "16px 14px 18px",
  borderRadius: 20,
  background: "linear-gradient(180deg,rgba(24,16,48,0.92),rgba(10,6,18,0.96))",
  border: "1px solid rgba(167,139,250,0.18)",
  boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
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
};
const betRow: CSSProperties = { display: "flex", gap: 8, alignItems: "center" };
const betAdj: CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 14,
  border: "1px solid",
  background: "rgba(15,23,42,0.95)",
  fontWeight: 900,
  fontSize: 16,
  cursor: "pointer",
  fontFamily: "inherit",
};
const betInput: CSSProperties = {
  flex: 1,
  height: 48,
  borderRadius: 14,
  border: "1px solid",
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
  fontWeight: 900,
  fontSize: 17,
  letterSpacing: "0.02em",
  fontFamily: "inherit",
  transition: "background 0.25s, box-shadow 0.25s, opacity 0.15s",
};
