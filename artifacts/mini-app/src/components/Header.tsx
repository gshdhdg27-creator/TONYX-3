import { useGameStore } from "@/store/gameStore";
import toncoinSrc from "@assets/toncoin_1780755414938.png";
const tonyxLogoSrc = "/tonyx-logo.jpg";

function TonIcon() {
  return (
    <img
      src={toncoinSrc}
      alt="TON"
      style={{
        width: 22, height: 22,
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
        display: "block",
      }}
    />
  );
}

function TonyxIcon() {
  return (
    <div style={{
      width: 22, height: 22,
      borderRadius: "50%",
      overflow: "hidden",
      flexShrink: 0,
      background: "#050d1a",
      border: "1.5px solid rgba(0,162,255,0.55)",
    }}>
      <img
        src={tonyxLogoSrc}
        alt="TONYX"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    </div>
  );
}

export default function Header() {
  const ton   = useGameStore((s) => s.balances.ton);
  const tonyx = useGameStore((s) => s.balances.tonyx);

  return (
    <div style={{
      position: "fixed",
      top: 8,
      right: 8,
      zIndex: 200,
      display: "flex",
      alignItems: "center",
      gap: 6,
      pointerEvents: "none",
    }}>
      {/* TON balance pill */}
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        background: "rgba(2,6,18,0.82)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: "1px solid rgba(0,152,234,0.38)",
        borderRadius: 22, padding: "5px 10px 5px 5px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.45)",
        pointerEvents: "auto",
      }}>
        <TonIcon />
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#ffffff", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
            {ton.toFixed(3)}
          </div>
          <div style={{ fontSize: 8, color: "rgba(0,162,255,0.75)", fontWeight: 700, letterSpacing: "0.1em" }}>TON</div>
        </div>
      </div>

      {/* TONYX balance pill */}
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        background: "rgba(2,6,18,0.82)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: "1px solid rgba(0,162,255,0.28)",
        borderRadius: 22, padding: "5px 10px 5px 5px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.45)",
        pointerEvents: "auto",
      }}>
        <TonyxIcon />
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#ffffff", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
            {tonyx.toLocaleString()}
          </div>
          <div style={{ fontSize: 8, color: "rgba(0,162,255,0.75)", fontWeight: 700, letterSpacing: "0.1em" }}>TONYX</div>
        </div>
      </div>
    </div>
  );
}
