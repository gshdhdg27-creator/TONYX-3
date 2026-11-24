/**
 * Premium GameCard — Portals-style
 * Premium Portals-style GameCard
 * Path: artifacts/mini-app/src/components/GameCard.tsx
 */
import type { CSSProperties, ReactNode } from "react";

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

/* ───────── Animated scenes ───────── */
function Scene({ kind, wide }: { kind: GameCardProps["scene"]; wide?: boolean }) {
  const h = wide ? 128 : 110;

  if (kind === "arena") {
    return (
      <div style={{ ...sceneWrap, height: h }}>
        <div className="gc-arena-glow" />
        <span className="gc-float" style={{ fontSize: wide ? 42 : 36, position: "absolute", left: "12%", top: "18%" }}>⚔️</span>
        <span className="gc-float" style={{ fontSize: wide ? 38 : 32, position: "absolute", right: "14%", top: "28%", animationDelay: "0.4s" }}>🛡️</span>
        <span className="gc-float" style={{ fontSize: 28, position: "absolute", left: "42%", bottom: "12%", animationDelay: "0.8s" }}>💥</span>
        <div className="gc-particles" aria-hidden>
          <span /><span /><span /><span />
        </div>
      </div>
    );
  }

  if (kind === "spin") {
    return (
      <div style={{ ...sceneWrap, height: h }}>
        <div className="gc-spin-wheel">🎡</div>
        <div className="gc-spin-spark" />
        <span className="gc-float" style={{ position: "absolute", right: "16%", top: "20%", fontSize: 22, animationDelay: "0.3s" }}>✨</span>
      </div>
    );
  }

  if (kind === "mines") {
    return (
      <div style={{ ...sceneWrap, height: h }}>
        <div style={minesGrid}>
          {Array.from({ length: 9 }).map((_, i) => {
            const special = i === 1 || i === 5 || i === 7;
            return (
              <div
                key={i}
                className={special ? "gc-mine-lit" : "gc-mine-cell"}
                style={{
                  ...mineCell,
                  background: special
                    ? "linear-gradient(145deg, rgba(255,255,255,0.32), rgba(255,255,255,0.08))"
                    : "rgba(0,0,0,0.38)",
                  animationDelay: `${i * 0.07}s`,
                }}
              >
                {i === 1 && <span className="gc-gem">💎</span>}
                {i === 5 && <span className="gc-gem" style={{ animationDelay: "0.25s" }}>🐸</span>}
                {i === 7 && <span className="gc-gem" style={{ animationDelay: "0.5s" }}>💠</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (kind === "cases") {
    return (
      <div style={{ ...sceneWrap, height: h }}>
        <span className="gc-float" style={{ fontSize: wide ? 56 : 48 }}>📦</span>
        <span className="gc-float" style={{ position: "absolute", left: "18%", top: "22%", fontSize: 20, animationDelay: "0.35s" }}>🔑</span>
        <span className="gc-float" style={{ position: "absolute", right: "16%", bottom: "20%", fontSize: 18, animationDelay: "0.7s" }}>✨</span>
      </div>
    );
  }

  if (kind === "coin") {
    return (
      <div style={{ ...sceneWrap, height: h }}>
        <div className="gc-coin" style={coinOrb}>🪙</div>
        <div className="gc-coin-side" style={{ position: "absolute", left: "12%", top: "24%", fontSize: 20 }}>🦅</div>
        <div className="gc-coin-side" style={{ position: "absolute", right: "12%", top: "28%", fontSize: 18, animationDelay: "0.45s" }}>⚪</div>
        <div className="gc-coin-spark" />
      </div>
    );
  }

  if (kind === "crash") {
    return (
      <div style={{ ...sceneWrap, height: h }}>
        <div className="gc-crash-glow" style={crashGlow} />
        <div className="gc-rocket" style={{ fontSize: wide ? 58 : 48, filter: "drop-shadow(0 8px 22px rgba(0,0,0,0.5))", zIndex: 2 }}>
          🚀
        </div>
        <div className="gc-crash-mult" style={crashMult}>×2.05</div>
        <div className="gc-crash-trail" />
      </div>
    );
  }

  if (kind === "plinko") {
    return (
      <div style={{ ...sceneWrap, height: h }}>
        <div className="gc-plinko-ball" />
        <div style={plinkoGrid}>
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} style={{ display: "flex", gap: 9, justifyContent: "center" }}>
              {Array.from({ length: row }).map((_, i) => (
                <span key={i} className="gc-peg" style={{ ...peg, animationDelay: `${(row * 3 + i) * 0.11}s` }} />
              ))}
            </div>
          ))}
        </div>
        <div style={plinkoBuckets}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="gc-bucket" style={{ ...bucket, animationDelay: `${i * 0.14}s` }} />
          ))}
        </div>
      </div>
    );
  }

  if (kind === "upgrade") {
    return (
      <div style={{ ...sceneWrap, height: h, flexDirection: "row", gap: 8 }}>
        <span className="gc-up-item" style={{ ...upItem, animationDelay: "0s" }}>🚽</span>
        <span className="gc-up-arrow" style={upArrow}>››</span>
        <span className="gc-up-item" style={{ ...upItem, animationDelay: "0.2s" }}>🧸</span>
        <span className="gc-up-arrow" style={{ ...upArrow, animationDelay: "0.15s" }}>››</span>
        <span className="gc-up-item gc-up-win" style={{ ...upItem, transform: "scale(1.18)", animationDelay: "0.4s" }}>💍</span>
      </div>
    );
  }

  return (
    <div style={{ ...sceneWrap, height: h }}>
      <span className="gc-float" style={{ fontSize: wide ? 60 : 50 }}>🎮</span>
    </div>
  );
}

