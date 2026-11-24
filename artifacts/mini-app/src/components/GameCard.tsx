/**
 * GameCard — clean Portals-style tiles (full rewrite)
 * artifacts/mini-app/src/components/GameCard.tsx
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

function Img({ src, className }: { src: string; className?: string }) {
  return <img src={src} alt="" className={className} draggable={false} />;
}

function Scene({ kind }: { kind: GameCardProps["scene"] }) {
  if (kind === "arena") {
    return (
      <div className="gc-art">
        <div className="gc-split" />
        <div className="gc-float a1"><Img src="/nft/neko_helmet.jpg" /></div>
        <div className="gc-float a2"><Img src="/nft/royal_dogg.jpg" /></div>
        <div className="gc-float a3"><Img src="/nft/electric_skull.jpg" /></div>
      </div>
    );
  }

  if (kind === "spin") {
    return (
      <div className="gc-art">
        <div className="gc-spin-rays" />
        <div className="gc-wheel" />
        <div className="gc-float s1"><Img src="/nft/snoop_cigar.jpg" /></div>
        <div className="gc-float s2"><Img src="/nft/hypno_lollipop.jpg" /></div>
      </div>
    );
  }

  if (kind === "mines") {
    return (
      <div className="gc-art gc-center">
        <div className="gc-board">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
            const open = [1, 4, 7].includes(i);
            const src = ["/nft/moon_pendant.jpg", "/nft/neko_helmet.jpg", "/nft/royal_dogg.jpg"][
              [1, 4, 7].indexOf(i)
            ];
            return (
              <div key={i} className={open ? "gc-cell on" : "gc-cell"}>
                {open && src ? <Img src={src} /> : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (kind === "coin") {
    return (
      <div className="gc-art gc-center">
        <div className="gc-hero">
          <Img src="/nft/royal_dogg.jpg" />
        </div>
      </div>
    );
  }

  if (kind === "crash") {
    return (
      <div className="gc-art gc-center">
        <div className="gc-rocket">
          <Img src="/rocket.png" />
        </div>
        <div className="gc-x">x2.4</div>
      </div>
    );
  }

  if (kind === "plinko") {
    return (
      <div className="gc-art">
        <div className="gc-plinko-ball" />
        <div className="gc-pegs">
          {[1, 2, 3, 4, 5].map((r) => (
            <div key={r} className="gc-prow">
              {Array.from({ length: r }).map((_, i) => (
                <span key={i} className="gc-peg" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (kind === "upgrade") {
    const chain = [
      "/nft/bday_candle.jpg",
      "/nft/hypno_lollipop.jpg",
      "/nft/neko_helmet.jpg",
      "/nft/moon_pendant.jpg",
      "/nft/telegram_premium.jpg",
    ];
    return (
      <div className="gc-art gc-center gc-chain">
        {chain.map((src, i) => (
          <div key={src} className="gc-chain-item">
            <div className={`gc-gift${i === chain.length - 1 ? " win" : ""}`} style={{ width: 40 + i * 4, height: 40 + i * 4 }}>
              <Img src={src} />
            </div>
            {i < chain.length - 1 ? <div className="gc-arrow" /> : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="gc-art gc-center">
      <div className="gc-hero">
        <Img src="/tonyx-logo.jpg" />
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
        animationDelay: `${enterDelay}ms`,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <style>{CSS}</style>
      <div className="gc-fill" style={{ background: gradient }} />
      <div className="gc-vignette" />
      <Scene kind={scene} />

      <div className="gc-head">
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

      <div className="gc-foot">
        <div className="gc-title">{name}</div>
        {maxBet != null ? <div className="gc-max">макс {maxBet}</div> : null}
      </div>
    </button>
  );
}

const CSS = `
@keyframes gcPop {
  from { opacity: 0; transform: translateY(12px) scale(0.96); }
  to { opacity: 1; transform: none; }
}
@keyframes bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
@keyframes bob2 {
  0%, 100% { transform: translateY(0) rotate(-4deg); }
  50% { transform: translateY(-8px) rotate(4deg); }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
@keyframes fly {
  0%, 100% { transform: translate(0, 6px) rotate(-10deg); }
  50% { transform: translate(8px, -14px) rotate(6deg); }
}
@keyframes fall {
  0% { top: 8%; left: 48%; }
  25% { top: 28%; left: 38%; }
  50% { top: 50%; left: 58%; }
  75% { top: 70%; left: 42%; }
  100% { top: 86%; left: 50%; }
}
@keyframes rays {
  to { transform: translateX(-40px); }
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.7); }
}
@keyframes glow {
  0%, 100% { filter: brightness(1); transform: scale(1); }
  50% { filter: brightness(1.15); transform: scale(1.06); }
}

.gc {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1.02;
  border: 0;
  border-radius: 22px;
  overflow: hidden;
  padding: 0;
  display: block;
  text-align: left;
  font-family: inherit;
  color: #fff;
  isolation: isolate;
  animation: gcPop 0.45s cubic-bezier(0.22,1,0.36,1) both;
  box-shadow: 0 12px 28px rgba(0,0,0,0.45);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.gc.wide { aspect-ratio: 2.1 / 1; }
.gc:hover:not(:disabled) {
  transform: translateY(-4px);
  box-shadow: 0 18px 40px rgba(0,0,0,0.55);
}
.gc:active:not(:disabled) { transform: scale(0.98); }

.gc-fill { position: absolute; inset: 0; }
.gc-vignette {
  position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background:
    radial-gradient(ellipse 100% 55% at 50% -10%, rgba(255,255,255,0.14), transparent 50%),
    linear-gradient(180deg, transparent 45%, rgba(0,0,0,0.78) 100%);
}

.gc-art {
  position: absolute; inset: 0; z-index: 2;
  overflow: hidden;
}
.gc-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.gc-split {
  position: absolute; inset: 0;
  background: linear-gradient(135deg,
    #2563eb 0 30%, #eab308 30% 55%, #dc2626 55% 100%);
  opacity: 0.45;
  mix-blend-mode: soft-light;
}

.gc-float {
  position: absolute;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 10px 22px rgba(0,0,0,0.4), inset 0 0 0 2px rgba(255,255,255,0.22);
  animation: bob 2.6s ease-in-out infinite;
}
.gc-float img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gc-float.a1 { width: 64px; height: 64px; left: 8%; top: 28%; }
.gc-float.a2 { width: 52px; height: 52px; left: 40%; top: 12%; animation-name: bob2; animation-delay: 0.3s; }
.gc-float.a3 { width: 58px; height: 58px; right: 8%; top: 30%; animation-delay: 0.6s; }
.gc-float.s1 { width: 48px; height: 48px; right: 10%; top: 14%; animation-delay: 0.2s; }
.gc-float.s2 { width: 40px; height: 40px; left: 10%; bottom: 34%; animation-name: bob2; animation-delay: 0.5s; }

.gc-spin-rays {
  position: absolute; inset: -30%;
  background: repeating-linear-gradient(-35deg, transparent 0 28px, rgba(168,85,247,0.2) 28px 42px);
  animation: rays 7s linear infinite;
}
.gc-wheel {
  position: absolute;
  left: 50%; top: 42%;
  width: 88px; height: 88px;
  margin: -44px 0 0 -44px;
  border-radius: 50%;
  background: conic-gradient(#22d3ee, #a855f7, #f472b6, #fbbf24, #22d3ee);
  box-shadow: 0 0 28px rgba(34,211,238,0.45);
  animation: spin 6s linear infinite;
}
.gc-wheel::after {
  content: "";
  position: absolute; inset: 28%;
  border-radius: 50%;
  background: #0b0b0f;
  box-shadow: inset 0 0 0 2px rgba(255,255,255,0.15);
}

.gc-board {
  display: grid;
  grid-template-columns: repeat(3, 34px);
  gap: 6px;
}
.gc-cell {
  width: 34px; height: 34px;
  border-radius: 10px;
  background: rgba(0,0,0,0.35);
  border: 1px solid rgba(255,255,255,0.1);
  overflow: hidden;
}
.gc-cell.on {
  background: rgba(255,255,255,0.12);
  border-color: rgba(255,255,255,0.25);
}
.gc-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }

.gc-hero {
  width: 112px; height: 112px;
  border-radius: 26px;
  overflow: hidden;
  box-shadow: 0 14px 30px rgba(0,0,0,0.4), inset 0 0 0 2px rgba(255,255,255,0.18);
  animation: bob 2.8s ease-in-out infinite;
}
.gc-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }

.gc-rocket {
  width: 90px; height: 90px;
  animation: fly 2.3s ease-in-out infinite;
  filter: drop-shadow(0 10px 16px rgba(0,0,0,0.4));
}
.gc-rocket img { width: 100%; height: 100%; object-fit: contain; display: block; }
.gc-x {
  position: absolute;
  right: 14px; top: 38px;
  font-weight: 900;
  font-size: 16px;
  color: #fdba74;
  text-shadow: 0 0 12px rgba(249,115,22,0.85);
}

.gc-pegs {
  position: absolute;
  left: 0; right: 0; top: 18%;
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: center;
}
.gc-prow { display: flex; gap: 8px; }
.gc-peg {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #fff;
  opacity: 0.9;
}
.gc-plinko-ball {
  position: absolute;
  width: 11px; height: 11px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #fff, #38bdf8);
  box-shadow: 0 0 12px rgba(56,189,248,0.9);
  animation: fall 2.6s cubic-bezier(0.4,0,0.2,1) infinite;
  z-index: 3;
}

.gc-chain {
  gap: 2px;
  padding: 0 8px;
  flex-wrap: nowrap;
}
.gc-chain-item {
  display: flex;
  align-items: center;
  gap: 2px;
}
.gc-gift {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 16px rgba(0,0,0,0.35), inset 0 0 0 1.5px rgba(255,255,255,0.2);
  animation: bob 2.6s ease-in-out infinite;
  flex-shrink: 0;
}
.gc-gift img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gc-gift.win {
  animation-name: glow;
  animation-duration: 1.6s;
  box-shadow: 0 0 20px rgba(251,191,36,0.65), 0 8px 16px rgba(0,0,0,0.35), inset 0 0 0 2px rgba(255,220,120,0.5);
}
.gc-arrow {
  width: 10px; height: 10px;
  background: rgba(255,255,255,0.55);
  clip-path: polygon(0 25%, 60% 25%, 60% 0, 100% 50%, 60% 100%, 60% 75%, 0 75%);
  flex-shrink: 0;
  margin: 0 1px;
}

.gc-head {
  position: absolute;
  top: 10px; left: 10px; right: 10px;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
}
.gc-badge {
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.03em;
  color: #fff;
  border-radius: 999px;
  padding: 4px 9px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.gc-online {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 800;
  color: #fff;
  background: rgba(0,0,0,0.4);
  border-radius: 999px;
  padding: 3px 8px;
  backdrop-filter: blur(8px);
}
.gc-online i {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
  animation: pulse 1.4s ease-in-out infinite;
  display: inline-block;
}

.gc-foot {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  z-index: 5;
  padding: 14px 14px 13px;
  pointer-events: none;
}
.gc-title {
  font-size: 21px;
  font-weight: 900;
  letter-spacing: -0.03em;
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
