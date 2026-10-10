import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

const SCRIPT_ID = "lottie-player-script";

function ensureLottieScript() {
  if (typeof document === "undefined") return;
  if (document.getElementById(SCRIPT_ID)) return;
  const s = document.createElement("script");
  s.id = SCRIPT_ID;
  s.src = "https://unpkg.com/@lottiefiles/lottie-player@2.0.4/dist/lottie-player.js";
  s.async = true;
  document.head.appendChild(s);
}

export function LottieIcon({ src, size = 96 }: { src: string; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ensureLottieScript();
    const el = ref.current;
    if (!el) return;
    el.innerHTML = "";
    const player = document.createElement("lottie-player");
    player.setAttribute("src", src);
    player.setAttribute("background", "transparent");
    player.setAttribute("speed", "1");
    player.setAttribute("loop", "");
    player.setAttribute("autoplay", "");
    player.style.width = `${size}px`;
    player.style.height = `${size}px`;
    el.appendChild(player);
  }, [src, size]);
  return (
    <div
      ref={ref}
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    />
  );
}

export type GameCardProps = {
  name: string;
  badge?: string;
  badgeColor?: string;
  online?: string | number;
  lottieSrc?: string;
  emoji?: string;
  stickers?: string[];
  gradient: string;
  accent?: string;
  wide?: boolean;
  onClick: () => void;
  footer?: ReactNode;
};

export function GameCard({
  name,
  badge,
  badgeColor = "#a855f7",
  online,
  lottieSrc,
  emoji = "🐶",
  stickers = [],
  gradient,
  accent = "rgba(168,85,247,0.5)",
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
        height: wide ? 190 : 172,
        boxShadow: `0 12px 32px rgba(0,0,0,0.4), 0 0 0 1px ${accent}`,
      }}
    >
      <style>{`
        @keyframes gcFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-8px) scale(1.04); }
        }
        @keyframes gcFloat2 {
          0%, 100% { transform: translate(0,0) rotate(-6deg); }
          50% { transform: translate(4px,-10px) rotate(6deg); }
        }
        @keyframes gcShine {
          0% { transform: translateX(-140%) rotate(18deg); }
          100% { transform: translateX(200%) rotate(18deg); }
        }
        @keyframes gcPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
        @keyframes gcGlow {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.7; }
        }
      `}</style>

      <div style={{ position: "absolute", inset: 0, background: gradient }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.12), transparent 45%), linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.55) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.1,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "-20%",
          left: 0,
          width: "35%",
          height: "140%",
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)",
          animation: "gcShine 5s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 120,
          height: 120,
          borderRadius: "50%",
          right: -20,
          top: 10,
          background: accent,
          filter: "blur(28px)",
          animation: "gcGlow 3s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      <div style={topRow}>
        {badge ? (
          <span style={{ ...pill, background: badgeColor }}>{badge}</span>
        ) : (
          <span />
        )}
        {online != null && (
          <span style={onlinePill}>
            <span
              style={{
                display: "inline-block",
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#4ade80",
                marginRight: 5,
                animation: "gcPulse 1.3s ease infinite",
              }}
            />
            {online}
          </span>
        )}
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: wide ? 30 : 38,
          display: "flex",
          justifyContent: "center",
          animation: "gcFloat 3.2s ease-in-out infinite",
          zIndex: 2,
        }}
      >
        {lottieSrc ? (
          <LottieIcon src={lottieSrc} size={wide ? 112 : 94} />
        ) : (
          <span style={{ fontSize: wide ? 68 : 54, filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.35))" }}>
            {emoji}
          </span>
        )}
      </div>

      {stickers[0] && (
        <span
          style={{
            position: "absolute",
            left: 14,
            top: wide ? 56 : 52,
            fontSize: 22,
            animation: "gcFloat2 2.8s ease-in-out infinite",
            filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.4))",
            zIndex: 2,
          }}
        >
          {stickers[0]}
        </span>
      )}
      {stickers[1] && (
        <span
          style={{
            position: "absolute",
            right: 16,
            top: wide ? 64 : 58,
            fontSize: 20,
            animation: "gcFloat2 3.4s ease-in-out 0.4s infinite",
            filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.4))",
            zIndex: 2,
          }}
        >
          {stickers[1]}
        </span>
      )}

      <div style={nameStyle}>{name}</div>
      {footer}
    </button>
  );
}

const cardBase: CSSProperties = {
  position: "relative",
  width: "100%",
  border: 0,
  borderRadius: 24,
  overflow: "hidden",
  padding: 0,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
};

const topRow: CSSProperties = {
  position: "absolute",
  top: 10,
  left: 10,
  right: 10,
  display: "flex",
  justifyContent: "space-between",
  zIndex: 3,
};

const pill: CSSProperties = {
  color: "#fff",
  fontSize: 11,
  fontWeight: 800,
  borderRadius: 999,
  padding: "5px 10px",
  boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
  letterSpacing: "0.02em",
};

const onlinePill: CSSProperties = {
  display: "flex",
  alignItems: "center",
  color: "#f1f5f9",
  background: "rgba(0,0,0,0.4)",
  borderRadius: 999,
  padding: "5px 9px",
  fontSize: 11,
  fontWeight: 800,
  backdropFilter: "blur(8px)",
};

const nameStyle: CSSProperties = {
  position: "absolute",
  left: 14,
  bottom: 14,
  fontSize: 22,
  fontWeight: 900,
  color: "#fff",
  textShadow: "0 2px 12px rgba(0,0,0,0.65)",
  zIndex: 3,
  letterSpacing: "-0.02em",
};
