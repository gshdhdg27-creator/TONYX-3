/**
 * GameCard — premium covers + stronger motion
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

const COVER: Record<string, string> = {
  arena: "/game-cards/arena.svg",
  spin: "/game-cards/spin.svg",
  mines: "/game-cards/mines.svg",
  cases: "/game-cards/upgrade.svg",
  coin: "/game-cards/coin.svg",
  crash: "/game-cards/crash.svg",
  plinko: "/game-cards/plinko.svg",
  upgrade: "/game-cards/upgrade.svg",
  generic: "/game-cards/spin.svg",
};

export function GameCard({
  name,
  scene = "generic",
  badge,
  badgeColor = "#f97316",
  online,
  maxBet,
  gradient,
  accent = "rgba(168,85,247,0.55)",
  wide,
  onClick,
  enterDelay = 0,
  disabled,
}: GameCardProps) {
  const cover = COVER[scene] ?? COVER.generic;

  return (
    <button
      type="button"
      className={`gc${wide ? " wide" : ""}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        ["--accent" as string]: accent,
        ["--delay" as string]: `${enterDelay}ms`,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <style>{CSS}</style>
      <div className="gc-rim" />
      <div className="gc-cover" style={{ background: gradient }}>
        <img className="gc-cover-img" src={cover} alt="" draggable={false} />
        <div className="gc-cover-shade" />
      </div>
      <div className="gc-sweep" />
      <div className="gc-spark s1" />
      <div className="gc-spark s2" />
      <div className="gc-spark s3" />
      <div className="gc-top">
        {badge ? (
          <span className="gc-badge" style={{ background: badgeColor }}>{badge}</span>
        ) : (
          <span />
        )}
        {online != null ? (
          <span className="gc-online"><i />{online}</span>
        ) : null}
      </div>
      <div className="gc-glass">
        <div className="gc-name">{name}</div>
        {maxBet != null ? <div className="gc-max">макс {maxBet}</div> : null}
      </div>
    </button>
  );
}

const CSS = `
@keyframes gcEnter {
  from { opacity: 0; transform: translateY(28px) scale(0.9); filter: blur(8px); }
  to { opacity: 1; transform: none; filter: none; }
}
@keyframes ken {
  0%, 100% { transform: scale(1.04) translate(0,0); }
  50% { transform: scale(1.12) translate(-1.5%, -1%); }
}
@keyframes sweep {
  0% { transform: translateX(-140%) skewX(-18deg); opacity: 0; }
  18% { opacity: 0.65; }
  100% { transform: translateX(200%) skewX(-18deg); opacity: 0; }
}
@keyframes pulseDot {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(34,197,94,0.75); }
  50% { transform: scale(0.8); box-shadow: 0 0 0 7px rgba(34,197,94,0); }
}
@keyframes rimSpin { to { transform: rotate(360deg); } }
@keyframes spark {
  0%, 100% { opacity: 0; transform: translateY(0) scale(0.4); }
  30% { opacity: 0.9; }
  100% { opacity: 0; transform: translateY(-40px) scale(1); }
}
@keyframes badgePop {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}

.gc {
  --r: 24px;
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border: 0;
  padding: 0;
  border-radius: var(--r);
  overflow: hidden;
  background: #05050a;
  isolation: isolate;
  font-family: Inter, system-ui, -apple-system, sans-serif;
  color: #fff;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
  animation: gcEnter 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: var(--delay, 0ms);
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s ease;
  box-shadow:
    0 16px 40px rgba(0,0,0,0.55),
    0 0 0 1px rgba(255,255,255,0.07);
}
.gc.wide { aspect-ratio: 2.05 / 1; }
.gc:hover:not(:disabled) {
  transform: translateY(-8px) scale(1.03);
  box-shadow:
    0 32px 64px rgba(0,0,0,0.65),
    0 0 0 1px rgba(255,255,255,0.14),
    0 0 56px color-mix(in srgb, var(--accent) 50%, transparent);
}
.gc:active:not(:disabled) {
  transform: translateY(-2px) scale(0.98);
  transition-duration: 0.1s;
}
.gc:hover:not(:disabled) .gc-cover-img { animation-duration: 7s; }
.gc:hover:not(:disabled) .gc-sweep::after { animation-duration: 1.5s; }
.gc:hover:not(:disabled) .gc-badge { animation: badgePop 1.2s ease-in-out infinite; }

.gc-rim {
  position: absolute; inset: -55%; z-index: 0;
  background: conic-gradient(
    from 120deg,
    transparent 0 55%,
    var(--accent) 68%,
    rgba(255,255,255,0.85) 78%,
    transparent 88%
  );
  animation: rimSpin 5.5s linear infinite;
  opacity: 0.5;
  pointer-events: none;
}

.gc-cover {
  position: absolute; inset: 2px;
  border-radius: calc(var(--r) - 2px);
  overflow: hidden; z-index: 1;
}
.gc-cover-img {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
  animation: ken 11s ease-in-out infinite;
  will-change: transform;
}
.gc-cover-shade {
  position: absolute; inset: 0; z-index: 3; pointer-events: none;
  background:
    radial-gradient(ellipse 100% 55% at 50% -5%, rgba(255,255,255,0.16), transparent 50%),
    linear-gradient(180deg, rgba(0,0,0,0.08) 0%, transparent 38%, rgba(0,0,0,0.4) 68%, rgba(0,0,0,0.62) 100%);
}

.gc-sweep {
  position: absolute; inset: 2px;
  border-radius: calc(var(--r) - 2px);
  overflow: hidden; z-index: 4; pointer-events: none;
}
.gc-sweep::after {
  content: "";
  position: absolute; top: -10%; bottom: -10%; width: 42%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent);
  animation: sweep 3.8s ease-in-out infinite;
}

.gc-spark {
  position: absolute; width: 5px; height: 5px; border-radius: 50%;
  background: #fff; z-index: 5; pointer-events: none;
  opacity: 0; animation: spark 2.8s ease-in-out infinite;
}
.gc-spark.s1 { left: 22%; bottom: 36%; animation-delay: 0.2s; }
.gc-spark.s2 { left: 55%; bottom: 42%; animation-delay: 1s; width: 4px; height: 4px; }
.gc-spark.s3 { left: 78%; bottom: 38%; animation-delay: 1.8s; }

.gc-top {
  position: absolute; top: 12px; left: 12px; right: 12px; z-index: 6;
  display: flex; align-items: center; justify-content: space-between;
  pointer-events: none;
}
.gc-badge {
  font-size: 10px; font-weight: 900; letter-spacing: 0.06em; color: #fff;
  border-radius: 999px; padding: 6px 12px;
  box-shadow: 0 6px 18px rgba(0,0,0,0.45);
}
.gc-online {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 800; color: #fff;
  background: rgba(0,0,0,0.52);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 999px; padding: 5px 11px;
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 6px 16px rgba(0,0,0,0.3);
}
.gc-online i {
  width: 7px; height: 7px; border-radius: 50%; background: #22c55e;
  display: inline-block; animation: pulseDot 1.5s ease-out infinite;
}

.gc-glass {
  position: absolute; left: 9px; right: 9px; bottom: 9px; z-index: 6;
  padding: 13px 14px 12px; border-radius: 16px;
  background: linear-gradient(180deg, rgba(12,12,20,0.45), rgba(8,8,14,0.72));
  border: 1px solid rgba(255,255,255,0.14);
  backdrop-filter: blur(18px) saturate(1.4);
  -webkit-backdrop-filter: blur(18px) saturate(1.4);
  box-shadow:
    0 10px 28px rgba(0,0,0,0.4),
    inset 0 1px 0 rgba(255,255,255,0.14);
  pointer-events: none;
}
.gc-name {
  font-size: 21px; font-weight: 900; letter-spacing: -0.03em;
  line-height: 1.12; color: #fff;
  text-shadow: 0 2px 14px rgba(0,0,0,0.55);
}
.gc-max {
  margin-top: 4px; font-size: 11px; font-weight: 700;
  color: rgba(255,255,255,0.58);
}
`;
