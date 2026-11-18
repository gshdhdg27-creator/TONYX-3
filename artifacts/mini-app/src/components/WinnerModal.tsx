import type { CSSProperties } from "react";

export type WinnerPrize = {
  name: string;
  valueTon: number;
  imageUrl?: string | null;
};

export type WinnerModalProps = {
  name: string;
  payout: number;
  mult: number;
  photo?: string | null;
  color?: string;
  prizes?: WinnerPrize[];
  onClose?: () => void;
};

function initials(name: string) {
  const s = (name || "?").replace(/^@/, "").trim();
  return (s.slice(0, 2) || "?").toUpperCase();
}

export default function WinnerModal({
  name, payout, mult, photo, color = "#4ade80", prizes = [], onClose,
}: WinnerModalProps) {
  const display = (name || "?").replace(/^@/, "");
  return (
    <div style={backdrop} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        {onClose && (
          <button type="button" onClick={onClose} style={closeBtn}>×</button>
        )}
        <div style={confettiLayer} aria-hidden>
          {Array.from({ length: 16 }).map((_, i) => (
            <span key={i} style={{
              position: "absolute",
              left: `${6 + (i * 37) % 88}%`,
              top: `${4 + (i * 53) % 90}%`,
              width: 6 + (i % 3) * 2,
              height: 6 + (i % 3) * 2,
              borderRadius: i % 2 === 0 ? "50%" : 2,
              background: ["#f472b6", "#fbbf24", "#60a5fa", "#4ade80", "#c084fc"][i % 5],
              opacity: 0.55,
            }} />
          ))}
        </div>
        <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", lineHeight: 1.25 }}>
            {display}{" "}
            <span style={{ color: "#86efac" }}>выиграл</span>
          </div>
          <div style={{
            margin: "16px auto 0", width: 88, height: 88, borderRadius: "50%",
            border: `3px solid ${color}`,
            boxShadow: `0 0 0 6px ${color}22, 0 12px 28px rgba(0,0,0,0.35)`,
            overflow: "hidden", background: "#0a0a12",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: 28, color: "#fff",
          }}>
            {photo ? (
              <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : initials(display)}
          </div>
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: "#fff" }}>
              {payout.toFixed(2)}{" "}
              <span style={{ fontSize: 14, color: "#86efac" }}>TON</span>
            </span>
            <span style={{
              padding: "4px 10px", borderRadius: 999,
              background: "rgba(59,130,246,0.9)", color: "#fff",
              fontSize: 13, fontWeight: 800,
            }}>
              {mult.toFixed(2)}x
            </span>
          </div>
          <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            <div style={prizeCard}>
              <div style={tonIcon}>💎</div>
              <div style={prizeVal}>{payout.toFixed(2)} TON</div>
            </div>
            {prizes.map((pr, i) => (
              <div key={i} style={prizeCard}>
                <div style={nftIcon}>
                  {pr.imageUrl ? (
                    <img src={pr.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: 22 }}>🎁</span>
                  )}
                </div>
                <div style={prizeName}>{pr.name}</div>
                <div style={prizeVal}>{pr.valueTon.toFixed(2)} TON</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const backdrop: CSSProperties = {
  position: "fixed", inset: 0, zIndex: 80,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)", padding: 16,
};
const card: CSSProperties = {
  width: "100%", maxWidth: 340, borderRadius: 28,
  background: "linear-gradient(180deg, #1a2e1a 0%, #0f1a14 55%, #0a1210 100%)",
  border: "1px solid rgba(74,222,128,0.28)",
  boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
  padding: "22px 18px 20px", position: "relative", overflow: "hidden",
};
const closeBtn: CSSProperties = {
  position: "absolute", top: 12, right: 12, zIndex: 2,
  width: 32, height: 32, borderRadius: "50%", border: "none",
  background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 16, cursor: "pointer",
};
const confettiLayer: CSSProperties = {
  pointerEvents: "none", position: "absolute", inset: 0, overflow: "hidden",
};
const prizeCard: CSSProperties = {
  width: 92, borderRadius: 18,
  background: "linear-gradient(160deg,#1e293b,#0f172a)",
  border: "1px solid rgba(255,255,255,0.1)", padding: "10px 8px 8px",
};
const tonIcon: CSSProperties = {
  width: 48, height: 48, margin: "0 auto", borderRadius: 14,
  background: "linear-gradient(145deg,#38bdf8,#2563eb)",
  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
};
const nftIcon: CSSProperties = {
  width: 48, height: 48, margin: "0 auto", borderRadius: 14,
  overflow: "hidden", background: "#111827",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const prizeName: CSSProperties = {
  marginTop: 6, fontSize: 10, fontWeight: 700, color: "#94a3b8",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const prizeVal: CSSProperties = {
  marginTop: 4, fontSize: 12, fontWeight: 800, color: "#e2e8f0",
};
