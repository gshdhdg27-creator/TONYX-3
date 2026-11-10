import type { CSSProperties, ReactNode } from "react";

export type GameCardProps = {
  name: string;
  scene?: "mines" | "coin" | "crash" | "plinko" | "upgrade" | "generic";
  badge?: string;
  badgeColor?: string;
  online?: string | number;
  emoji?: string;
  gradient: string;
  accent?: string;
  wide?: boolean;
  onClick: () => void;
  footer?: ReactNode;
  enterDelay?: number;
};

function Scene({ kind, wide }: { kind: GameCardProps["scene"]; wide?: boolean }) {
  const h = wide ? 118 : 100;
  if (kind === "plinko") {
    return (
      <div style={{ ...sceneWrap, height: h }}>
        <div className="gc-plinko-ball" />
        <div style={plinkoGrid}>
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              {Array.from({ length: row }).map((_, i) => (
                <span key={i} className="gc-peg" style={{ ...peg, animationDelay: `${(row * 3 + i) * 0.12}s` }} />
              ))}
            </div>
          ))}
        </div>
        <div style={plinkoBuckets}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="gc-bucket" style={{ ...bucket, animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
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
                    ? "linear-gradient(145deg, rgba(255,255,255,0.28), rgba(255,255,255,0.06))"
                    : "rgba(0,0,0,0.35)",
                  animationDelay: `${i * 0.08}s`,
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
  if (kind === "crash") {
    return (
      <div style={{ ...sceneWrap, height: h }}>
        <div className="gc-crash-glow" style={crashGlow} />
        <div className="gc-rocket" style={{ fontSize: wide ? 64 : 52, filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.45))", zIndex: 2 }}>
          🚀
        </div>
        <div className="gc-crash-mult" style={crashMult}>×2.05</div>
        <div className="gc-crash-trail" />
      </div>
    );
  }
  if (kind === "upgrade") {
    return (
      <div style={{ ...sceneWrap, height: h, flexDirection: "row", gap: 10 }}>
        <span className="gc-up-item" style={{ ...upItem, animationDelay: "0s" }}>🚽</span>
        <span className="gc-up-arrow" style={upArrow}>››</span>
        <span className="gc-up-item" style={{ ...upItem, animationDelay: "0.2s" }}>🧸</span>
        <span className="gc-up-arrow" style={{ ...upArrow, animationDelay: "0.15s" }}>››</span>
        <span className="gc-up-item gc-up-win" style={{ ...upItem, transform: "scale(1.15)", animationDelay: "0.4s" }}>💍</span>
      </div>
    );
  }
  if (kind === "coin") {
    return (
      <div style={{ ...sceneWrap, height: h }}>
        <div className="gc-coin" style={coinOrb}>🪙</div>
        <div className="gc-coin-side" style={{ position: "absolute", left: "14%", top: "26%", fontSize: 22, opacity: 0.9 }}>🦅</div>
        <div className="gc-coin-side" style={{ position: "absolute", right: "14%", top: "30%", fontSize: 20, opacity: 0.9, animationDelay: "0.4s" }}>⚪</div>
        <div className="gc-coin-spark" />
      </div>
    );
  }
  return (
    <div style={{ ...sceneWrap, height: h }}>
      <span className="gc-float" style={{ fontSize: wide ? 64 : 52 }}>🎮</span>
    </div>
  );
}

export function GameCard({
  name,
  scene = "generic",
  badge,
  badgeColor = "#ec4899",
  online,
  emoji,
  gradient,
  accent = "rgba(168,85,247,0.45)",
  wide,
  onClick,
  footer,
  enterDelay = 0,
}: GameCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="gc-card"
      style={{
        ...cardBase,
        height: wide ? 168 : 188,
        boxShadow: `0 14px 36px rgba(0,0,0,0.45), 0 0 0 1px ${accent}`,
        animationDelay: `${enterDelay}ms`,
      }}
    >
      <style>{CARD_CSS}</style>

      <div style={{ position: "absolute", inset: 0, background: gradient }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 80% 60% at 50% 20%, rgba(255,255,255,0.18), transparent 55%), linear-gradient(180deg, transparent 35%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      <div className="gc-shine" />

      <div className="gc-particles" aria-hidden>
        <span /><span /><span /><span /><span />
      </div>

      <div style={{ position: "relative", zIndex: 2, padding: wide ? "12px 14px 0" : "12px 12px 0", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {emoji && <span style={{ fontSize: 18 }}>{emoji}</span>}
            <span
              style={{
                fontWeight: 900,
                fontSize: wide ? 18 : 15,
                letterSpacing: "0.04em",
                color: "#fff",
                textShadow: "0 2px 12px rgba(0,0,0,0.45)",
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
                letterSpacing: "0.06em",
                color: "#fff",
                background: badgeColor,
                borderRadius: 999,
                padding: "3px 8px",
                boxShadow: `0 0 12px ${badgeColor}88`,
              }}
            >
              {badge}
            </span>
          )}
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Scene kind={scene} wide={wide} />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, marginTop: 4 }}>
          {online != null ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
              <span className="gc-online-dot" />
              {online} online
            </div>
          ) : (
            <span />
          )}
          {footer}
          <span className="gc-play-chip">PLAY →</span>
        </div>
      </div>
    </button>
  );
}

