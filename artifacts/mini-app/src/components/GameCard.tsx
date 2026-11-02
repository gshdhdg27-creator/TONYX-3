import type { CSSProperties, ReactNode } from "react";

export type GameCardProps = {
  name: string;
  /** short id used for CSS art scene */
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
};

function Scene({ kind, wide }: { kind: GameCardProps["scene"]; wide?: boolean }) {
  const h = wide ? 118 : 100;
  if (kind === "plinko") {
    return (
      <div style={{ ...sceneWrap, height: h }}>
        <div style={plinkoGrid}>
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              {Array.from({ length: row }).map((_, i) => (
                <span key={i} style={peg} />
              ))}
            </div>
          ))}
        </div>
        <div style={plinkoBuckets}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={bucket} />
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
                style={{
                  ...mineCell,
                  background: special
                    ? "linear-gradient(145deg, rgba(255,255,255,0.25), rgba(255,255,255,0.05))"
                    : "rgba(0,0,0,0.35)",
                }}
              >
                {i === 1 && <span style={{ fontSize: 14 }}>💎</span>}
                {i === 5 && <span style={{ fontSize: 14 }}>🐸</span>}
                {i === 7 && <span style={{ fontSize: 14 }}>💠</span>}
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
        <div style={crashGlow} />
        <div style={{ fontSize: wide ? 64 : 52, filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.45))", zIndex: 2 }}>
          🚀
        </div>
        <div style={crashMult}>×2.05</div>
      </div>
    );
  }
  if (kind === "upgrade") {
    return (
      <div style={{ ...sceneWrap, height: h, flexDirection: "row", gap: 10 }}>
        <span style={upItem}>🚽</span>
        <span style={upArrow}>››</span>
        <span style={upItem}>🧸</span>
        <span style={upArrow}>››</span>
        <span style={{ ...upItem, transform: "scale(1.15)" }}>💍</span>
      </div>
    );
  }
  if (kind === "coin") {
    return (
      <div style={{ ...sceneWrap, height: h }}>
        <div style={coinOrb}>🪙</div>
        <div style={{ position: "absolute", left: "18%", top: "28%", fontSize: 22, opacity: 0.85 }}>🦅</div>
        <div style={{ position: "absolute", right: "18%", top: "32%", fontSize: 20, opacity: 0.85 }}>⚪</div>
      </div>
    );
  }
  return (
    <div style={{ ...sceneWrap, height: h }}>
      <span style={{ fontSize: wide ? 64 : 52 }}>🎮</span>
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
}: GameCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...cardBase,
        height: wide ? 168 : 188,
        boxShadow: `0 14px 36px rgba(0,0,0,0.45), 0 0 0 1px ${accent}`,
      }}
    >
      <style>{`
        @keyframes gcShine {
          0% { transform: translateX(-130%) rotate(18deg); }
          100% { transform: translateX(220%) rotate(18deg); }
        }
        @keyframes gcPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.82); }
        }
        @keyframes gcFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
      `}</style>

      {/* background */}
      <div style={{ position: "absolute", inset: 0, background: gradient }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 80% 60% at 50% 20%, rgba(255,255,255,0.18), transparent 55%), linear-gradient(180deg, transparent 35%, rgba(0,0,0,0.55) 100%)",
        }}
      />
      {/* grid texture */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.12,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
          pointerEvents: "none",
        }}
      />
      {/* shine */}
      <div
        style={{
          position: "absolute",
          top: "-30%",
          left: 0,
          width: "40%",
          height: "160%",
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
          animation: "gcShine 5.5s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      {/* NEW badge top-right */}
      {badge && (
        <span
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 4,
            background: badgeColor,
            color: "#fff",
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: "0.06em",
            borderRadius: 999,
            padding: "5px 10px",
            boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
            textTransform: "uppercase",
          }}
        >
          {badge}
        </span>
      )}

      {/* online top-left */}
      {online != null && (
        <span style={onlinePill}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#4ade80",
              display: "inline-block",
              marginRight: 5,
              animation: "gcPulse 1.4s ease infinite",
            }}
          />
          {online}
        </span>
      )}

      {/* scene art */}
      <div style={{ position: "absolute", left: 0, right: 0, top: online != null ? 28 : 16, zIndex: 2 }}>
        {emoji && !scene ? (
          <div style={{ textAlign: "center", fontSize: wide ? 64 : 52, animation: "gcFloat 3s ease-in-out infinite" }}>
            {emoji}
          </div>
        ) : (
          <Scene kind={scene} wide={wide} />
        )}
      </div>

      {/* title */}
      <div style={nameStyle}>{name}</div>
      {footer}
    </button>
  );
}

const cardBase: CSSProperties = {
  position: "relative",
  width: "100%",
  border: 0,
  borderRadius: 22,
  overflow: "hidden",
  padding: 0,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
};

const onlinePill: CSSProperties = {
  position: "absolute",
  top: 10,
  left: 10,
  zIndex: 4,
  display: "flex",
  alignItems: "center",
  color: "#f1f5f9",
  background: "rgba(0,0,0,0.45)",
  borderRadius: 999,
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 800,
  backdropFilter: "blur(8px)",
};

const nameStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 12,
  textAlign: "center",
  fontSize: 20,
  fontWeight: 900,
  color: "#fff",
  textShadow: "0 2px 14px rgba(0,0,0,0.7), 0 0 24px rgba(0,0,0,0.35)",
  zIndex: 3,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const sceneWrap: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
};

const peg: CSSProperties = {
  width: 11,
  height: 11,
  borderRadius: "50%",
  background: "linear-gradient(145deg, #fff 0%, #c4b5fd 40%, #7c3aed 100%)",
  boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
};

const plinkoGrid: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 7,
  alignItems: "center",
};

const plinkoBuckets: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 10,
};

const bucket: CSSProperties = {
  width: 18,
  height: 10,
  borderRadius: "0 0 8px 8px",
  border: "2px solid rgba(165,243,252,0.85)",
  borderTop: "none",
  boxShadow: "0 0 10px rgba(56,189,248,0.45)",
};

const minesGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 28px)",
  gap: 6,
};

const mineCell: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid rgba(255,255,255,0.12)",
};

const crashGlow: CSSProperties = {
  position: "absolute",
  width: 90,
  height: 90,
  borderRadius: "50%",
  background: "radial-gradient(circle, rgba(249,115,22,0.55), transparent 70%)",
  filter: "blur(6px)",
};

const crashMult: CSSProperties = {
  position: "absolute",
  right: "12%",
  top: "18%",
  fontWeight: 900,
  fontSize: 15,
  color: "#fde68a",
  textShadow: "0 2px 8px rgba(0,0,0,0.5)",
  zIndex: 3,
};

const upItem: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 14,
  background: "rgba(255,255,255,0.18)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 24,
  boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
  border: "1px solid rgba(255,255,255,0.25)",
};

const upArrow: CSSProperties = {
  fontWeight: 900,
  fontSize: 18,
  color: "rgba(255,255,255,0.75)",
  letterSpacing: "-2px",
};

const coinOrb: CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: "50%",
  background: "radial-gradient(circle at 35% 30%, #fde68a, #f59e0b 55%, #b45309)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 36,
  boxShadow: "0 10px 28px rgba(245,158,11,0.45)",
  animation: "gcFloat 3s ease-in-out infinite",
};
