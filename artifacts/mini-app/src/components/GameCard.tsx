/**
 * GameCard — Portals-level premium cards
 * Large character art, clean layout, strong motion.
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

const MAGE = {
  fire: "/mages/kalen-inferno-blaze.jpg",
  ice: "/mages/frost-weaver.jpg",
  void: "/mages/elara-void-weaver.jpg",
  storm: "/mages/korvin-thunderclap.jpg",
  star: "/mages/silas-starsinger.jpg",
  chrono: "/mages/solaris-chronos-shaper.jpg",
  emerald: "/mages/lyra-emerald-chronomancer.jpg",
  abyss: "/mages/aethel-abyss-weaver.jpg",
};

const NFT = {
  candle: "/nft/bday_candle.jpg",
  lolli: "/nft/hypno_lollipop.jpg",
  neko: "/nft/neko_helmet.jpg",
  pendant: "/nft/moon_pendant.jpg",
  premium: "/nft/telegram_premium.jpg",
  dog: "/nft/royal_dogg.jpg",
  skull: "/nft/electric_skull.jpg",
};

function Scene({ kind }: { kind: GameCardProps["scene"] }) {
  if (kind === "arena") {
    return (
      <div className="gc-art">
        <div className="gc-split" />
        <div className="gc-glow g1" />
        <div className="gc-glow g2" />
        <div className="gc-char c1">
          <img src={MAGE.fire} alt="" draggable={false} />
        </div>
        <div className="gc-char c2">
          <img src={MAGE.ice} alt="" draggable={false} />
        </div>
        <div className="gc-char c3">
          <img src={MAGE.void} alt="" draggable={false} />
        </div>
        <div className="gc-vs">VS</div>
      </div>
    );
  }

  if (kind === "spin") {
    return (
      <div className="gc-art">
        <div className="gc-rays" />
        <div className="gc-wheel">
          <div className="gc-wheel-core" />
        </div>
        <div className="gc-char sc1">
          <img src={MAGE.star} alt="" draggable={false} />
        </div>
        <div className="gc-char sc2">
          <img src={MAGE.emerald} alt="" draggable={false} />
        </div>
      </div>
    );
  }

  if (kind === "coin") {
    return (
      <div className="gc-art gc-center">
        <div className="gc-glow g3" />
        <div className="gc-hero">
          <img src={NFT.dog} alt="" draggable={false} />
          <div className="gc-hero-ring" />
        </div>
        <div className="gc-ton a">
          <img src="/toncoin.png" alt="" draggable={false} />
        </div>
        <div className="gc-ton b">
          <img src="/toncoin.png" alt="" draggable={false} />
        </div>
      </div>
    );
  }

  if (kind === "crash") {
    return (
      <div className="gc-art gc-center">
        <div className="gc-glow g2" />
        <div className="gc-rocket">
          <img src="/rocket.png" alt="" draggable={false} />
        </div>
        <div className="gc-mult">×2.4</div>
        <div className="gc-trail" />
      </div>
    );
  }

  if (kind === "mines") {
    return (
      <div className="gc-art gc-center">
        <div className="gc-board">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
            const open = i === 1 || i === 4 || i === 7;
            const src = [NFT.pendant, NFT.neko, NFT.skull][[1, 4, 7].indexOf(i)] ?? NFT.pendant;
            return (
              <div key={i} className={open ? "gc-cell open" : "gc-cell"}>
                {open ? <img src={src} alt="" draggable={false} /> : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (kind === "plinko") {
    return (
      <div className="gc-art">
        <div className="gc-pegs">
          {[1, 2, 3, 4, 5, 6].map((r) => (
            <div key={r} className="gc-prow">
              {Array.from({ length: r }).map((_, i) => (
                <span key={i} className="gc-peg" style={{ animationDelay: `${(r + i) * 0.07}s` }} />
              ))}
            </div>
          ))}
        </div>
        <div className="gc-ball" />
      </div>
    );
  }

  if (kind === "upgrade") {
    const chain = [NFT.candle, NFT.lolli, NFT.neko, NFT.pendant, NFT.premium];
    return (
      <div className="gc-art gc-center gc-upgrade">
        {chain.map((src, i) => (
          <div key={src} className="gc-step">
            <div
              className={`gc-gift${i === chain.length - 1 ? " win" : ""}`}
              style={{
                width: 36 + i * 6,
                height: 36 + i * 6,
                animationDelay: `${i * 0.1}s`,
              }}
            >
              <img src={src} alt="" draggable={false} />
            </div>
            {i < chain.length - 1 ? <span className="gc-arr" /> : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="gc-art gc-center">
      <div className="gc-hero">
        <img src={MAGE.chrono} alt="" draggable={false} />
      </div>
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
  accent = "rgba(168,85,247,0.55)",
  wide,
  onClick,
  enterDelay = 0,
  disabled,
}: GameCardProps) {
  return (
    <button
      type="button"
      className={`gc${wide ? " wide" : ""}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        ["--accent" as string]: accent,
        animationDelay: `${enterDelay}ms`,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <style>{CSS}</style>
      <div className="gc-border" />
      <div className="gc-fill" style={{ background: gradient }} />
      <div className="gc-shine" />
      <div className="gc-vignette" />
      <Scene kind={scene} />

      <div className="gc-top">
        {badge ? (
          <span className="gc-badge" style={{ background: badgeColor }}>
            {badge}
          </span>
        ) : (
          <span />
        )}
        {online != null ? (
          <span className="gc-online">
            <i />
            {online}
          </span>
        ) : null}
      </div>

      <div className="gc-bottom">
        <div className="gc-name">{name}</div>
        {maxBet != null ? <div className="gc-max">макс {maxBet}</div> : null}
      </div>
    </button>
  );
}

const CSS = `
@keyframes gcIn {
  from { opacity: 0; transform: translateY(20px) scale(0.94); }
  to { opacity: 1; transform: none; }
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
@keyframes floatR {
  0%, 100% { transform: translateY(0) rotate(-4deg); }
  50% { transform: translateY(-8px) rotate(4deg); }
}
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes fly {
  0%, 100% { transform: translate(0, 6px) rotate(-8deg); }
  50% { transform: translate(10px, -16px) rotate(8deg); }
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(0.85); }
}
@keyframes shine {
  0% { transform: translateX(-130%) skewX(-18deg); }
  100% { transform: translateX(220%) skewX(-18deg); }
}
@keyframes borderSpin {
  to { transform: rotate(360deg); }
}
@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(250,204,21,0.35); }
  50% { box-shadow: 0 0 22px 4px rgba(250,204,21,0.55); }
}
@keyframes fall {
  0% { top: 8%; left: 48%; opacity: 1; }
  40% { left: 38%; }
  70% { left: 58%; }
  100% { top: 78%; left: 50%; opacity: 0.2; }
}
@keyframes peg {
  0%, 100% { transform: scale(1); opacity: 0.7; }
  50% { transform: scale(1.35); opacity: 1; }
}
@keyframes tonFloat {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-14px) scale(1.08); }
}

.gc {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border: none;
  border-radius: 22px;
  padding: 0;
  overflow: hidden;
  background: #0a0a0f;
  isolation: isolate;
  animation: gcIn 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.28s ease;
  box-shadow: 0 12px 32px rgba(0,0,0,0.45);
  -webkit-tap-highlight-color: transparent;
  font-family: Inter, system-ui, -apple-system, sans-serif;
}
.gc.wide { aspect-ratio: 2.05 / 1; }
.gc:active:not(:disabled) { transform: scale(0.97); }
.gc:hover:not(:disabled) {
  transform: translateY(-4px) scale(1.02);
  box-shadow: 0 20px 48px rgba(0,0,0,0.55), 0 0 0 1px var(--accent);
}

.gc-border {
  position: absolute;
  inset: -40%;
  background: conic-gradient(from 0deg, transparent 0 70%, var(--accent) 78%, #fff 88%, transparent 100%);
  animation: borderSpin 5s linear infinite;
  opacity: 0.55;
  z-index: 0;
}
.gc-fill {
  position: absolute;
  inset: 2px;
  border-radius: 20px;
  z-index: 1;
}
.gc-shine {
  position: absolute;
  inset: 2px;
  border-radius: 20px;
  overflow: hidden;
  z-index: 5;
  pointer-events: none;
}
.gc-shine::after {
  content: "";
  position: absolute;
  top: 0; bottom: 0;
  width: 45%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
  animation: shine 3.8s ease-in-out infinite;
}
.gc-vignette {
  position: absolute;
  inset: 2px;
  border-radius: 20px;
  background: radial-gradient(ellipse at 50% 30%, transparent 30%, rgba(0,0,0,0.55) 100%);
  z-index: 2;
  pointer-events: none;
}

.gc-art {
  position: absolute;
  inset: 2px;
  border-radius: 20px;
  overflow: hidden;
  z-index: 3;
}
.gc-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.gc-split {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(122deg,
      #1d4ed8 0%, #1d4ed8 32%,
      #ca8a04 32%, #ca8a04 48%,
      #b91c1c 48%, #b91c1c 100%);
  opacity: 0.9;
}
.gc-glow {
  position: absolute;
  width: 90px; height: 90px;
  border-radius: 50%;
  filter: blur(28px);
  pointer-events: none;
}
.gc-glow.g1 { left: 8%; top: 20%; background: rgba(56,189,248,0.55); }
.gc-glow.g2 { right: 6%; bottom: 22%; background: rgba(249,115,22,0.5); }
.gc-glow.g3 { left: 50%; top: 30%; margin-left: -45px; background: rgba(250,204,21,0.45); }

.gc-char {
  position: absolute;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 10px 28px rgba(0,0,0,0.5), inset 0 0 0 2px rgba(255,255,255,0.35);
  z-index: 4;
  background: #111;
}
.gc-char img {
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
}
.gc-char.c1 {
  width: 72px; height: 72px;
  left: 10%; top: 22%;
  animation: float 2.6s ease-in-out infinite;
}
.gc-char.c2 {
  width: 64px; height: 64px;
  right: 10%; top: 18%;
  animation: floatR 2.9s ease-in-out infinite 0.2s;
}
.gc-char.c3 {
  width: 52px; height: 52px;
  left: 38%; top: 42%;
  animation: float 3.1s ease-in-out infinite 0.35s;
}
.gc-vs {
  position: absolute;
  left: 50%; top: 58%;
  transform: translateX(-50%);
  font-weight: 900;
  font-size: 15px;
  letter-spacing: 0.08em;
  color: #fff;
  text-shadow: 0 2px 12px rgba(0,0,0,0.8), 0 0 20px rgba(255,255,255,0.35);
  z-index: 5;
}

.gc-rays {
  position: absolute;
  inset: -20%;
  background: repeating-conic-gradient(
    from 0deg,
    rgba(255,255,255,0.07) 0deg 12deg,
    transparent 12deg 24deg
  );
  animation: spin 18s linear infinite;
}
.gc-wheel {
  position: absolute;
  left: 50%; top: 42%;
  width: 110px; height: 110px;
  margin: -55px 0 0 -55px;
  border-radius: 50%;
  background: conic-gradient(
    #ef4444 0 45deg,
    #eab308 45deg 90deg,
    #22c55e 90deg 135deg,
    #3b82f6 135deg 180deg,
    #a855f7 180deg 225deg,
    #f97316 225deg 270deg,
    #ec4899 270deg 315deg,
    #06b6d4 315deg 360deg
  );
  box-shadow: 0 0 0 4px rgba(255,255,255,0.2), 0 12px 28px rgba(0,0,0,0.45);
  animation: spin 6s linear infinite;
  z-index: 3;
}
.gc-wheel-core {
  position: absolute;
  inset: 28%;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #2e1065, #0b0b0f);
  box-shadow: inset 0 0 0 2px rgba(255,255,255,0.2);
}
.gc-char.sc1 {
  width: 48px; height: 48px;
  left: 12%; bottom: 28%;
  animation: float 2.7s ease-in-out infinite;
}
.gc-char.sc2 {
  width: 44px; height: 44px;
  right: 12%; bottom: 32%;
  animation: floatR 3s ease-in-out infinite 0.25s;
}

.gc-hero {
  position: relative;
  width: 112px; height: 112px;
  border-radius: 28px;
  overflow: hidden;
  box-shadow: 0 16px 36px rgba(0,0,0,0.5), inset 0 0 0 2px rgba(255,255,255,0.28);
  animation: float 2.5s ease-in-out infinite;
  z-index: 4;
  background: #111;
}
.gc-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gc-hero-ring {
  position: absolute;
  inset: -5px;
  border-radius: 32px;
  border: 2px solid rgba(255,255,255,0.28);
  animation: pulse 2s ease-in-out infinite;
  pointer-events: none;
}
.gc-ton {
  position: absolute;
  width: 28px; height: 28px;
  z-index: 5;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.4));
  animation: tonFloat 2.4s ease-in-out infinite;
}
.gc-ton img { width: 100%; height: 100%; object-fit: contain; }
.gc-ton.a { left: 14%; top: 28%; animation-delay: 0s; }
.gc-ton.b { right: 14%; top: 36%; animation-delay: 0.4s; }

.gc-rocket {
  width: 92px; height: 92px;
  animation: fly 2.1s ease-in-out infinite;
  filter: drop-shadow(0 12px 18px rgba(0,0,0,0.45));
  z-index: 4;
}
.gc-rocket img { width: 100%; height: 100%; object-fit: contain; display: block; }
.gc-mult {
  position: absolute;
  right: 14px; top: 34px;
  font-weight: 900;
  font-size: 18px;
  color: #fdba74;
  text-shadow: 0 0 16px rgba(249,115,22,0.95);
  z-index: 5;
}
.gc-trail {
  position: absolute;
  width: 26px; height: 42px;
  left: 50%; top: 56%;
  margin-left: -13px;
  background: radial-gradient(ellipse at 50% 0%, #fbbf24, #f97316 45%, transparent 70%);
  filter: blur(7px);
  animation: pulse 0.7s ease-in-out infinite;
  z-index: 2;
}

.gc-board {
  display: grid;
  grid-template-columns: repeat(3, 38px);
  gap: 7px;
  z-index: 4;
}
.gc-cell {
  width: 38px; height: 38px;
  border-radius: 12px;
  background: rgba(0,0,0,0.42);
  border: 1px solid rgba(255,255,255,0.1);
  overflow: hidden;
}
.gc-cell.open {
  background: rgba(255,255,255,0.12);
  border-color: rgba(255,255,255,0.3);
  box-shadow: 0 0 14px rgba(168,85,247,0.4);
}
.gc-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }

.gc-pegs {
  position: absolute;
  left: 0; right: 0; top: 14%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  z-index: 3;
}
.gc-prow { display: flex; gap: 9px; }
.gc-peg {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #fff;
  animation: peg 2s ease-in-out infinite;
}
.gc-ball {
  position: absolute;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #fff, #38bdf8);
  box-shadow: 0 0 14px rgba(56,189,248,1);
  animation: fall 2.4s cubic-bezier(0.4,0,0.2,1) infinite;
  z-index: 4;
}

.gc-upgrade {
  gap: 2px;
  padding: 0 8px;
  flex-wrap: nowrap;
}
.gc-step {
  display: flex;
  align-items: center;
  gap: 2px;
}
.gc-gift {
  border-radius: 13px;
  overflow: hidden;
  box-shadow: 0 8px 18px rgba(0,0,0,0.4), inset 0 0 0 1.5px rgba(255,255,255,0.25);
  animation: float 2.5s ease-in-out infinite;
  flex-shrink: 0;
  background: #111;
}
.gc-gift img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gc-gift.win { animation-name: glowPulse; animation-duration: 1.4s; }
.gc-arr {
  width: 10px; height: 10px;
  background: linear-gradient(90deg, rgba(255,255,255,0.25), rgba(255,255,255,0.9));
  clip-path: polygon(0 25%, 60% 25%, 60% 0, 100% 50%, 60% 100%, 60% 75%, 0 75%);
  flex-shrink: 0;
  margin: 0 1px;
}

.gc-top {
  position: absolute;
  top: 11px; left: 11px; right: 11px;
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
}
.gc-badge {
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.04em;
  color: #fff;
  border-radius: 999px;
  padding: 5px 10px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.35);
}
.gc-online {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 800;
  color: #fff;
  background: rgba(0,0,0,0.5);
  border-radius: 999px;
  padding: 4px 9px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.25);
}
.gc-online i {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 10px #22c55e;
  animation: pulse 1.3s ease-in-out infinite;
  display: inline-block;
}

.gc-bottom {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  z-index: 8;
  padding: 18px 14px 14px;
  background: linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.35) 55%, transparent 100%);
  pointer-events: none;
  border-radius: 0 0 20px 20px;
}
.gc-name {
  font-size: 21px;
  font-weight: 900;
  letter-spacing: -0.03em;
  color: #fff;
  text-shadow: 0 2px 14px rgba(0,0,0,0.8);
  line-height: 1.1;
  text-align: left;
}
.gc-max {
  margin-top: 3px;
  font-size: 11px;
  font-weight: 700;
  color: rgba(255,255,255,0.55);
  text-align: left;
}
`;