const CARD_CSS = `
  @keyframes gcEnter {
    0% { opacity: 0; transform: translateY(18px) scale(0.96); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes gcShine {
    0% { transform: translateX(-140%) rotate(18deg); opacity: 0; }
    12% { opacity: 0.55; }
    35% { opacity: 0.15; }
    100% { transform: translateX(240%) rotate(18deg); opacity: 0; }
  }
  @keyframes gcPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.78); }
  }
  @keyframes gcFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-7px); }
  }
  @keyframes gcRocket {
    0%, 100% { transform: translate(0, 4px) rotate(-8deg); }
    50% { transform: translate(6px, -10px) rotate(6deg); }
  }
  @keyframes gcMult {
    0%, 100% { transform: scale(1); opacity: 0.95; }
    50% { transform: scale(1.12); opacity: 1; }
  }
  @keyframes gcTrail {
    0% { opacity: 0; transform: scaleY(0.4) translateY(8px); }
    40% { opacity: 0.7; }
    100% { opacity: 0; transform: scaleY(1.2) translateY(-6px); }
  }
  @keyframes gcCoinSpin {
    0% { transform: rotateY(0deg) translateY(0); }
    50% { transform: rotateY(180deg) translateY(-8px); }
    100% { transform: rotateY(360deg) translateY(0); }
  }
  @keyframes gcCoinSide {
    0%, 100% { transform: translateY(0) scale(1); opacity: 0.75; }
    50% { transform: translateY(-5px) scale(1.08); opacity: 1; }
  }
  @keyframes gcSpark {
    0%, 100% { opacity: 0; transform: scale(0.6); }
    40% { opacity: 0.9; transform: scale(1.15); }
  }
  @keyframes gcPegPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.35); transform: scale(1); }
    50% { box-shadow: 0 0 8px 2px rgba(56,189,248,0.55); transform: scale(1.15); }
  }
  @keyframes gcBallDrop {
    0% { top: 6%; left: 48%; opacity: 1; }
    20% { top: 22%; left: 42%; }
    40% { top: 40%; left: 55%; }
    60% { top: 58%; left: 46%; }
    80% { top: 74%; left: 52%; }
    100% { top: 88%; left: 48%; opacity: 0.85; }
  }
  @keyframes gcBucketGlow {
    0%, 100% { opacity: 0.55; filter: brightness(1); }
    50% { opacity: 1; filter: brightness(1.35); }
  }
  @keyframes gcGem {
    0%, 100% { transform: scale(1) rotate(0deg); filter: brightness(1); }
    50% { transform: scale(1.18) rotate(-8deg); filter: brightness(1.35); }
  }
  @keyframes gcMinePop {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.04); }
  }
  @keyframes gcUpBounce {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-6px) scale(1.08); }
  }
  @keyframes gcUpWin {
    0%, 100% { transform: scale(1.15); filter: drop-shadow(0 0 6px rgba(251,191,36,0.4)); }
    50% { transform: scale(1.28); filter: drop-shadow(0 0 14px rgba(251,191,36,0.85)); }
  }
  @keyframes gcArrow {
    0%, 100% { opacity: 0.45; transform: translateX(0); }
    50% { opacity: 1; transform: translateX(3px); }
  }
  @keyframes gcBadge {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.06); }
  }
  @keyframes gcParticle {
    0% { transform: translateY(0) scale(1); opacity: 0; }
    20% { opacity: 0.7; }
    100% { transform: translateY(-28px) scale(0.4); opacity: 0; }
  }
  .gc-card {
    animation: gcEnter 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
    transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.2s ease, filter 0.2s ease;
  }
  .gc-card:hover {
    transform: translateY(-4px) scale(1.02);
    filter: brightness(1.08);
  }
  .gc-card:active {
    transform: translateY(0) scale(0.98);
    filter: brightness(1.12);
  }
  .gc-shine {
    position: absolute;
    top: -30%;
    left: 0;
    width: 45%;
    height: 160%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent);
    pointer-events: none;
    z-index: 3;
    animation: gcShine 3.8s ease-in-out infinite;
  }
  .gc-online-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 8px #22c55e;
    animation: gcPulse 1.4s ease-in-out infinite;
    display: inline-block;
  }
  .gc-play-chip {
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.08em;
    color: rgba(255,255,255,0.92);
    background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 999px;
    padding: 4px 9px;
  }
  .gc-badge { animation: gcBadge 2.2s ease-in-out infinite; }
  .gc-rocket { animation: gcRocket 2.4s ease-in-out infinite; display: inline-block; }
  .gc-crash-mult { animation: gcMult 1.8s ease-in-out infinite; }
  .gc-crash-glow { animation: gcPulse 2.6s ease-in-out infinite; }
  .gc-crash-trail {
    position: absolute; left: 42%; bottom: 18%; width: 6px; height: 28px; border-radius: 8px;
    background: linear-gradient(180deg, rgba(251,146,60,0.9), transparent);
    filter: blur(1px); animation: gcTrail 1.6s ease-in-out infinite; z-index: 1;
  }
  .gc-coin { animation: gcCoinSpin 2.8s ease-in-out infinite; transform-style: preserve-3d; }
  .gc-coin-side { animation: gcCoinSide 2.2s ease-in-out infinite; }
  .gc-coin-spark {
    position: absolute; width: 40px; height: 40px; border-radius: 50%;
    background: radial-gradient(circle, rgba(253,224,71,0.55), transparent 70%);
    animation: gcSpark 2.8s ease-in-out infinite; pointer-events: none;
  }
  .gc-peg { animation: gcPegPulse 2s ease-in-out infinite; }
  .gc-plinko-ball {
    position: absolute; width: 10px; height: 10px; border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, #fff, #38bdf8 40%, #0369a1);
    box-shadow: 0 0 10px rgba(56,189,248,0.8); z-index: 3;
    animation: gcBallDrop 2.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  .gc-bucket { animation: gcBucketGlow 2s ease-in-out infinite; }
  .gc-gem { display: inline-block; animation: gcGem 2s ease-in-out infinite; }
  .gc-mine-lit { animation: gcMinePop 2.4s ease-in-out infinite; }
  .gc-up-item { display: inline-block; animation: gcUpBounce 2s ease-in-out infinite; }
  .gc-up-win { animation: gcUpWin 1.6s ease-in-out infinite !important; }
  .gc-up-arrow { animation: gcArrow 1.2s ease-in-out infinite; display: inline-block; }
  .gc-float { display: inline-block; animation: gcFloat 2.4s ease-in-out infinite; }
  .gc-particles { position: absolute; inset: 0; pointer-events: none; z-index: 1; overflow: hidden; }
  .gc-particles span {
    position: absolute; width: 4px; height: 4px; border-radius: 50%;
    background: rgba(255,255,255,0.55); bottom: 30%;
    animation: gcParticle 3.2s ease-in-out infinite;
  }
  .gc-particles span:nth-child(1) { left: 18%; animation-delay: 0s; }
  .gc-particles span:nth-child(2) { left: 35%; animation-delay: 0.6s; width: 3px; height: 3px; }
  .gc-particles span:nth-child(3) { left: 52%; animation-delay: 1.1s; }
  .gc-particles span:nth-child(4) { left: 68%; animation-delay: 0.3s; width: 5px; height: 5px; }
  .gc-particles span:nth-child(5) { left: 82%; animation-delay: 1.5s; width: 3px; height: 3px; }
`;

