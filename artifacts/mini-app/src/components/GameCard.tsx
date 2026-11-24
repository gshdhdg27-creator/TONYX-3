/**
 * GameCard — ultra premium shock version
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

function Img({ src }: { src: string }) {
  return <img src={src} alt="" draggable={false} />;
}

function Particles() {
  return (
    <div className="gc-parts" aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <span key={i} className={`p p${i}`} />
      ))}
    </div>
  );
}

function Scene({ kind }: { kind: GameCardProps["scene"] }) {
  if (kind === "arena") {
    return (
      <div className="gc-art">
        <div className="gc-split" />
        <Particles />
        <div className="gc-orb o1" />
        <div className="gc-orb o2" />
        <div className="gc-float a1"><Img src="/nft/neko_helmet.jpg" /></div>
        <div className="gc-float a2"><Img src="/nft/royal_dogg.jpg" /></div>
        <div className="gc-float a3"><Img src="/nft/electric_skull.jpg" /></div>
        <div className="gc-float a4"><Img src="/nft/moon_pendant.jpg" /></div>
      </div>
    );
  }

  if (kind === "spin") {
    return (
      <div className="gc-art">
        <div className="gc-spin-rays" />
        <Particles />
        <div className="gc-wheel-wrap">
          <div className="gc-wheel" />
          <div className="gc-wheel-ring" />
        </div>
        <div className="gc-float s1"><Img src="/nft/snoop_cigar.jpg" /></div>
        <div className="gc-float s2"><Img src="/nft/hypno_lollipop.jpg" /></div>
        <div className="gc-float s3"><Img src="/nft/bday_candle.jpg" /></div>
      </div>
    );
  }

  if (kind === "mines") {
    return (
      <div className="gc-art gc-center">
        <div className="gc-orb o3" />
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
        <div className="gc-orb o1" />
        <Particles />
        <div className="gc-hero">
          <Img src="/nft/royal_dogg.jpg" />
          <div className="gc-hero-ring" />
        </div>
      </div>
    );
  }

  if (kind === "crash") {
    return (
      <div className="gc-art gc-center">
        <div className="gc-orb o2" />
        <div className="gc-rocket">
          <Img src="/rocket.png" />
        </div>
        <div className="gc-x">x2.4</div>
        <div className="gc-flame" />
      </div>
    );
  }

  if (kind === "plinko") {
    return (
      <div className="gc-art">
        <div className="gc-orb o3" />
        <div className="gc-plinko-ball" />
        <div className="gc-pegs">
          {[1, 2, 3, 4, 5, 6].map((r) => (
            <div key={r} className="gc-prow">
              {Array.from({ length: r }).map((_, i) => (
                <span key={i} className="gc-peg" style={{ animationDelay: `${(r + i) * 0.06}s` }} />
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
        <Particles />
        {chain.map((src, i) => (
          <div key={src} className="gc-chain-item">
            <div
              className={`gc-gift${i === chain.length - 1 ? " win" : ""}`}
              style={{
                width: 42 + i * 5,
                height: 42 + i * 5,
                animationDelay: `${i * 0.12}s`,
              }}
            >
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
  from { opacity: 0; transform: translateY(18px) scale(0.92); filter: blur(4px); }
  to { opacity: 1; transform: none; filter: none; }
}
@keyframes bob {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-12px) scale(1.04); }
}
@keyframes bob2 {
  0%, 100% { transform: translateY(0) rotate(-6deg); }
  50% { transform: translateY(-9px) rotate(6deg); }
}
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes spinR { to { transform: rotate(-360deg); } }
@keyframes fly {
  0%, 100% { transform: translate(0, 8px) rotate(-12deg); }
  50% { transform: translate(12px, -18px) rotate(10deg); }
}
@keyframes fall {
  0% { top: 6%; left: 50%; }
  20% { top: 22%; left: 38%; }
  40% { top: 42%; left: 60%; }
  60% { top: 60%; left: 42%; }
  80% { top: 76%; left: 55%; }
  100% { top: 90%; left: 48%; }
}
@keyframes rays { to { transform: translateX(-48px); } }
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.3; transform: scale(0.65); }
}
@keyframes glow {
  0%, 100% { filter: brightness(1); transform: scale(1); box-shadow: 0 0 18px rgba(251,191,36,0.5), 0 8px 16px rgba(0,0,0,0.35); }
  50% { filter: brightness(1.2); transform: scale(1.08); box-shadow: 0 0 32px rgba(251,191,36,0.85), 0 8px 16px rgba(0,0,0,0.35); }
}
@keyframes shine {
  0% { transform: translateX(-120%) skewX(-18deg); }
  40%, 100% { transform: translateX(160%) skewX(-18deg); }
}
@keyframes borderSpin {
  to { transform: rotate(360deg); }
}
@keyframes part {
  0%, 100% { opacity: 0; transform: translateY(0) scale(0.4); }
  20% { opacity: 0.9; }
  80% { opacity: 0.5; }
  100% { opacity: 0; transform: translateY(-50px) scale(1); }
}
@keyframes orb {
  0%, 100% { transform: scale(1); opacity: 0.35; }
  50% { transform: scale(1.25); opacity: 0.55; }
}
@keyframes pegPulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255,0.2); }
  50% { transform: scale(1.35); box-shadow: 0 0 10px 2px rgba(56,189,248,0.7); }
}
@keyframes ringPulse {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.12); opacity: 0.15; }
}
@keyframes flame {
  0%, 100% { opacity: 0.5; transform: scaleY(1) translateY(0); }
  50% { opacity: 0.9; transform: scaleY(1.3) translateY(4px); }
}

.gc {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1.02;
  border: 0;
  border-radius: 24px;
  overflow: hidden;
  padding: 0;
  display: block;
  text-align: left;
  font-family: inherit;
  color: #fff;
  isolation: isolate;
  animation: gcPop 0.55s cubic-bezier(0.22,1,0.36,1) both;
  box-shadow: 0 16px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06);
  transition: transform 0.25s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s ease;
}
.gc.wide { aspect-ratio: 2.1 / 1; }
.gc:hover:not(:disabled) {
  transform: translateY(-6px) scale(1.02);
  box-shadow: 0 24px 50px rgba(0,0,0,0.6), 0 0 40px color-mix(in srgb, var(--accent) 40%, transparent);
}
.gc:active:not(:disabled) { transform: scale(0.98); }
.gc:hover:not(:disabled) .gc-shine { animation-duration: 1.4s; }

.gc-border {
  position: absolute;
  inset: -40%;
  z-index: 0;
  background: conic-gradient(from 0deg, transparent, var(--accent), transparent 40%, var(--accent), transparent 70%);
  animation: borderSpin 6s linear infinite;
  opacity: 0.55;
}
.gc-fill {
  position: absolute;
  inset: 1.5px;
  border-radius: 22.5px;
  z-index: 1;
}
.gc-shine {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  overflow: hidden;
  border-radius: 24px;
}
.gc-shine::after {
  content: "";
  position: absolute;
  top: 0; bottom: 0;
  left: 0;
  width: 45%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
  animation: shine 3.5s ease-in-out infinite;
}
.gc-vignette {
  position: absolute; inset: 1.5px; z-index: 2; pointer-events: none;
  border-radius: 22.5px;
  background:
    radial-gradient(ellipse 100% 50% at 50% -8%, rgba(255,255,255,0.16), transparent 52%),
    linear-gradient(180deg, transparent 42%, rgba(0,0,0,0.8) 100%);
}

.gc-art {
  position: absolute; inset: 0; z-index: 3;
  overflow: hidden;
  border-radius: 24px;
}
.gc-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.gc-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(28px);
  animation: orb 4s ease-in-out infinite;
  pointer-events: none;
}
.gc-orb.o1 { width: 100px; height: 100px; left: 10%; top: 20%; background: rgba(99,102,241,0.5); }
.gc-orb.o2 { width: 90px; height: 90px; right: 8%; top: 25%; background: rgba(249,115,22,0.45); animation-delay: 0.8s; }
.gc-orb.o3 { width: 110px; height: 110px; left: 50%; top: 30%; margin-left: -55px; background: rgba(56,189,248,0.4); animation-delay: 0.4s; }

.gc-parts { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.gc-parts .p {
  position: absolute;
  width: 4px; height: 4px;
  border-radius: 50%;
  background: #fff;
  opacity: 0;
  animation: part 3.2s ease-in-out infinite;
}
.p0 { left: 15%; bottom: 30%; animation-delay: 0s; }
.p1 { left: 35%; bottom: 25%; animation-delay: 0.4s; width: 3px; height: 3px; }
.p2 { left: 55%; bottom: 35%; animation-delay: 0.8s; }
.p3 { left: 75%; bottom: 28%; animation-delay: 1.2s; width: 5px; height: 5px; }
.p4 { left: 25%; bottom: 40%; animation-delay: 1.6s; }
.p5 { left: 65%; bottom: 22%; animation-delay: 2s; width: 3px; height: 3px; }
.p6 { left: 45%; bottom: 32%; animation-delay: 2.4s; }
.p7 { left: 85%; bottom: 38%; animation-delay: 2.8s; }

.gc-split {
  position: absolute; inset: 0;
  background: linear-gradient(135deg, #2563eb 0 30%, #eab308 30% 55%, #dc2626 55% 100%);
  opacity: 0.5;
  mix-blend-mode: soft-light;
}

.gc-float {
  position: absolute;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 12px 28px rgba(0,0,0,0.45), inset 0 0 0 2px rgba(255,255,255,0.28);
  animation: bob 2.5s ease-in-out infinite;
  z-index: 2;
}
.gc-float img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gc-float.a1 { width: 68px; height: 68px; left: 6%; top: 26%; }
.gc-float.a2 { width: 54px; height: 54px; left: 38%; top: 10%; animation-name: bob2; animation-delay: 0.25s; }
.gc-float.a3 { width: 60px; height: 60px; right: 6%; top: 28%; animation-delay: 0.5s; }
.gc-float.a4 { width: 36px; height: 36px; left: 22%; bottom: 34%; animation-name: bob2; animation-delay: 0.9s; }
.gc-float.s1 { width: 50px; height: 50px; right: 8%; top: 12%; animation-delay: 0.2s; }
.gc-float.s2 { width: 42px; height: 42px; left: 8%; bottom: 32%; animation-name: bob2; animation-delay: 0.45s; }
.gc-float.s3 { width: 34px; height: 34px; right: 20%; bottom: 36%; animation-delay: 0.7s; }

.gc-spin-rays {
  position: absolute; inset: -40%;
  background: repeating-linear-gradient(-35deg, transparent 0 30px, rgba(168,85,247,0.22) 30px 46px);
  animation: rays 7s linear infinite;
}
.gc-wheel-wrap {
  position: absolute;
  left: 50%; top: 40%;
  width: 96px; height: 96px;
  margin: -48px 0 0 -48px;
  z-index: 2;
}
.gc-wheel {
  width: 100%; height: 100%;
  border-radius: 50%;
  background: conic-gradient(#22d3ee, #a855f7, #f472b6, #fbbf24, #34d399, #22d3ee);
  box-shadow: 0 0 36px rgba(34,211,238,0.55), 0 8px 24px rgba(0,0,0,0.4);
  animation: spin 5.5s linear infinite;
  position: relative;
}
.gc-wheel::after {
  content: "";
  position: absolute; inset: 30%;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #1e1b4b, #0b0b0f);
  box-shadow: inset 0 0 0 2px rgba(255,255,255,0.18);
}
.gc-wheel-ring {
  position: absolute; inset: -8px;
  border-radius: 50%;
  border: 2px solid rgba(34,211,238,0.35);
  animation: ringPulse 2s ease-in-out infinite, spinR 12s linear infinite;
}

.gc-board {
  display: grid;
  grid-template-columns: repeat(3, 36px);
  gap: 7px;
  z-index: 2;
}
.gc-cell {
  width: 36px; height: 36px;
  border-radius: 11px;
  background: rgba(0,0,0,0.4);
  border: 1px solid rgba(255,255,255,0.1);
  overflow: hidden;
}
.gc-cell.on {
  background: rgba(255,255,255,0.14);
  border-color: rgba(255,255,255,0.28);
  box-shadow: 0 0 12px rgba(168,85,247,0.35);
}
.gc-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }

.gc-hero {
  position: relative;
  width: 118px; height: 118px;
  border-radius: 28px;
  overflow: hidden;
  box-shadow: 0 16px 36px rgba(0,0,0,0.45), inset 0 0 0 2px rgba(255,255,255,0.22);
  animation: bob 2.6s ease-in-out infinite;
  z-index: 2;
}
.gc-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gc-hero-ring {
  position: absolute; inset: -6px;
  border-radius: 32px;
  border: 2px solid rgba(255,255,255,0.25);
  animation: ringPulse 2.2s ease-in-out infinite;
  pointer-events: none;
}

.gc-rocket {
  width: 96px; height: 96px;
  animation: fly 2.2s ease-in-out infinite;
  filter: drop-shadow(0 12px 20px rgba(0,0,0,0.45));
  z-index: 2;
}
.gc-rocket img { width: 100%; height: 100%; object-fit: contain; display: block; }
.gc-x {
  position: absolute;
  right: 14px; top: 36px;
  font-weight: 900;
  font-size: 17px;
  color: #fdba74;
  text-shadow: 0 0 16px rgba(249,115,22,0.95);
  z-index: 3;
}
.gc-flame {
  position: absolute;
  width: 28px; height: 40px;
  left: 50%; top: 58%;
  margin-left: -14px;
  background: radial-gradient(ellipse at 50% 0%, #fbbf24, #f97316 40%, transparent 70%);
  filter: blur(6px);
  animation: flame 0.8s ease-in-out infinite;
  z-index: 1;
}

.gc-pegs {
  position: absolute;
  left: 0; right: 0; top: 16%;
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: center;
  z-index: 2;
}
.gc-prow { display: flex; gap: 8px; }
.gc-peg {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #fff;
  animation: pegPulse 2s ease-in-out infinite;
}
.gc-plinko-ball {
  position: absolute;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #fff, #38bdf8);
  box-shadow: 0 0 14px rgba(56,189,248,1);
  animation: fall 2.5s cubic-bezier(0.4,0,0.2,1) infinite;
  z-index: 3;
}

.gc-chain {
  gap: 1px;
  padding: 0 6px;
  flex-wrap: nowrap;
  z-index: 2;
}
.gc-chain-item {
  display: flex;
  align-items: center;
  gap: 1px;
}
.gc-gift {
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 10px 20px rgba(0,0,0,0.4), inset 0 0 0 1.5px rgba(255,255,255,0.25);
  animation: bob 2.5s ease-in-out infinite;
  flex-shrink: 0;
}
.gc-gift img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gc-gift.win {
  animation-name: glow;
  animation-duration: 1.5s;
}
.gc-arrow {
  width: 11px; height: 11px;
  background: linear-gradient(90deg, rgba(255,255,255,0.3), rgba(255,255,255,0.85));
  clip-path: polygon(0 25%, 60% 25%, 60% 0, 100% 50%, 60% 100%, 60% 75%, 0 75%);
  flex-shrink: 0;
  margin: 0 1px;
}

.gc-head {
  position: absolute;
  top: 11px; left: 11px; right: 11px;
  z-index: 6;
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
  background: rgba(0,0,0,0.45);
  border-radius: 999px;
  padding: 4px 9px;
  backdrop-filter: blur(10px);
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

.gc-foot {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  z-index: 6;
  padding: 16px 15px 14px;
  pointer-events: none;
}
.gc-title {
  font-size: 22px;
  font-weight: 900;
  letter-spacing: -0.03em;
  color: #fff;
  text-shadow: 0 2px 16px rgba(0,0,0,0.75);
  line-height: 1.1;
}
.gc-max {
  margin-top: 4px;
  font-size: 11px;
  font-weight: 700;
  color: rgba(255,255,255,0.55);
}
`;
