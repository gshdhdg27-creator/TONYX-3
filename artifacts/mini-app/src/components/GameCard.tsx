/**
 * GameCard — style matched to reference hub (square tiles, title bottom, online top-right)
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

function Scene({ kind }: { kind: GameCardProps["scene"] }) {
  if (kind === "arena") {
    return (
      <div className="gc-sc">
        <div className="gc-arena-split" />
        <span className="gc-bob" style={{ left: "10%", top: "28%", fontSize: 36, animationDelay: "0s" }}>🐦</span>
        <span className="gc-bob" style={{ left: "42%", top: "14%", fontSize: 30, animationDelay: "0.35s" }}>🦆</span>
        <span className="gc-bob" style={{ right: "12%", top: "32%", fontSize: 34, animationDelay: "0.7s" }}>🍒</span>
        <span className="gc-bob" style={{ left: "28%", bottom: "38%", fontSize: 18, animationDelay: "1s", opacity: 0.7 }}>✨</span>
      </div>
    );
  }
  if (kind === "spin") {
    return (
      <div className="gc-sc">
        <div className="gc-spin-bars" />
        <div className="gc-spin-core">🎡</div>
        <span className="gc-bob" style={{ right: "14%", top: "18%", fontSize: 28, animationDelay: "0.2s" }}>🦊</span>
        <span className="gc-bob" style={{ left: "12%", bottom: "36%", fontSize: 22, animationDelay: "0.6s" }}>💎</span>
      </div>
    );
  }
  if (kind === "mines") {
    return (
      <div className="gc-sc" style={{ alignItems: "center", justifyContent: "center" }}>
        <div className="gc-mines">
          {Array.from({ length: 9 }).map((_, i) => {
            const lit = i === 1 || i === 4 || i === 7;
            const ic = ["", "💎", "", "", "🐸", "", "", "💠", ""][i];
            return (
              <div key={i} className={lit ? "gc-m gc-m-on" : "gc-m"}>
                {ic && <span className="gc-gem">{ic}</span>}
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
        <div className="gc-pepe">🐸</div>
        <span className="gc-bob" style={{ left: "12%", top: "20%", fontSize: 22, animationDelay: "0.3s" }}>🪙</span>
        <span className="gc-bob" style={{ right: "14%", top: "24%", fontSize: 18, animationDelay: "0.7s" }}>✨</span>
      </div>
    );
  }
  if (kind === "crash") {
    return (
      <div className="gc-sc">
        <div className="gc-rocket">🚀</div>
        <div className="gc-mult">×2.4</div>
        <span className="gc-bob" style={{ left: "14%", bottom: "40%", fontSize: 16, animationDelay: "0.4s" }}>🔥</span>
      </div>
    );
  }
  if (kind === "plinko") {
    return (
      <div className="gc-sc" style={{ justifyContent: "flex-start", paddingTop: 16 }}>
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
      <div className="gc-sc" style={{ flexDirection: "row", gap: 8 }}>
        <span className="gc-bob" style={{ fontSize: 32, position: "relative", animationDelay: "0s" }}>🚽</span>
        <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 900 }}>››</span>
        <span className="gc-bob" style={{ fontSize: 32, position: "relative", animationDelay: "0.25s" }}>🧸</span>
        <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 900 }}>››</span>
        <span className="gc-bob" style={{ fontSize: 36, position: "relative", animationDelay: "0.5s", filter: "drop-shadow(0 0 12px gold)" }}>💍</span>
      </div>
    );
  }
  if (kind === "cases") {
    return (
      <div className="gc-sc">
        <span className="gc-bob" style={{ left: "50%", top: "40%", fontSize: 52, transform: "translate(-50%,-50%)", animationName: "gcBobC" }}>📦</span>
        <span className="gc-bob" style={{ left: "16%", top: "22%", fontSize: 22, animationDelay: "0.4s" }}>🔑</span>
      </div>
    );
  }
  return (
    <div className="gc-sc">
      <span className="gc-bob" style={{ left: "50%", top: "40%", fontSize: 48, transform: "translate(-50%,-50%)", animationName: "gcBobC" }}>🎮</span>
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
  accent = "rgba(168,85,247,0.4)",
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
        ["--a" as string]: accent,
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
@keyframes gcBob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-9px); }
}
@keyframes gcBobC {
  0%, 100% { transform: translate(-50%, -50%) translateY(0); }
  50% { transform: translate(-50%, -50%) translateY(-9px); }
}
@keyframes gcPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.7); }
}
@keyframes gcSpin {
  to { transform: rotate(360deg); }
}
@keyframes gcRocket {
  0%, 100% { transform: translate(0,4px) rotate(-8deg); }
  50% { transform: translate(6px,-12px) rotate(6deg); }
}
@keyframes gcMult {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.12); }
}
@keyframes gcGem {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.2) rotate(-8deg); }
}
@keyframes gcPeg {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255,0.3); }
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
  100% { transform: translateX(-40px); }
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
.gc-card.gc-wide {
  aspect-ratio: 2.05 / 1;
}
.gc-card:hover:not(:disabled) {
  transform: translateY(-4px) scale(1.02);
  filter: brightness(1.06);
}
.gc-card:active:not(:disabled) {
  transform: scale(0.98);
}

.gc-bg { position: absolute; inset: 0; }
.gc-shade {
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 90% 50% at 50% 0%, rgba(255,255,255,0.12), transparent 55%),
    linear-gradient(180deg, transparent 42%, rgba(0,0,0,0.72) 100%);
  pointer-events: none;
  z-index: 1;
}

.gc-sc {
  position: absolute; inset: 0;
  z-index: 2;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}

.gc-bob {
  position: absolute;
  display: inline-block;
  animation: gcBob 2.5s ease-in-out infinite;
  filter: drop-shadow(0 6px 12px rgba(0,0,0,0.4));
  z-index: 2;
}

.gc-arena-split {
  position: absolute; inset: 0;
  background:
    linear-gradient(135deg,
      #1d4ed8 0%, #1d4ed8 32%,
      #eab308 32%, #eab308 58%,
      #dc2626 58%, #dc2626 100%);
  opacity: 0.55;
  mix-blend-mode: soft-light;
}

.gc-spin-bars {
  position: absolute; inset: -20%;
  background: repeating-linear-gradient(
    -35deg,
    transparent,
    transparent 28px,
    rgba(168,85,247,0.25) 28px,
    rgba(168,85,247,0.25) 40px
  );
  animation: gcBars 6s linear infinite;
}
.gc-spin-core {
  font-size: 52px;
  filter: drop-shadow(0 8px 20px rgba(0,0,0,0.4));
  animation: gcSpin 8s linear infinite;
  z-index: 2;
}

.gc-mines {
  display: grid;
  grid-template-columns: repeat(3, 28px);
  gap: 5px;
}
.gc-m {
  width: 28px; height: 28px; border-radius: 8px;
  background: rgba(0,0,0,0.35);
  border: 1px solid rgba(255,255,255,0.12);
  display: flex; align-items: center; justify-content: center;
}
.gc-m-on {
  background: linear-gradient(145deg, rgba(255,255,255,0.3), rgba(255,255,255,0.08));
}
.gc-gem { font-size: 13px; animation: gcGem 2s ease-in-out infinite; display: inline-block; }

.gc-pepe {
  font-size: 72px;
  filter: drop-shadow(0 10px 20px rgba(0,0,0,0.35));
  animation: gcBob 2.8s ease-in-out infinite;
}

.gc-rocket {
  font-size: 52px;
  animation: gcRocket 2.4s ease-in-out infinite;
  filter: drop-shadow(0 8px 16px rgba(0,0,0,0.4));
}
.gc-mult {
  position: absolute; right: 12px; top: 36px;
  font-weight: 900; font-size: 15px; color: #fdba74;
  text-shadow: 0 0 12px rgba(249,115,22,0.8);
  animation: gcMult 1.8s ease-in-out infinite;
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
