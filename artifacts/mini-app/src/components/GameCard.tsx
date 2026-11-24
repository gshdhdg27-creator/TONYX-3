/**
 * Premium GameCard — Portals / high-end mini-app style
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

/* ───────── Scenes ───────── */
function Scene({ kind, wide }: { kind: GameCardProps["scene"]; wide?: boolean }) {
  if (kind === "arena") {
    return (
      <div className="gc-scene">
        <div className="gc-floor" />
        <div className="gc-arena-ring" />
        <span className="gc-float gc-big" style={{ left: "8%", bottom: "18%", animationDelay: "0s" }}>⚔️</span>
        <span className="gc-float gc-mid" style={{ right: "10%", bottom: "22%", animationDelay: "0.5s" }}>🛡️</span>
        <span className="gc-float gc-sm" style={{ left: "42%", top: "12%", animationDelay: "0.9s" }}>💥</span>
        <span className="gc-float gc-sm" style={{ right: "28%", top: "28%", animationDelay: "1.2s" }}>✨</span>
        <div className="gc-orb gc-orb-purple" />
      </div>
    );
  }

  if (kind === "spin") {
    return (
      <div className="gc-scene">
        <div className="gc-spin-disc">
          <div className="gc-spin-inner">🎡</div>
        </div>
        <span className="gc-float gc-sm" style={{ right: "12%", top: "16%", animationDelay: "0.3s" }}>✨</span>
        <span className="gc-float gc-sm" style={{ left: "14%", bottom: "20%", animationDelay: "0.8s" }}>💎</span>
        <div className="gc-orb gc-orb-cyan" />
      </div>
    );
  }

  if (kind === "mines") {
    return (
      <div className="gc-scene" style={{ paddingTop: 8 }}>
        <div className="gc-mines">
          {Array.from({ length: 9 }).map((_, i) => {
            const lit = i === 1 || i === 4 || i === 7;
            const icons = ["", "💎", "", "", "🐸", "", "", "💠", ""];
            return (
              <div key={i} className={lit ? "gc-mine gc-mine-on" : "gc-mine"} style={{ animationDelay: `${i * 0.06}s` }}>
                {icons[i] && <span className="gc-gem">{icons[i]}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (kind === "cases") {
    return (
      <div className="gc-scene">
        <span className="gc-float gc-xl" style={{ left: "50%", top: "42%", transform: "translate(-50%, -50%)" }}>📦</span>
        <span className="gc-float gc-sm" style={{ left: "16%", top: "22%", animationDelay: "0.4s" }}>🔑</span>
        <span className="gc-float gc-sm" style={{ right: "14%", bottom: "18%", animationDelay: "0.75s" }}>✨</span>
        <div className="gc-orb gc-orb-gold" />
      </div>
    );
  }

  if (kind === "coin") {
    return (
      <div className="gc-scene">
        <div className="gc-coin-3d">🪙</div>
        <span className="gc-float gc-sm" style={{ left: "12%", top: "24%", animationDelay: "0.2s" }}>🦅</span>
        <span className="gc-float gc-sm" style={{ right: "12%", top: "28%", animationDelay: "0.55s" }}>⚪</span>
        <div className="gc-orb gc-orb-gold" />
      </div>
    );
  }

  if (kind === "crash") {
    return (
      <div className="gc-scene">
        <div className="gc-crash-glow" />
        <div className="gc-rocket">🚀</div>
        <div className="gc-mult">×2.05</div>
        <div className="gc-trail" />
      </div>
    );
  }

  if (kind === "plinko") {
    return (
      <div className="gc-scene" style={{ justifyContent: "flex-start", paddingTop: 10 }}>
        <div className="gc-plinko-ball" />
        <div className="gc-plinko-rows">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="gc-plinko-row">
              {Array.from({ length: row }).map((_, i) => (
                <span key={i} className="gc-peg" style={{ animationDelay: `${(row * 2 + i) * 0.1}s` }} />
              ))}
            </div>
          ))}
        </div>
        <div className="gc-buckets">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="gc-bucket" style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
      </div>
    );
  }

  if (kind === "upgrade") {
    return (
      <div className="gc-scene" style={{ flexDirection: "row", gap: 6 }}>
        <span className="gc-up" style={{ animationDelay: "0s" }}>🚽</span>
        <span className="gc-up-arr">››</span>
        <span className="gc-up" style={{ animationDelay: "0.2s" }}>🧸</span>
        <span className="gc-up-arr" style={{ animationDelay: "0.15s" }}>››</span>
        <span className="gc-up gc-up-win" style={{ animationDelay: "0.4s" }}>💍</span>
      </div>
    );
  }

  return (
    <div className="gc-scene">
      <span className="gc-float gc-xl">🎮</span>
    </div>
  );
}

/* ───────── Card ───────── */
export function GameCard({
  name,
  scene = "generic",
  badge,
  badgeColor = "#ec4899",
  online,
  maxBet,
  emoji,
  gradient,
  accent = "rgba(168,85,247,0.55)",
  wide,
  onClick,
  footer,
  enterDelay = 0,
  disabled,
}: GameCardProps) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      className="gc-card"
      disabled={disabled}
      style={{
        ["--gc-accent" as string]: accent,
        ["--gc-badge" as string]: badgeColor,
        height: wide ? 168 : 210,
        animationDelay: `${enterDelay}ms`,
        opacity: disabled ? 0.5 : 1,
        filter: disabled ? "grayscale(0.5)" : undefined,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <style>{CSS}</style>

      {/* layers */}
      <div className="gc-bg" style={{ background: gradient }} />
      <div className="gc-vignette" />
      <div className="gc-noise" />
      <div className="gc-shine" />
      <div className="gc-ring" />

      {/* top: online + badge */}
      <div className="gc-top">
        {badge ? (
          <span className="gc-badge" style={{ background: badgeColor, boxShadow: `0 0 16px ${badgeColor}aa` }}>
            {badge}
          </span>
        ) : (
          <span />
        )}
        {online != null && (
          <span className="gc-online">
            <i className="gc-dot" />
            {online}
          </span>
        )}
      </div>

      {/* main scene */}
      <div className="gc-scene-wrap">
        <Scene kind={scene} wide={wide} />
      </div>

      {/* glass footer */}
      <div className="gc-foot">
        <div className="gc-foot-left">
          <div className="gc-title">
            {emoji && <span className="gc-emoji">{emoji}</span>}
            {name}
          </div>
          {maxBet != null && <div className="gc-max">макс {maxBet}</div>}
        </div>
        <div className="gc-foot-right">
          {footer}
          <span className="gc-play">PLAY</span>
        </div>
      </div>
    </button>
  );
}

const CSS = `
  @keyframes gcIn {
    from { opacity: 0; transform: translateY(18px) scale(0.94); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes gcShine {
    0% { transform: translateX(-160%) skewX(-18deg); opacity: 0; }
    12% { opacity: 0.55; }
    40% { opacity: 0.08; }
    100% { transform: translateX(220%) skewX(-18deg); opacity: 0; }
  }
  @keyframes gcPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.35; transform: scale(0.7); }
  }
  @keyframes gcFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }
  @keyframes gcFloatC {
    0%, 100% { transform: translate(-50%, -50%) translateY(0); }
    50% { transform: translate(-50%, -50%) translateY(-10px); }
  }
  @keyframes gcSpin {
    to { transform: rotate(360deg); }
  }
  @keyframes gcCoin {
    0% { transform: rotateY(0) translateY(0); }
    50% { transform: rotateY(180deg) translateY(-10px); }
    100% { transform: rotateY(360deg) translateY(0); }
  }
  @keyframes gcRocket {
    0%, 100% { transform: translate(0, 6px) rotate(-10deg); }
    50% { transform: translate(8px, -14px) rotate(8deg); }
  }
  @keyframes gcMult {
    0%, 100% { transform: scale(1); opacity: 0.9; }
    50% { transform: scale(1.15); opacity: 1; }
  }
  @keyframes gcTrail {
    0% { opacity: 0; transform: scaleY(0.3) translateY(12px); }
    40% { opacity: 0.85; }
    100% { opacity: 0; transform: scaleY(1.3) translateY(-10px); }
  }
  @keyframes gcGem {
    0%, 100% { transform: scale(1) rotate(0); }
    50% { transform: scale(1.22) rotate(-12deg); }
  }
  @keyframes gcMinePop {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.06); }
  }
  @keyframes gcUp {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-8px) scale(1.1); }
  }
  @keyframes gcUpWin {
    0%, 100% { transform: scale(1.2); filter: drop-shadow(0 0 10px rgba(251,191,36,0.5)); }
    50% { transform: scale(1.35); filter: drop-shadow(0 0 20px rgba(251,191,36,0.95)); }
  }
  @keyframes gcArr {
    0%, 100% { opacity: 0.4; transform: translateX(0); }
    50% { opacity: 1; transform: translateX(4px); }
  }
  @keyframes gcPeg {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.25); transform: scale(1); }
    50% { box-shadow: 0 0 10px 2px rgba(56,189,248,0.7); transform: scale(1.2); }
  }
  @keyframes gcBall {
    0% { top: 4%; left: 48%; }
    20% { top: 20%; left: 40%; }
    40% { top: 38%; left: 56%; }
    60% { top: 56%; left: 44%; }
    80% { top: 72%; left: 52%; }
    100% { top: 86%; left: 48%; }
  }
  @keyframes gcBucket {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; filter: brightness(1.4); }
  }
  @keyframes gcOrb {
    0%, 100% { opacity: 0.45; transform: scale(1); }
    50% { opacity: 0.75; transform: scale(1.15); }
  }
  @keyframes gcBadge {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.06); }
  }

  .gc-card {
    position: relative;
    width: 100%;
    border: none;
    border-radius: 22px;
    overflow: hidden;
    padding: 0;
    display: flex;
    flex-direction: column;
    font-family: inherit;
    color: #fff;
    text-align: left;
    isolation: isolate;
    animation: gcIn 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
    transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), filter 0.2s ease;
    box-shadow: 0 18px 44px rgba(0,0,0,0.55), 0 0 0 1px var(--gc-accent), 0 0 32px var(--gc-accent);
  }
  .gc-card:hover:not(:disabled) {
    transform: translateY(-7px) scale(1.03);
    filter: brightness(1.08);
  }
  .gc-card:active:not(:disabled) {
    transform: translateY(-2px) scale(0.99);
  }

  .gc-bg { position: absolute; inset: 0; }
  .gc-vignette {
    position: absolute; inset: 0;
    background:
      radial-gradient(ellipse 100% 70% at 50% 0%, rgba(255,255,255,0.2), transparent 50%),
      linear-gradient(180deg, transparent 35%, rgba(0,0,0,0.75) 100%);
    pointer-events: none;
  }
  .gc-noise {
    position: absolute; inset: 0;
    opacity: 0.04;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    pointer-events: none;
  }
  .gc-shine {
    position: absolute; top: -40%; left: 0; width: 40%; height: 180%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
    pointer-events: none; z-index: 5;
    animation: gcShine 4.5s ease-in-out infinite;
  }
  .gc-ring {
    position: absolute; inset: 0; border-radius: 22px;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12);
    pointer-events: none; z-index: 6;
  }

  .gc-top {
    position: relative; z-index: 4;
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 10px 0;
  }
  .gc-badge {
    font-size: 10px; font-weight: 900; letter-spacing: 0.08em;
    color: #fff; border-radius: 999px; padding: 4px 10px;
    animation: gcBadge 2.4s ease-in-out infinite;
  }
  .gc-online {
    display: flex; align-items: center; gap: 5px;
    font-size: 11px; font-weight: 800;
    color: #fff;
    background: rgba(0,0,0,0.35);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 999px;
    padding: 4px 9px;
    backdrop-filter: blur(8px);
  }
  .gc-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: #22c55e; box-shadow: 0 0 10px #22c55e;
    animation: gcPulse 1.4s ease-in-out infinite;
    display: inline-block;
  }

  .gc-scene-wrap {
    position: relative; z-index: 2;
    flex: 1; min-height: 0;
    display: flex; align-items: center; justify-content: center;
  }
  .gc-scene {
    position: relative; width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  .gc-floor {
    position: absolute; left: 10%; right: 10%; bottom: 8%;
    height: 18px; border-radius: 50%;
    background: radial-gradient(ellipse, rgba(0,0,0,0.45), transparent 70%);
  }
  .gc-arena-ring {
    position: absolute; width: 90px; height: 90px; border-radius: 50%;
    border: 2px solid rgba(168,85,247,0.35);
    box-shadow: 0 0 24px rgba(168,85,247,0.3), inset 0 0 20px rgba(168,85,247,0.15);
  }
  .gc-float { position: absolute; display: inline-block; animation: gcFloat 2.6s ease-in-out infinite; filter: drop-shadow(0 6px 14px rgba(0,0,0,0.45)); }
  .gc-float.gc-xl { font-size: 56px; left: 50%; top: 50%; animation-name: gcFloatC; }
  .gc-float.gc-big { font-size: 40px; }
  .gc-float.gc-mid { font-size: 36px; }
  .gc-float.gc-sm { font-size: 20px; }

  .gc-orb {
    position: absolute; width: 110px; height: 110px; border-radius: 50%;
    filter: blur(18px); animation: gcOrb 3s ease-in-out infinite; pointer-events: none;
  }
  .gc-orb-purple { background: radial-gradient(circle, rgba(168,85,247,0.55), transparent 70%); }
  .gc-orb-cyan { background: radial-gradient(circle, rgba(34,211,238,0.5), transparent 70%); }
  .gc-orb-gold { background: radial-gradient(circle, rgba(251,191,36,0.5), transparent 70%); }

  .gc-spin-disc {
    width: 88px; height: 88px; border-radius: 50%;
    background: conic-gradient(from 0deg, #22d3ee, #a855f7, #f472b6, #22d3ee);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 28px rgba(34,211,238,0.4);
    animation: gcSpin 7s linear infinite;
  }
  .gc-spin-inner {
    width: 62px; height: 62px; border-radius: 50%;
    background: rgba(10,6,18,0.85);
    display: flex; align-items: center; justify-content: center;
    font-size: 32px;
  }

  .gc-mines {
    display: grid; grid-template-columns: repeat(3, 30px); gap: 6px;
  }
  .gc-mine {
    width: 30px; height: 30px; border-radius: 9px;
    background: rgba(0,0,0,0.4);
    border: 1px solid rgba(255,255,255,0.12);
    display: flex; align-items: center; justify-content: center;
  }
  .gc-mine-on {
    background: linear-gradient(145deg, rgba(255,255,255,0.28), rgba(255,255,255,0.08));
    animation: gcMinePop 2.4s ease-in-out infinite;
  }
  .gc-gem { display: inline-block; font-size: 14px; animation: gcGem 2s ease-in-out infinite; }

  .gc-coin-3d {
    font-size: 54px;
    filter: drop-shadow(0 10px 22px rgba(234,179,8,0.55));
    animation: gcCoin 3s ease-in-out infinite;
    transform-style: preserve-3d;
  }

  .gc-rocket {
    font-size: 52px; z-index: 2;
    filter: drop-shadow(0 8px 20px rgba(0,0,0,0.5));
    animation: gcRocket 2.4s ease-in-out infinite;
  }
  .gc-mult {
    position: absolute; right: 14px; top: 8px;
    font-weight: 900; font-size: 16px; color: #fdba74;
    text-shadow: 0 0 14px rgba(249,115,22,0.9);
    animation: gcMult 1.8s ease-in-out infinite; z-index: 3;
  }
  .gc-crash-glow {
    position: absolute; width: 100px; height: 100px; border-radius: 50%;
    background: radial-gradient(circle, rgba(249,115,22,0.55), transparent 70%);
    filter: blur(12px); animation: gcOrb 2.8s ease-in-out infinite;
  }
  .gc-trail {
    position: absolute; left: 42%; bottom: 14%; width: 8px; height: 32px; border-radius: 8px;
    background: linear-gradient(180deg, rgba(251,146,60,0.95), transparent);
    filter: blur(1.5px); animation: gcTrail 1.6s ease-in-out infinite; z-index: 1;
  }

  .gc-plinko-rows { display: flex; flex-direction: column; gap: 5px; z-index: 2; }
  .gc-plinko-row { display: flex; gap: 9px; justify-content: center; }
  .gc-peg {
    width: 7px; height: 7px; border-radius: 50%;
    background: rgba(255,255,255,0.9);
    box-shadow: 0 0 6px rgba(255,255,255,0.4);
    animation: gcPeg 2s ease-in-out infinite;
  }
  .gc-plinko-ball {
    position: absolute; width: 11px; height: 11px; border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, #fff, #38bdf8 40%, #0369a1);
    box-shadow: 0 0 12px rgba(56,189,248,0.9); z-index: 3;
    animation: gcBall 2.7s cubic-bezier(0.4,0,0.2,1) infinite;
  }
  .gc-buckets {
    position: absolute; bottom: 6px; left: 14%; right: 14%;
    display: flex; gap: 5px;
  }
  .gc-bucket {
    flex: 1; height: 8px; border-radius: 3px;
    background: linear-gradient(180deg, rgba(56,189,248,0.9), rgba(14,165,233,0.35));
    animation: gcBucket 2s ease-in-out infinite;
  }

  .gc-up {
    font-size: 28px; display: inline-block;
    filter: drop-shadow(0 4px 12px rgba(0,0,0,0.4));
    animation: gcUp 2s ease-in-out infinite;
  }
  .gc-up-win { animation: gcUpWin 1.6s ease-in-out infinite !important; }
  .gc-up-arr {
    font-size: 15px; font-weight: 900; color: rgba(255,255,255,0.7);
    animation: gcArr 1.2s ease-in-out infinite; display: inline-block;
  }

  .gc-foot {
    position: relative; z-index: 4;
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px;
    margin: 0 8px 8px;
    padding: 10px 12px;
    border-radius: 14px;
    background: rgba(0,0,0,0.42);
    border: 1px solid rgba(255,255,255,0.1);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  .gc-foot-left { min-width: 0; flex: 1; }
  .gc-title {
    font-weight: 900; font-size: 14px; letter-spacing: 0.04em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    text-shadow: 0 2px 10px rgba(0,0,0,0.5);
    display: flex; align-items: center; gap: 6px;
  }
  .gc-emoji { font-size: 15px; }
  .gc-max {
    margin-top: 2px;
    font-size: 10px; font-weight: 700;
    color: rgba(255,255,255,0.55);
  }
  .gc-foot-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .gc-play {
    font-size: 11px; font-weight: 900; letter-spacing: 0.1em;
    color: #0a0612;
    background: linear-gradient(135deg, #fff 0%, #e2e8f0 100%);
    border-radius: 999px;
    padding: 6px 12px;
    box-shadow: 0 4px 14px rgba(255,255,255,0.25);
  }
`;
