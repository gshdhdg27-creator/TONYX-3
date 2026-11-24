/**
 * GameCard — illustrated SVG scenes + float animations (hub video style)
 * Path: artifacts/mini-app/src/components/GameCard.tsx
 */
import type { ReactNode } from "react";

export type GameCardProps = {
  name: string;
  scene?: "arena" | "spin" | "mines" | "cases" | "coin" | "crash" | "plinko" | "upgrade" | "generic";
  badge?: string;
  badgeColor?: string;
  online?: string | number;
  maxBet?: string | number;
  emoji?: string;
  gradient: string;
  accent?: string;
  wide?: boolean;
  onClick: () => void;
  footer?: ReactNode;
  enterDelay?: number;
  disabled?: boolean;
};

function Bird() {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <circle cx="32" cy="34" r="22" fill="#3b82f6" />
      <circle cx="32" cy="34" r="22" fill="url(#g1)" />
      <ellipse cx="24" cy="32" rx="7" ry="8" fill="#fff" />
      <ellipse cx="40" cy="32" rx="7" ry="8" fill="#fff" />
      <circle cx="25" cy="33" r="3.2" fill="#0f172a" />
      <circle cx="41" cy="33" r="3.2" fill="#0f172a" />
      <circle cx="26.2" cy="31.5" r="1.1" fill="#fff" />
      <circle cx="42.2" cy="31.5" r="1.1" fill="#fff" />
      <path d="M28 42 Q32 48 36 42" stroke="#1e3a8a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M48 36 L58 32 L48 40 Z" fill="#fbbf24" />
      <rect x="16" y="26" width="14" height="6" rx="3" fill="#0f172a" opacity="0.85" />
      <rect x="34" y="26" width="14" height="6" rx="3" fill="#0f172a" opacity="0.85" />
      <defs>
        <radialGradient id="g1" cx="35%" cy="30%">
          <stop offset="0%" stopColor="#93c5fd" />
          <stop offset="100%" stopColor="#2563eb" />
        </radialGradient>
      </defs>
    </svg>
  );
}

function Duck() {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <ellipse cx="32" cy="38" rx="20" ry="16" fill="#facc15" />
      <circle cx="32" cy="24" r="14" fill="#fde047" />
      <circle cx="27" cy="22" r="2.8" fill="#0f172a" />
      <circle cx="37" cy="22" r="2.8" fill="#0f172a" />
      <circle cx="28" cy="21" r="1" fill="#fff" />
      <circle cx="38" cy="21" r="1" fill="#fff" />
      <ellipse cx="32" cy="28" rx="5" ry="3.5" fill="#f97316" />
      <ellipse cx="46" cy="40" rx="7" ry="4" fill="#eab308" transform="rotate(20 46 40)" />
    </svg>
  );
}

function Cherry() {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <circle cx="24" cy="40" r="14" fill="#ef4444" />
      <circle cx="42" cy="38" r="13" fill="#dc2626" />
      <ellipse cx="20" cy="34" rx="4" ry="3" fill="#fca5a5" opacity="0.7" />
      <path d="M24 28 Q32 8 42 26" stroke="#166534" strokeWidth="3" fill="none" />
      <ellipse cx="34" cy="14" rx="8" ry="5" fill="#22c55e" transform="rotate(-20 34 14)" />
      <circle cx="22" cy="42" r="2" fill="#0f172a" />
      <circle cx="28" cy="42" r="2" fill="#0f172a" />
      <path d="M22 48 Q25 51 28 48" stroke="#7f1d1d" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function Fox() {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <ellipse cx="32" cy="36" rx="20" ry="18" fill="#f97316" />
      <circle cx="32" cy="28" r="16" fill="#fb923c" />
      <path d="M18 18 L22 28 L28 22 Z" fill="#ea580c" />
      <path d="M46 18 L42 28 L36 22 Z" fill="#ea580c" />
      <circle cx="26" cy="28" r="3" fill="#0f172a" />
      <circle cx="38" cy="28" r="3" fill="#0f172a" />
      <ellipse cx="32" cy="36" rx="6" ry="4" fill="#fdba74" />
      <circle cx="32" cy="34" r="2" fill="#0f172a" />
    </svg>
  );
}

