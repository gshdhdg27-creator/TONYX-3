import { useGetUserProfile } from "@workspace/api-client-react";
import { useTelegram } from "@/lib/telegram";

function TonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 56 56" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="28" cy="28" r="28" fill="#0098EA"/>
      <path d="M36.8 15H19.2c-3.3 0-5.3 3.7-3.4 6.4l10 14.8c1.4 2 4.2 2 5.6 0l10-14.8c1.9-2.7-.1-6.4-3.6-6.4z" fill="white"/>
    </svg>
  );
}

function TonyxIcon() {
  return (
    <div style={{
      width: 22, height: 22, borderRadius: "50%",
      border: "1.5px solid #00a2ff",
      overflow: "hidden", flexShrink: 0, position: "relative",
    }}>
      <img
        src="/tonyx-logo.jpg"
        alt="TONYX"
        style={{
          width: "140%", height: "140%",
          objectFit: "cover",
          position: "absolute",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  );
}

export default function Header() {
  const { telegramId } = useTelegram();
  const { data: profile } = useGetUserProfile(telegramId ?? "", {
    query: { enabled: !!telegramId, refetchInterval: 6000 },
  });

  const ton   = Number((profile as { ton?: string | number } | undefined)?.ton ?? 0);
  const tonyx = Number((profile as { tonyxCoins?: number } | undefined)?.tonyxCoins ?? 0);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      padding: "8px 12px",
      gap: 8,
      background: "rgba(3,8,22,0.85)",
      backdropFilter: "blur(10px)",
      flexShrink: 0,
    }}>
      {/* TON balance */}
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        background: "rgba(0,152,234,0.12)",
        border: "1px solid rgba(0,152,234,0.3)",
        borderRadius: 20, padding: "4px 10px 4px 6px",
      }}>
        <TonIcon />
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
            {ton.toFixed(3)}
          </div>
          <div style={{ fontSize: 8, color: "rgba(0,162,255,0.7)", fontWeight: 700, letterSpacing: "0.08em" }}>TON</div>
        </div>
      </div>

      {/* TONYX balance */}
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        background: "rgba(0,100,200,0.12)",
        border: "1px solid rgba(0,162,255,0.25)",
        borderRadius: 20, padding: "4px 10px 4px 6px",
      }}>
        <TonyxIcon />
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
            {tonyx.toLocaleString()}
          </div>
          <div style={{ fontSize: 8, color: "rgba(0,162,255,0.7)", fontWeight: 700, letterSpacing: "0.08em" }}>TONYX</div>
        </div>
      </div>
    </div>
  );
}
