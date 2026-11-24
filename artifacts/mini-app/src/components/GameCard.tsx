/**
 * GameCard — dedicated SVG covers per game + glass UI
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
  from { opacity: 0; transform: translateY(22px) scale(0.94); filter: blur(5px); }
  to { opacity: 1; transform: none; filter: none; }
}
@keyframes ken {
  0%, 100% { transform: scale(1.05); }
  50% { transform: scale(1.12); }
}
@keyframes sweep {
  0% { transform: translateX(-130%) skewX(-16deg); opacity: 0; }
  20% { opacity: 0.5; }
  100% { transform: translateX(180%) skewX(-16deg); opacity: 0; }
}
@keyframes pulseDot {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(34,197,94,0.7); }
  50% { transform: scale(0.85); box-shadow: 0 0 0 6px rgba(34,197,94,0); }
}
@keyframes rimSpin { to { transform: rotate(360deg); } }

.gc {
  --r: 22px;
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border: 0;
  padding: 0;
  border-radius: var(--r);
  overflow: hidden;
  background: #07070c;
  isolation: isolate;
  font-family: Inter, system-ui, -apple-system, sans-serif;
  color: #fff;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
  animation: gcEnter 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: var(--delay, 0ms);
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.35s ease;
  box-shadow: 0 14px 36px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06);
}
.gc.wide { aspect-ratio: 2.05 / 1; }
.gc:hover:not(:disabled) {
  transform: translateY(-6px) scale(1.025);
  box-shadow: 0 28px 56px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.12), 0 0 48px color-mix(in srgb, var(--accent) 45%, transparent);
}
.gc:active:not(:disabled) { transform: translateY(-2px) scale(0.985); transition-duration: 0.12s; }

.gc-rim {
  position: absolute; inset: -50%; z-index: 0;
  background: conic-gradient(from 180deg, transparent 0 62%, var(--accent) 72%, rgba(255,255,255,0.7) 80%, transparent 90%);
  animation: rimSpin 7s linear infinite;
  opacity: 0.4; pointer-events: none;
}
.gc-cover {
  position: absolute; inset: 1.5px;
  border-radius: calc(var(--r) - 1.5px);
  overflow: hidden; z-index: 1;
}
.gc-cover-img {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
  animation: ken 12s ease-in-out infinite;
  will-change: transform;
}
.gc-cover-shade {
  position: absolute; inset: 0; z-index: 3; pointer-events: none;
  background:
    radial-gradient(ellipse 90% 50% at 50% 0%, rgba(255,255,255,0.12), transparent 55%),
    linear-gradient(180deg, rgba(0,0,0,0.1) 0%, transparent 40%, rgba(0,0,0,0.35) 65%, rgba(0,0,0,0.55) 100%);
}
.gc-sweep {
  position: absolute; inset: 1.5px;
  border-radius: calc(var(--r) - 1.5px);
  overflow: hidden; z-index: 4; pointer-events: none;
}
.gc-sweep::after {
  content: "";
  position: absolute; top: 0; bottom: 0; width: 40%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent);
  animation: sweep 4.5s ease-in-out infinite;
}
.gc-top {
  position: absolute; top: 11px; left: 11px; right: 11px; z-index: 6;
  display: flex; align-items: center; justify-content: space-between;
  pointer-events: none;
}
.gc-badge {
  font-size: 10px; font-weight: 900; letter-spacing: 0.05em; color: #fff;
  border-radius: 999px; padding: 5px 11px;
  box-shadow: 0 6px 16px rgba(0,0,0,0.4);
}
.gc-online {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 800; color: #fff;
  background: rgba(0,0,0,0.5);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 999px; padding: 5px 10px;
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 6px 16px rgba(0,0,0,0.3);
}
.gc-online i {
  width: 7px; height: 7px; border-radius: 50%; background: #22c55e;
  display: inline-block; animation: pulseDot 1.6s ease-out infinite;
}
.gc-glass {
  position: absolute; left: 8px; right: 8px; bottom: 8px; z-index: 6;
  padding: 12px 14px 11px; border-radius: 16px;
  background: rgba(8, 8, 14, 0.55);
  border: 1px solid rgba(255,255,255,0.12);
  backdrop-filter: blur(16px) saturate(1.3);
  -webkit-backdrop-filter: blur(16px) saturate(1.3);
  box-shadow: 0 8px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1);
  pointer-events: none;
}
.gc-name {
  font-size: 20px; font-weight: 900; letter-spacing: -0.03em;
  line-height: 1.15; color: #fff;
  text-shadow: 0 1px 12px rgba(0,0,0,0.5);
}
.gc-max {
  margin-top: 3px; font-size: 11px; font-weight: 700;
  color: rgba(255,255,255,0.55);
}
`;