/* ───────── Main component ───────── */
export function GameCard({
  name,
  scene = "generic",
  badge,
  badgeColor = "#ec4899",
  online,
  maxBet,
  emoji,
  gradient,
  accent = "rgba(168,85,247,0.5)",
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
        ...cardBase,
        height: wide ? 178 : 198,
        boxShadow: `0 16px 40px rgba(0,0,0,0.5), 0 0 0 1px ${accent}, 0 0 28px ${accent}`,
        animationDelay: `${enterDelay}ms`,
        opacity: disabled ? 0.55 : 1,
        filter: disabled ? "grayscale(0.55)" : undefined,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <style>{CARD_CSS}</style>

      {/* Base gradient */}
      <div style={{ position: "absolute", inset: 0, background: gradient }} />

      {/* Soft top light + bottom fade */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 90% 55% at 50% 8%, rgba(255,255,255,0.22), transparent 55%), linear-gradient(180deg, transparent 28%, rgba(0,0,0,0.62) 100%)",
        }}
      />

      {/* Shine sweep */}
      <div className="gc-shine" />

      {/* Floating particles */}
      <div className="gc-particles" aria-hidden>
        <span /><span /><span /><span /><span />
      </div>

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          padding: wide ? "13px 15px 0" : "13px 13px 0",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Top row: title + badge */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            {emoji && <span style={{ fontSize: 17 }}>{emoji}</span>}
            <span
              style={{
                fontWeight: 900,
                fontSize: wide ? 17 : 15,
                letterSpacing: "0.04em",
                color: "#fff",
                textShadow: "0 2px 14px rgba(0,0,0,0.5)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {name}
            </span>
          </div>
          {badge && (
            <span
              className="gc-badge"
              style={{
                flexShrink: 0,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.07em",
                color: "#fff",
                background: badgeColor,
                borderRadius: 999,
                padding: "3px 9px",
                boxShadow: `0 0 14px ${badgeColor}99`,
              }}
            >
              {badge}
            </span>
          )}
        </div>

        {/* Scene */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Scene kind={scene} wide={wide} />
        </div>

        {/* Bottom row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: 13,
            marginTop: 2,
          }}
        >
          {online != null ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                fontWeight: 700,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              <span className="gc-online-dot" />
              {online}
            </div>
          ) : (
            <span />
          )}

          {maxBet != null && (
            <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", letterSpacing: "0.02em" }}>
              макс {maxBet}
            </span>
          )}

          {footer}

          <span className="gc-play-chip">PLAY →</span>
        </div>
      </div>
    </button>
  );
}

/* ───────── CSS animations ───────── */
const CARD_CSS = `
  @keyframes gcEnter {
    0% { opacity: 0; transform: translateY(22px) scale(0.94); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes gcShine {
    0% { transform: translateX(-150%) rotate(18deg); opacity: 0; }
    10% { opacity: 0.6; }
    35% { opacity: 0.12; }
    100% { transform: translateX(250%) rotate(18deg); opacity: 0; }
  }
  @keyframes gcPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.35; transform: scale(0.75); }
  }
  @keyframes gcFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
  }
  @keyframes gcRocket {
    0%, 100% { transform: translate(0, 5px) rotate(-9deg); }
    50% { transform: translate(7px, -12px) rotate(7deg); }
  }
  @keyframes gcMult {
    0%, 100% { transform: scale(1); opacity: 0.92; }
    50% { transform: scale(1.14); opacity: 1; }
  }
  @keyframes gcTrail {
    0% { opacity: 0; transform: scaleY(0.35) translateY(10px); }
    40% { opacity: 0.75; }
    100% { opacity: 0; transform: scaleY(1.25) translateY(-8px); }
  }
  @keyframes gcCoinSpin {
    0% { transform: rotateY(0deg) translateY(0); }
    50% { transform: rotateY(180deg) translateY(-9px); }
    100% { transform: rotateY(360deg) translateY(0); }
  }
  @keyframes gcCoinSide {
    0%, 100% { transform: translateY(0) scale(1); opacity: 0.7; }
    50% { transform: translateY(-6px) scale(1.1); opacity: 1; }
  }
  @keyframes gcSpark {
    0%, 100% { opacity: 0; transform: scale(0.55); }
    40% { opacity: 0.95; transform: scale(1.2); }
  }
  @keyframes gcPegPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.3); transform: scale(1); }
    50% { box-shadow: 0 0 10px 2px rgba(56,189,248,0.6); transform: scale(1.18); }
  }
  @keyframes gcBallDrop {
    0% { top: 5%; left: 48%; opacity: 1; }
    22% { top: 24%; left: 40%; }
    45% { top: 42%; left: 56%; }
    65% { top: 60%; left: 44%; }
    85% { top: 76%; left: 53%; }
    100% { top: 90%; left: 48%; opacity: 0.8; }
  }
  @keyframes gcBucketGlow {
    0%, 100% { opacity: 0.5; filter: brightness(1); }
    50% { opacity: 1; filter: brightness(1.4); }
  }
  @keyframes gcGem {
    0%, 100% { transform: scale(1) rotate(0deg); filter: brightness(1); }
    50% { transform: scale(1.2) rotate(-10deg); filter: brightness(1.4); }
  }
  @keyframes gcMinePop {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }
  @keyframes gcUpBounce {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-7px) scale(1.1); }
  }
  @keyframes gcUpWin {
    0%, 100% { transform: scale(1.18); filter: drop-shadow(0 0 8px rgba(251,191,36,0.45)); }
    50% { transform: scale(1.32); filter: drop-shadow(0 0 18px rgba(251,191,36,0.9)); }
  }
  @keyframes gcArrow {
    0%, 100% { opacity: 0.4; transform: translateX(0); }
    50% { opacity: 1; transform: translateX(4px); }
  }
  @keyframes gcBadge {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.07); }
  }
  @keyframes gcParticle {
    0% { transform: translateY(0) scale(1); opacity: 0; }
    18% { opacity: 0.75; }
    100% { transform: translateY(-32px) scale(0.35); opacity: 0; }
  }
  @keyframes gcSpin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes gcArenaGlow {
    0%, 100% { opacity: 0.45; transform: scale(1); }
    50% { opacity: 0.8; transform: scale(1.12); }
  }

  .gc-card {
    animation: gcEnter 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
    transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.22s ease, filter 0.22s ease;
  }
  .gc-card:hover:not(:disabled) {
    transform: translateY(-6px) scale(1.025);
    filter: brightness(1.1);
  }
  .gc-card:active:not(:disabled) {
    transform: translateY(-1px) scale(0.98);
    filter: brightness(1.15);
  }

  .gc-shine {
    position: absolute;
    top: -35%;
    left: 0;
    width: 42%;
    height: 170%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.32), transparent);
    pointer-events: none;
    z-index: 3;
    animation: gcShine 4.2s ease-in-out infinite;
  }

  .gc-online-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #22c55e;
       box-shadow: 0 0 10px #22c55e;
    animation: gcPulse 1.5s ease-in-out infinite;
    display: inline-block;
  }

  .gc-play-chip {
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.09em;
    color: rgba(255,255,255,0.95);
    background: rgba(255,255,255,0.14);
    border: 1px solid rgba(255,255,255,0.22);
    border-radius: 999px;
    padding: 4px 10px;
    backdrop-filter: blur(4px);
  }

  .gc-badge { animation: gcBadge 2.4s ease-in-out infinite; }
  .gc-rocket { animation: gcRocket 2.5s ease-in-out infinite; display: inline-block; }
  .gc-crash-mult { animation: gcMult 1.9s ease-in-out infinite; }
  .gc-crash-glow { animation: gcPulse 2.8s ease-in-out infinite; }
  .gc-crash-trail {
    position: absolute; left: 41%; bottom: 16%; width: 7px; height: 30px; border-radius: 8px;
    background: linear-gradient(180deg, rgba(251,146,60,0.95), transparent);
    filter: blur(1.5px); animation: gcTrail 1.7s ease-in-out infinite; z-index: 1;
  }
  .gc-coin { animation: gcCoinSpin 3s ease-in-out infinite; transform-style: preserve-3d; }
  .gc-coin-side { animation: gcCoinSide 2.3s ease-in-out infinite; }
  .gc-coin-spark {
    position: absolute; width: 44px; height: 44px; border-radius: 50%;
    background: radial-gradient(circle, rgba(253,224,71,0.6), transparent 70%);
    animation: gcSpark 3s ease-in-out infinite; pointer-events: none;
  }
  .gc-peg { animation: gcPegPulse 2.1s ease-in-out infinite; }
  .gc-plinko-ball {
    position: absolute; width: 11px; height: 11px; border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, #fff, #38bdf8 40%, #0369a1);
    box-shadow: 0 0 12px rgba(56,189,248,0.85); z-index: 3;
    animation: gcBallDrop 2.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  .gc-bucket { animation: gcBucketGlow 2.1s ease-in-out infinite; }
  .gc-gem { display: inline-block; animation: gcGem 2.1s ease-in-out infinite; }
  .gc-mine-lit { animation: gcMinePop 2.5s ease-in-out infinite; }
  .gc-up-item { display: inline-block; animation: gcUpBounce 2.1s ease-in-out infinite; }
  .gc-up-win { animation: gcUpWin 1.7s ease-in-out infinite !important; }
  .gc-up-arrow { animation: gcArrow 1.3s ease-in-out infinite; display: inline-block; }
  .gc-float { display: inline-block; animation: gcFloat 2.6s ease-in-out infinite; }
  .gc-spin-wheel {
    font-size: 52px;
    filter: drop-shadow(0 8px 20px rgba(0,0,0,0.4));
    animation: gcSpin 8s linear infinite;
  }
  .gc-spin-spark {
    position: absolute; width: 50px; height: 50px; border-radius: 50%;
    background: radial-gradient(circle, rgba(34,211,238,0.5), transparent 70%);
    animation: gcSpark 2.4s ease-in-out infinite;
  }
  .gc-arena-glow {
    position: absolute; width: 100px; height: 100px; border-radius: 50%;
    background: radial-gradient(circle, rgba(168,85,247,0.5), transparent 70%);
    filter: blur(10px); animation: gcArenaGlow 3s ease-in-out infinite;
  }

  .gc-particles { position: absolute; inset: 0; pointer-events: none; z-index: 1; overflow: hidden; }
  .gc-particles span {
    position: absolute; width: 4px; height: 4px; border-radius: 50%;
    background: rgba(255,255,255,0.6); bottom: 28%;
    animation: gcParticle 3.4s ease-in-out infinite;
  }
  .gc-particles span:nth-child(1) { left: 16%; animation-delay: 0s; }
  .gc-particles span:nth-child(2) { left: 34%; animation-delay: 0.55s; width: 3px; height: 3px; }
  .gc-particles span:nth-child(3) { left: 51%; animation-delay: 1.1s; }
  .gc-particles span:nth-child(4) { left: 67%; animation-delay: 0.25s; width: 5px; height: 5px; }
  .gc-particles span:nth-child(5) { left: 83%; animation-delay: 1.6s; width: 3px; height: 3px; }
`;

const cardBase: CSSProperties = {
  position: "relative",
  width: "100%",
  border: "none",
  borderRadius: 24,
  overflow: "hidden",
  fontFamily: "inherit",
  color: "#fff",
  textAlign: "left",
  padding: 0,
  display: "flex",
  flexDirection: "column",
  isolation: "isolate",
};

const sceneWrap: CSSProperties = {
  position: "relative",
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

const plinkoGrid: CSSProperties = { display: "flex", flexDirection: "column", gap: 5, zIndex: 2 };
const peg: CSSProperties = {
  width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.88)",
  boxShadow: "0 0 7px rgba(255,255,255,0.4)", display: "inline-block",
};
const plinkoBuckets: CSSProperties = {
  position: "absolute", bottom: 3, left: "11%", right: "11%", display: "flex", gap: 5, justifyContent: "center",
};
const bucket: CSSProperties = {
  flex: 1, height: 8, borderRadius: 3,
  background: "linear-gradient(180deg, rgba(56,189,248,0.9), rgba(14,165,233,0.35))",
};

const minesGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, 27px)", gap: 5 };
const mineCell: CSSProperties = {
  width: 27, height: 27, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
  border: "1px solid rgba(255,255,255,0.14)",
};

const crashGlow: CSSProperties = {
  position: "absolute", width: 95, height: 95, borderRadius: "50%",
  background: "radial-gradient(circle, rgba(249,115,22,0.55), transparent 70%)", filter: "blur(9px)",
};
const crashMult: CSSProperties = {
  position: "absolute", right: 11, top: 8, fontWeight: 900, fontSize: 15, color: "#fdba74",
  textShadow: "0 0 14px rgba(249,115,22,0.85)", zIndex: 3,
};

const upItem: CSSProperties = { fontSize: 26, filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.4))" };
const upArrow: CSSProperties = { fontSize: 15, fontWeight: 900, color: "rgba(255,255,255,0.7)" };
const coinOrb: CSSProperties = {
  fontSize: 50, filter: "drop-shadow(0 8px 20px rgba(234,179,8,0.6))", zIndex: 2,
};