function Pepe() {
  return (
    <svg viewBox="0 0 80 80" width="100%" height="100%">
      <ellipse cx="40" cy="48" rx="22" ry="18" fill="#1e293b" />
      <rect x="28" y="44" width="24" height="8" rx="2" fill="#334155" />
      <circle cx="40" cy="32" r="24" fill="#4ade80" />
      <ellipse cx="40" cy="36" rx="20" ry="16" fill="#86efac" />
      <ellipse cx="30" cy="28" rx="9" ry="10" fill="#fff" />
      <ellipse cx="50" cy="28" rx="9" ry="10" fill="#fff" />
      <circle cx="31" cy="30" r="4" fill="#0f172a" />
      <circle cx="51" cy="30" r="4" fill="#0f172a" />
      <circle cx="32.5" cy="28" r="1.4" fill="#fff" />
      <circle cx="52.5" cy="28" r="1.4" fill="#fff" />
      <ellipse cx="40" cy="42" rx="10" ry="6" fill="#ef4444" />
      <path d="M30 42 Q40 50 50 42" fill="#dc2626" />
      <path d="M22 22 Q18 12 28 18" stroke="#22c55e" strokeWidth="3" fill="none" />
      <path d="M58 22 Q62 12 52 18" stroke="#22c55e" strokeWidth="3" fill="none" />
    </svg>
  );
}

function RocketArt() {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <path d="M32 6 C40 18 42 34 40 48 L24 48 C22 34 24 18 32 6Z" fill="#e2e8f0" />
      <path d="M32 6 C36 16 38 30 37 44 L32 44 Z" fill="#94a3b8" opacity="0.5" />
      <circle cx="32" cy="28" r="6" fill="#38bdf8" />
      <circle cx="32" cy="28" r="3.5" fill="#e0f2fe" />
      <path d="M24 48 L18 58 L28 52 Z" fill="#ef4444" />
      <path d="M40 48 L46 58 L36 52 Z" fill="#ef4444" />
      <path d="M28 50 L32 62 L36 50 Z" fill="#f97316" />
      <path d="M30 54 L32 64 L34 54 Z" fill="#fbbf24" />
    </svg>
  );
}

function Gem() {
  return (
    <svg viewBox="0 0 32 32" width="100%" height="100%">
      <path d="M16 2 L28 12 L16 30 L4 12 Z" fill="#22d3ee" />
      <path d="M16 2 L28 12 L16 16 Z" fill="#67e8f9" />
      <path d="M16 2 L4 12 L16 16 Z" fill="#a5f3fc" />
      <path d="M4 12 L16 30 L16 16 Z" fill="#0891b2" />
    </svg>
  );
}

