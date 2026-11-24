/**
 * GameCard — premium illustrated cards using real public assets + layered motion
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

function Sticker({
  src,
  size,
  delay = 0,
  className = "",
  style,
}: {
  src: string;
  size: number;
  delay?: number;
  className?: string;
  style?: Record<string, string | number | undefined>;
}) {
  return (
    <div
      className={`gc-sticker ${className}`}
      style={{
        width: size,
        height: size,
        animationDelay: `${delay}s`,
        ...style,
      }}
    >
      <img src={src} alt="" draggable={false} />
    </div>
  );
}

/** Square gift tile for upgrade chain */
function Gift({
  src,
  size,
  delay = 0,
  className = "",
}: {
  src: string;
  size: number;
  delay?: number;
  className?: string;
}) {
  return (
    <div
      className={`gc-gift ${className}`}
      style={{ width: size, height: size, animationDelay: `${delay}s` }}
    >
      <img src={src} alt="" draggable={false} />
    </div>
  );
}

function Scene({ kind }: { kind: GameCardProps["scene"] }) {
  if (kind === "arena") {
    return (
      <div className="gc-sc">
        <div className="gc-arena-bg" />
        <div className="gc-grid-fx" />
        <Sticker src="/nft/neko_helmet.jpg" size={64} delay={0} style={{ left: "6%", top: "26%" }} />
        <Sticker src="/nft/royal_dogg.jpg" size={52} delay={0.35} style={{ left: "38%", top: "10%" }} className="gc-bob2" />
        <Sticker src="/nft/electric_skull.jpg" size={58} delay={0.7} style={{ right: "6%", top: "30%" }} className="gc-bob3" />
        <Sticker src="/nft/moon_pendant.jpg" size={36} delay={1.1} style={{ left: "22%", bottom: "36%" }} className="gc-drift" />
      </div>
    );
  }

  if (kind === "spin") {
    return (
      <div className="gc-sc">
        <div className="gc-spin-bars" />
        <div className="gc-wheel">
          <div className="gc-wheel-inner" />
          <div className="gc-wheel-shine" />
        </div>
        <Sticker src="/nft/snoop_cigar.jpg" size={46} delay={0.2} style={{ right: "8%", top: "12%" }} className="gc-drift" />
        <Sticker src="/nft/hypno_lollipop.jpg" size={40} delay={0.6} style={{ left: "8%", bottom: "32%" }} className="gc-drift2" />
        <Sticker src="/nft/bday_candle.jpg" size={34} delay={1} style={{ right: "18%", bottom: "38%" }} className="gc-bob2" />
      </div>
    );
  }

  if (kind === "mines") {
    return (
      <div className="gc-sc" style={{ alignItems: "center", justifyContent: "center" }}>
        <div className="gc-mines-glow" />
        <div className="gc-mines">
          {Array.from({ length: 9 }).map((_, i) => {
            const lit = i === 1 || i === 3 || i === 4 || i === 7;
            const imgs = [
              "",
              "/nft/moon_pendant.jpg",
              "",
              "/nft/electric_skull.jpg",
              "/nft/neko_helmet.jpg",
              "",
              "",
              "/nft/royal_dogg.jpg",
              "",
            ];
            return (
              <div key={i} className={lit ? "gc-m gc-m-on" : "gc-m"}>
                {lit && imgs[i] && (
                  <img src={imgs[i]} alt="" className="gc-m-img" draggable={false} />
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
        <div className="gc-coin-glow" />
        <div className="gc-hero">
          <img src="/nft/royal_dogg.jpg" alt="" draggable={false} />
        </div>
        <Sticker src="/toncoin.png" size={28} delay={0.3} style={{ left: "12%", top: "18%" }} className="gc-drift" />
        <Sticker src="/toncoin.png" size={22} delay={0.8} style={{ right: "14%", top: "22%" }} className="gc-drift2" />
      </div>
    );
  }

  if (kind === "crash") {
    return (
      <div className="gc-sc">
        <div className="gc-crash-glow" />
        <div className="gc-rocket">
          <img src="/rocket.png" alt="" draggable={false} />
        </div>
        <div className="gc-mult">x2.4</div>
        <div className="gc-trail" />
      </div>
    );
  }

  if (kind === "plinko") {
    return (
      <div className="gc-sc" style={{ justifyContent: "flex-start", paddingTop: 16 }}>
        <div className="gc-plinko-glow" />
        <div className="gc-ball" />
        <div className="gc-plinko">
          {[1, 2, 3, 4, 5, 6].map((r) => (
            <div key={r} className="gc-prow">
              {Array.from({ length: r }).map((_, i) => (
                <i key={i} className="gc-peg" style={{ animationDelay: `${(r + i) * 0.07}s` }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* Upgrade: cheap → expensive NFT gifts */
  if (kind === "upgrade") {
    return (
      <div className="gc-sc gc-upgrade-row">
        <Gift src="/nft/bday_candle.jpg" size={44} delay={0} />
        <span className="gc-arr" />
        <Gift src="/nft/hypno_lollipop.jpg" size={48} delay={0.15} className="gc-bob2" />
        <span className="gc-arr" />
        <Gift src="/nft/neko_helmet.jpg" size={52} delay={0.3} className="gc-bob3" />
        <span className="gc-arr" />
        <Gift src="/nft/moon_pendant.jpg" size={56} delay={0.45} className="gc-bob2" />
        <span className="gc-arr" />
        <Gift src="/nft/telegram_premium.jpg" size={62} delay={0.6} className="gc-win" />
      </div>
    );
  }

  if (kind === "cases") {
    return (
      <div className="gc-sc">
        <Sticker src="/nft/telegram_premium.jpg" size={88} delay={0} style={{ left: "50%", top: "40%", transform: "translate(-50%,-50%)" }} className="gc-hero-sticker" />
      </div>
    );
  }

  return (
    <div className="gc-sc">
      <Sticker src="/tonyx-logo.jpg" size={72} delay={0} style={{ left: "50%", top: "40%", transform: "translate(-50%,-50%)" }} className="gc-hero-sticker" />
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
      <div className="gc-noise" />
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
  from { opacity: 0; transform: translateY(16px) scale(0.94); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes gcFloat {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-11px) rotate(2deg); }
}
@keyframes gcFloat2 {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-8px) rotate(-3deg); }
}
@keyframes gcFloat3 {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-13px) scale(1.04); }
}
@keyframes gcHero {
  0%, 100% { transform: translate(-50%, -50%) translateY(0) scale(1); }
  50% { transform: translate(-50%, -50%) translateY(-8px) scale(1.03); }
}
@keyframes gcDrift {
  0%, 100% { transform: translate(0, 0); }
  33% { transform: translate(-10px, -8px); }
  66% { transform: translate(8px, -14px); }
}
@keyframes gcDrift2 {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(12px, -10px); }
}
@keyframes gcPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.65); }
}
@keyframes gcSpin {
  to { transform: rotate(360deg); }
}
@keyframes gcRocket {
  0%, 100% { transform: translate(0, 8px) rotate(-12deg); }
  50% { transform: translate(10px, -16px) rotate(8deg); }
}
@keyframes gcMult {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.15); opacity: 0.9; }
}
@keyframes gcPeg {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255,0.2); }
  50% { transform: scale(1.3); box-shadow: 0 0 10px 2px rgba(56,189,248,0.7); }
}
@keyframes gcBall {
  0% { top: 6%; left: 50%; }
  20% { top: 22%; left: 40%; }
  40% { top: 40%; left: 58%; }
  60% { top: 58%; left: 44%; }
  80% { top: 74%; left: 54%; }
  100% { top: 88%; left: 48%; }
}
@keyframes gcBars {
  0% { transform: translateX(0); }
  100% { transform: translateX(-56px); }
}
@keyframes gcShine {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes gcWin {
  0%, 100% { transform: translateY(0) scale(1); filter: brightness(1); }
  50% { transform: translateY(-10px) scale(1.08); filter: brightness(1.2); }
}
@keyframes gcArrPulse {
  0%, 100% { opacity: 0.45; transform: translateX(0); }
  50% { opacity: 1; transform: translateX(3px); }
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
  animation: gcIn 0.55s cubic-bezier(0.22,1,0.36,1) both;
  transition: transform 0.22s ease, filter 0.22s ease, box-shadow 0.22s ease;
  box-shadow: 0 14px 36px rgba(0,0,0,0.5);
}
.gc-card.gc-wide { aspect-ratio: 2.05 / 1; }
.gc-card:hover:not(:disabled) {
  transform: translateY(-5px) scale(1.025);
  filter: brightness(1.07);
  box-shadow: 0 20px 44px rgba(0,0,0,0.55);
}
.gc-card:active:not(:disabled) { transform: scale(0.98); }

.gc-bg { position: absolute; inset: 0; }
.gc-noise {
  position: absolute; inset: 0;
  opacity: 0.04;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  pointer-events: none;
  z-index: 1;
}
.gc-shade {
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 90% 45% at 50% 0%, rgba(255,255,255,0.16), transparent 55%),
    linear-gradient(180deg, transparent 38%, rgba(0,0,0,0.78) 100%);
  pointer-events: none;
  z-index: 1;
}

.gc-sc {
  position: absolute; inset: 0;
  z-index: 2;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}

.gc-sticker {
  position: absolute;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(255,255,255,0.08);
  box-shadow:
    0 10px 24px rgba(0,0,0,0.45),
    inset 0 0 0 2px rgba(255,255,255,0.25);
  animation: gcFloat 2.7s ease-in-out infinite;
  z-index: 3;
}
.gc-sticker img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.gc-sticker.gc-bob2 { animation-name: gcFloat2; animation-duration: 3.1s; }
.gc-sticker.gc-bob3 { animation-name: gcFloat3; animation-duration: 2.4s; }
.gc-sticker.gc-drift { animation-name: gcDrift; animation-duration: 3.6s; }
.gc-sticker.gc-drift2 { animation-name: gcDrift2; animation-duration: 3s; }
.gc-sticker.gc-win {
  animation-name: gcWin;
  animation-duration: 1.8s;
  box-shadow: 0 0 22px rgba(251,191,36,0.65), 0 10px 24px rgba(0,0,0,0.4), inset 0 0 0 2px rgba(255,255,255,0.35);
}
.gc-sticker.gc-hero-sticker {
  animation-name: gcHero;
  background: transparent;
  box-shadow: 0 12px 28px rgba(0,0,0,0.4);
  border-radius: 18px;
}

/* Upgrade gift tiles (square, sequential) */
.gc-upgrade-row {
  flex-direction: row;
  gap: 4px;
  padding: 0 10px;
  align-items: center;
  justify-content: center;
}
.gc-gift {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(255,255,255,0.08);
  box-shadow:
    0 8px 18px rgba(0,0,0,0.4),
    inset 0 0 0 1.5px rgba(255,255,255,0.22);
  animation: gcFloat 2.7s ease-in-out infinite;
  z-index: 3;
}
.gc-gift img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.gc-gift.gc-bob2 { animation-name: gcFloat2; animation-duration: 3.1s; }
.gc-gift.gc-bob3 { animation-name: gcFloat3; animation-duration: 2.4s; }
.gc-gift.gc-win {
  animation-name: gcWin;
  animation-duration: 1.8s;
  box-shadow:
    0 0 24px rgba(251,191,36,0.7),
    0 8px 18px rgba(0,0,0,0.4),
    inset 0 0 0 2px rgba(255,220,120,0.55);
}
.gc-arr {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  background: linear-gradient(90deg, rgba(255,255,255,0.25), rgba(255,255,255,0.7));
  clip-path: polygon(0 30%, 55% 30%, 55% 0, 100% 50%, 55% 100%, 55% 70%, 0 70%);
  animation: gcArrPulse 1.4s ease-in-out infinite;
}

.gc-arena-bg {
  position: absolute; inset: 0;
  background: linear-gradient(135deg,
    #1d4ed8 0%, #1d4ed8 30%,
    #eab308 30%, #eab308 56%,
    #dc2626 56%, #dc2626 100%);
  opacity: 0.55;
  mix-blend-mode: soft-light;
}
.gc-grid-fx {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
  background-size: 28px 28px;
  opacity: 0.5;
}

.gc-spin-bars {
  position: absolute; inset: -40%;
  background: repeating-linear-gradient(
    -35deg,
    transparent 0 32px,
    rgba(168,85,247,0.22) 32px 48px
  );
  animation: gcBars 8s linear infinite;
}
.gc-wheel {
  width: 92px; height: 92px; border-radius: 50%;
  background: conic-gradient(from 0deg, #22d3ee, #a855f7, #f472b6, #fbbf24, #34d399, #22d3ee);
  box-shadow: 0 0 32px rgba(34,211,238,0.5), 0 8px 24px rgba(0,0,0,0.4);
  animation: gcSpin 6.5s linear infinite;
  display: flex; align-items: center; justify-content: center;
  position: relative;
  z-index: 2;
}
.gc-wheel-inner {
  width: 38px; height: 38px; border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #1e1b4b, #0b0b0f);
  box-shadow: inset 0 0 0 3px rgba(255,255,255,0.18);
  z-index: 2;
}
.gc-wheel-shine {
  position: absolute; inset: 0; border-radius: 50%;
  background: conic-gradient(from 0deg, transparent 0 60%, rgba(255,255,255,0.35) 70%, transparent 80%);
  animation: gcShine 3s linear infinite;
}

.gc-mines-glow {
  position: absolute; width: 120px; height: 120px; border-radius: 50%;
  background: radial-gradient(circle, rgba(168,85,247,0.35), transparent 70%);
  filter: blur(16px);
}
.gc-mines {
  display: grid;
  grid-template-columns: repeat(3, 32px);
  gap: 6px;
  z-index: 2;
}
.gc-m {
  width: 32px; height: 32px; border-radius: 10px;
  background: rgba(0,0,0,0.4);
  border: 1px solid rgba(255,255,255,0.1);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.gc-m-on {
  background: linear-gradient(145deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06));
  border-color: rgba(255,255,255,0.25);
}
.gc-m-img {
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
}

.gc-coin-glow {
  position: absolute; width: 140px; height: 140px; border-radius: 50%;
  background: radial-gradient(circle, rgba(56,189,248,0.4), transparent 65%);
  filter: blur(18px);
}
.gc-hero {
  width: 108px; height: 108px;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 14px 32px rgba(0,0,0,0.45), inset 0 0 0 2px rgba(255,255,255,0.2);
  animation: gcFloat 2.8s ease-in-out infinite;
  z-index: 2;
}
.gc-hero img {
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
}

.gc-crash-glow {
  position: absolute; width: 120px; height: 120px; border-radius: 50%;
  background: radial-gradient(circle, rgba(249,115,22,0.55), transparent 70%);
  filter: blur(14px);
}
.gc-rocket {
  width: 88px; height: 88px;
  animation: gcRocket 2.3s ease-in-out infinite;
  filter: drop-shadow(0 10px 18px rgba(0,0,0,0.45));
  z-index: 2;
}
.gc-rocket img {
  width: 100%; height: 100%;
  object-fit: contain;
  display: block;
}
.gc-trail {
  position: absolute;
  width: 40px; height: 60px;
  left: 42%; top: 48%;
  background: linear-gradient(180deg, rgba(251,146,60,0.5), transparent);
  filter: blur(8px);
  border-radius: 50%;
  pointer-events: none;
}
.gc-mult {
  position: absolute; right: 12px; top: 36px;
  font-weight: 900; font-size: 16px; color: #fdba74;
  text-shadow: 0 0 14px rgba(249,115,22,0.9);
  animation: gcMult 1.7s ease-in-out infinite;
  z-index: 3;
}

.gc-plinko-glow {
  position: absolute; width: 100px; height: 100px; border-radius: 50%;
  background: radial-gradient(circle, rgba(14,165,233,0.4), transparent 70%);
  filter: blur(14px);
  top: 20%;
}
.gc-plinko { display: flex; flex-direction: column; gap: 4px; z-index: 2; }
.gc-prow { display: flex; gap: 7px; justify-content: center; }
.gc-peg {
  width: 7px; height: 7px; border-radius: 50%;
  background: rgba(255,255,255,0.92);
  display: inline-block;
  animation: gcPeg 2s ease-in-out infinite;
}
.gc-ball {
  position: absolute; width: 11px; height: 11px; border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #fff, #38bdf8);
  box-shadow: 0 0 12px rgba(56,189,248,0.95);
  animation: gcBall 2.8s cubic-bezier(0.4,0,0.2,1) infinite;
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
  box-shadow: 0 4px 14px rgba(0,0,0,0.35);
}
.gc-on {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 800; color: #fff;
  background: rgba(0,0,0,0.42);
  border-radius: 999px;
  padding: 3px 8px;
  backdrop-filter: blur(8px);
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
  text-shadow: 0 2px 14px rgba(0,0,0,0.7);
  line-height: 1.1;
}
.gc-max {
  margin-top: 3px;
  font-size: 11px;
  font-weight: 700;
  color: rgba(255,255,255,0.55);
}
`;
