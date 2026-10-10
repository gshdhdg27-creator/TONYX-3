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
  gradient: string;
  wide?: boolean;
  onClick: () => void;
  footer?: ReactNode;
};

export function GameCard({
  name,
  badge,
  badgeColor = "#f97316",
  online,
  lottieSrc,
  emoji = "🎮",
  gradient,
  wide,
  onClick,
  footer,
}: GameCardProps) {
  return (
    <button type="button" onClick={onClick} style={{ ...cardBase, height: wide ? 180 : 168 }}>
      <style>{`
        @keyframes gameFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes gameShine {
          0% { transform: translateX(-120%) rotate(12deg); }
          100% { transform: translateX(120%) rotate(12deg); }
        }
        @keyframes onlinePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>

      <div style={{ ...bg, background: gradient }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.12,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "40%",
          height: "100%",
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)",
          animation: "gameShine 4.5s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      <div style={topRow}>
        {badge ? <span style={{ ...pill, background: badgeColor }}>{badge}</span> : <span />}
        {online != null && (
          <span style={onlinePill}>
            <span style={{ color: "#4ade80", animation: "onlinePulse 1.4s ease infinite" }}>●</span>{" "}
            {online}
          </span>
        )}
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: wide ? 28 : 36,
          display: "flex",
          justifyContent: "center",
          animation: "gameFloat 3s ease-in-out infinite",
        }}
      >
        {lottieSrc ? (
          <LottieIcon src={lottieSrc} size={wide ? 110 : 92} />
        ) : (
          <span style={{ fontSize: wide ? 64 : 52 }}>{emoji}</span>
        )}
      </div>

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
  boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
  textAlign: "left",
  fontFamily: "inherit",
};
const bg: CSSProperties = { position: "absolute", inset: 0 };
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
  padding: "4px 9px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
};
const onlinePill: CSSProperties = {
  color: "#e2e8f0",
  background: "rgba(0,0,0,0.35)",
  borderRadius: 999,
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 800,
  backdropFilter: "blur(6px)",
};
const nameStyle: CSSProperties = {
  position: "absolute",
  left: 14,
  bottom: 12,
  fontSize: 22,
  fontWeight: 900,
  color: "#fff",
  textShadow: "0 2px 10px rgba(0,0,0,0.55)",
  zIndex: 3,
};