const cardBase: CSSProperties = {
  position: "relative",
  width: "100%",
  border: "none",
  borderRadius: 22,
  overflow: "hidden",
  cursor: "pointer",
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

const plinkoGrid: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, zIndex: 2 };
const peg: CSSProperties = {
  width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.85)",
  boxShadow: "0 0 6px rgba(255,255,255,0.35)", display: "inline-block",
};
const plinkoBuckets: CSSProperties = {
  position: "absolute", bottom: 4, left: "12%", right: "12%", display: "flex", gap: 6, justifyContent: "center",
};
const bucket: CSSProperties = {
  flex: 1, height: 8, borderRadius: 3,
  background: "linear-gradient(180deg, rgba(56,189,248,0.85), rgba(14,165,233,0.4))",
};

const minesGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, 28px)", gap: 5 };
const mineCell: CSSProperties = {
  width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
  border: "1px solid rgba(255,255,255,0.12)",
};

const crashGlow: CSSProperties = {
  position: "absolute", width: 90, height: 90, borderRadius: "50%",
  background: "radial-gradient(circle, rgba(249,115,22,0.55), transparent 70%)", filter: "blur(8px)",
};
const crashMult: CSSProperties = {
  position: "absolute", right: 12, top: 10, fontWeight: 900, fontSize: 16, color: "#fdba74",
  textShadow: "0 0 12px rgba(249,115,22,0.8)", zIndex: 3,
};

const upItem: CSSProperties = { fontSize: 28, filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.35))" };
const upArrow: CSSProperties = { fontSize: 16, fontWeight: 900, color: "rgba(255,255,255,0.7)" };
const coinOrb: CSSProperties = {
  fontSize: 52, filter: "drop-shadow(0 8px 18px rgba(234,179,8,0.55))", zIndex: 2,
};