function CharBubble({
  children,
  style,
  size = 52,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  style?: Record<string, string | number | undefined>;
  size?: number;
  delay?: number;
  className?: string;
}) {
  return (
    <div
      className={`gc-char ${className}`}
      style={{
        width: size,
        height: size,
        animationDelay: `${delay}s`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Scene({ kind }: { kind: GameCardProps["scene"] }) {
  if (kind === "arena") {
    return (
      <div className="gc-sc">
        <div className="gc-arena-bg" />
        <CharBubble size={58} delay={0} style={{ left: "8%", top: "30%" }}>
          <Bird />
        </CharBubble>
        <CharBubble size={48} delay={0.4} style={{ left: "40%", top: "12%" }}>
          <Duck />
        </CharBubble>
        <CharBubble size={54} delay={0.8} style={{ right: "8%", top: "34%" }}>
          <Cherry />
        </CharBubble>
      </div>
    );
  }

  if (kind === "spin") {
    return (
      <div className="gc-sc">
        <div className="gc-spin-bg" />
        <div className="gc-wheel">
          <div className="gc-wheel-inner" />
        </div>
        <CharBubble size={44} delay={0.2} style={{ right: "10%", top: "14%" }} className="gc-drift">
          <Fox />
        </CharBubble>
        <CharBubble size={36} delay={0.7} style={{ left: "12%", bottom: "34%" }} className="gc-drift2">
          <Gem />
        </CharBubble>
      </div>
    );
  }

  if (kind === "mines") {
    return (
      <div className="gc-sc" style={{ alignItems: "center", justifyContent: "center" }}>
        <div className="gc-mines">
          {Array.from({ length: 9 }).map((_, i) => {
            const lit = i === 1 || i === 4 || i === 7;
            return (
              <div key={i} className={lit ? "gc-m gc-m-on" : "gc-m"}>
                {lit && (
                  <div className="gc-m-icon">
                    <Gem />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (kind === "coin") {
    return (
      <div className="gc-sc">
        <div className="gc-coin-bg" />
        <CharBubble size={110} delay={0} style={{ left: "50%", top: "42%", transform: "translate(-50%,-50%)" }} className="gc-pepe-wrap">
          <Pepe />
        </CharBubble>
      </div>
    );
  }

  if (kind === "crash") {
    return (
      <div className="gc-sc">
        <div className="gc-crash-glow" />
        <div className="gc-rocket-wrap">
          <RocketArt />
        </div>
        <div className="gc-mult">×2.4</div>
      </div>
    );
  }

  if (kind === "plinko") {
    return (
      <div className="gc-sc" style={{ justifyContent: "flex-start", paddingTop: 18 }}>
        <div className="gc-ball" />
        <div className="gc-plinko">
          {[1, 2, 3, 4, 5].map((r) => (
            <div key={r} className="gc-prow">
              {Array.from({ length: r }).map((_, i) => (
                <i key={i} className="gc-peg" style={{ animationDelay: `${(r + i) * 0.08}s` }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (kind === "upgrade") {
    return (
      <div className="gc-sc" style={{ flexDirection: "row", gap: 10 }}>
        <CharBubble size={44} delay={0} style={{ position: "relative" }}>
          <div className="gc-up-box" style={{ background: "#78716c" }} />
        </CharBubble>
        <span className="gc-arr">››</span>
        <CharBubble size={44} delay={0.25} style={{ position: "relative" }}>
          <div className="gc-up-box" style={{ background: "#f59e0b" }} />
        </CharBubble>
        <span className="gc-arr">››</span>
        <CharBubble size={52} delay={0.5} style={{ position: "relative" }} className="gc-up-win">
          <div className="gc-up-box" style={{ background: "linear-gradient(135deg,#fbbf24,#f472b6)", boxShadow: "0 0 16px rgba(251,191,36,0.7)" }} />
        </CharBubble>
      </div>
    );
  }

  return (
    <div className="gc-sc">
      <div className="gc-wheel" style={{ width: 70, height: 70 }} />
    </div>
  );
}

export function GameCard({
  name,
  scene = "generic",
  badge,
  badgeColor = "#f97316",
  online,
  maxBet,
  gradient,
  wide,
  onClick,
  enterDelay = 0,
  disabled,
}: GameCardProps) {
  return (
    <button
      type="button"
      className={`gc-card${wide ? " gc-wide" : ""}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        animationDelay: `${enterDelay}ms`,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <style>{CSS}</style>
      <div className="gc-bg" style={{ background: gradient }} />
      <div className="gc-shade" />
      <Scene kind={scene} />

      <div className="gc-top">
        {badge ? (
          <span className="gc-badge" style={{ background: badgeColor }}>
            {badge}
          </span>
        ) : (
          <span />
        )}
        {online != null && (
          <span className="gc-on">
            <i />
            {online}
          </span>
        )}
      </div>

      <div className="gc-bot">
        <div className="gc-name">{name}</div>
        {maxBet != null && <div className="gc-max">макс {maxBet}</div>}
      </div>
    </button>
  );
}

const CSS = `
@keyframes gcIn {
  from { opacity: 0; transform: translateY(14px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes gcFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
@keyframes gcFloatC {
  0%, 100% { transform: translate(-50%, -50%) translateY(0); }
  50% { transform: translate(-50%, -50%) translateY(-10px); }
}
@keyframes gcDrift {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(-12px, -8px); }
}
@keyframes gcDrift2 {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(10px, -12px); }
}
@keyframes gcPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.7); }
}
@keyframes gcSpin {
  to { transform: rotate(360deg); }
}
@keyframes gcRocket {
  0%, 100% { transform: translate(0, 6px) rotate(-10deg); }
  50% { transform: translate(8px, -14px) rotate(8deg); }
}
@keyframes gcMult {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.12); }
}
@keyframes gcPeg {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.25); box-shadow: 0 0 8px 2px rgba(56,189,248,0.6); }
}
@keyframes gcBall {
  0% { top: 8%; left: 48%; }
  25% { top: 28%; left: 38%; }
  50% { top: 48%; left: 58%; }
  75% { top: 68%; left: 42%; }
  100% { top: 82%; left: 50%; }
}
@keyframes gcBars {
  0% { transform: translateX(0); }
  100% { transform: translateX(-48px); }
}
@keyframes gcGemPop {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}

.gc-card {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1.05;
  border: none;
  border-radius: 22px;
  overflow: hidden;
  padding: 0;
  display: block;
  font-family: inherit;
  color: #fff;
  text-align: left;
  isolation: isolate;
  animation: gcIn 0.5s cubic-bezier(0.22,1,0.36,1) both;
  transition: transform 0.2s ease, filter 0.2s ease;
  box-shadow: 0 12px 32px rgba(0,0,0,0.45);
}
.gc-card.gc-wide { aspect-ratio: 2.05 / 1; }
.gc-card:hover:not(:disabled) {
  transform: translateY(-4px) scale(1.02);
  filter: brightness(1.06);
}
.gc-card:active:not(:disabled) { transform: scale(0.98); }

.gc-bg { position: absolute; inset: 0; }
.gc-shade {
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 90% 50% at 50% 0%, rgba(255,255,255,0.14), transparent 55%),
    linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.75) 100%);
  pointer-events: none;
  z-index: 1;
}

.gc-sc {
  position: absolute; inset: 0;
  z-index: 2;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}

.gc-char {
  position: absolute;
  border-radius: 50%;
  background: rgba(255,255,255,0.12);
  box-shadow: 0 8px 20px rgba(0,0,0,0.35), inset 0 0 0 2px rgba(255,255,255,0.2);
  overflow: hidden;
  animation: gcFloat 2.6s ease-in-out infinite;
  z-index: 3;
}
.gc-char.gc-drift { animation: gcDrift 3.2s ease-in-out infinite; }
.gc-char.gc-drift2 { animation: gcDrift2 2.8s ease-in-out infinite; }
.gc-pepe-wrap {
  background: transparent !important;
  box-shadow: none !important;
  animation: gcFloatC 2.8s ease-in-out infinite !important;
}

.gc-arena-bg {
  position: absolute; inset: 0;
  background: linear-gradient(135deg,
    #1d4ed8 0%, #1d4ed8 32%,
    #eab308 32%, #eab308 58%,
    #dc2626 58%, #dc2626 100%);
  opacity: 0.5;
  mix-blend-mode: soft-light;
}

.gc-spin-bg {
  position: absolute; inset: -30%;
  background: repeating-linear-gradient(
    -35deg,
    transparent 0 30px,
    rgba(168,85,247,0.22) 30px 44px
  );
  animation: gcBars 7s linear infinite;
}
.gc-wheel {
  width: 86px; height: 86px; border-radius: 50%;
  background: conic-gradient(from 0deg, #22d3ee, #a855f7, #f472b6, #fbbf24, #22d3ee);
  box-shadow: 0 0 28px rgba(34,211,238,0.45);
  animation: gcSpin 7s linear infinite;
  display: flex; align-items: center; justify-content: center;
  z-index: 2;
}
.gc-wheel-inner {
  width: 36px; height: 36px; border-radius: 50%;
  background: #0b0b0f;
  box-shadow: inset 0 0 0 3px rgba(255,255,255,0.15);
}

.gc-mines {
  display: grid;
  grid-template-columns: repeat(3, 30px);
  gap: 6px;
}
.gc-m {
  width: 30px; height: 30px; border-radius: 9px;
  background: rgba(0,0,0,0.35);
  border: 1px solid rgba(255,255,255,0.12);
  display: flex; align-items: center; justify-content: center;
}
.gc-m-on {
  background: linear-gradient(145deg, rgba(255,255,255,0.28), rgba(255,255,255,0.08));
}
.gc-m-icon { width: 16px; height: 16px; animation: gcGemPop 2s ease-in-out infinite; }

.gc-coin-bg {
  position: absolute; inset: 0;
  background: radial-gradient(circle at 50% 40%, rgba(56,189,248,0.35), transparent 60%);
}

.gc-rocket-wrap {
  width: 72px; height: 72px;
  animation: gcRocket 2.4s ease-in-out infinite;
  filter: drop-shadow(0 8px 16px rgba(0,0,0,0.4));
  z-index: 2;
}
.gc-crash-glow {
  position: absolute; width: 100px; height: 100px; border-radius: 50%;
  background: radial-gradient(circle, rgba(249,115,22,0.5), transparent 70%);
  filter: blur(12px);
}
.gc-mult {
  position: absolute; right: 12px; top: 36px;
  font-weight: 900; font-size: 15px; color: #fdba74;
  text-shadow: 0 0 12px rgba(249,115,22,0.85);
  animation: gcMult 1.8s ease-in-out infinite;
  z-index: 3;
}

.gc-plinko { display: flex; flex-direction: column; gap: 5px; }
.gc-prow { display: flex; gap: 8px; justify-content: center; }
.gc-peg {
  width: 7px; height: 7px; border-radius: 50%;
  background: rgba(255,255,255,0.9);
  display: inline-block;
  animation: gcPeg 2s ease-in-out infinite;
}
.gc-ball {
  position: absolute; width: 10px; height: 10px; border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #fff, #38bdf8);
  box-shadow: 0 0 10px rgba(56,189,248,0.9);
  animation: gcBall 2.6s cubic-bezier(0.4,0,0.2,1) infinite;
  z-index: 3;
}

.gc-up-box {
  width: 100%; height: 100%;
  border-radius: 12px;
}
.gc-arr {
  color: rgba(255,255,255,0.65);
  font-weight: 900;
  font-size: 16px;
}
.gc-up-win { animation: gcFloat 1.6s ease-in-out infinite !important; }

.gc-top {
  position: absolute; top: 10px; left: 10px; right: 10px;
  z-index: 5;
  display: flex; align-items: center; justify-content: space-between;
  pointer-events: none;
}
.gc-badge {
  font-size: 10px; font-weight: 900; letter-spacing: 0.04em;
  color: #fff; border-radius: 999px; padding: 4px 9px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.gc-on {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 800; color: #fff;
  background: rgba(0,0,0,0.4);
  border-radius: 999px;
  padding: 3px 8px;
  backdrop-filter: blur(6px);
}
.gc-on i {
  width: 7px; height: 7px; border-radius: 50%;
  background: #22c55e; box-shadow: 0 0 8px #22c55e;
  animation: gcPulse 1.4s ease-in-out infinite;
  display: inline-block;
}

.gc-bot {
  position: absolute; left: 0; right: 0; bottom: 0;
  z-index: 5;
  padding: 14px 14px 12px;
  pointer-events: none;
}
.gc-name {
  font-size: 20px;
  font-weight: 900;
  letter-spacing: -0.02em;
  color: #fff;
  text-shadow: 0 2px 12px rgba(0,0,0,0.65);
  line-height: 1.1;
}
.gc-max {
  margin-top: 3px;
  font-size: 11px;
  font-weight: 700;
  color: rgba(255,255,255,0.55);
}
`;
