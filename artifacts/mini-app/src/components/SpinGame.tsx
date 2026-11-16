import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import FairnessModal, { type FairData } from "@/components/FairnessModal";
import SpinHistoryModal from "@/components/SpinHistoryModal";
import { haptic, hapticNotify, useTelegram } from "@/lib/telegram";

// TEMP bootstrap - full file will follow in next commit if this is incomplete
export function JackpotWheel({
  players,
  spinning,
  winnerId,
}: {
  players: Array<{ telegramId: string; username: string | null; stake: number; chance: number; photoUrl?: string | null }>;
  spinning: boolean;
  winnerId: string | null;
}) {
  return (
    <div style={{ width: 280, height: 280, margin: "0 auto", borderRadius: "50%", background: "radial-gradient(circle at 40% 35%, #2a1845, #12081f)", display: "flex", alignItems: "center", justifyContent: "center", color: "#f1f5f9", fontWeight: 800, border: "2px solid rgba(167,139,250,0.35)" }}>
      {spinning ? "Крутится…" : "PvP"}
    </div>
  );
}

export default function SpinGame({
  telegramId,
  tonBalance,
  onBalanceChange,
}: {
  telegramId: string;
  tonBalance: number;
  onBalanceChange: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  return (
    <div style={{ minHeight: "100%", padding: 16, color: "#f1f5f9" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 15 }}>🎰 PvP Барабан</div>
        <button type="button" onClick={() => setShowHistory(true)} style={{ padding: "8px 14px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#f1f5f9", fontWeight: 800, cursor: "pointer" }}>
          ⏱ История
        </button>
      </div>
      <JackpotWheel players={[]} spinning={false} winnerId={null} />
      <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)", fontSize: 13 }}>
        Восстанавливаем полную логику барабана. Обнови через минуту.
      </div>
      {showHistory && (
        <SpinHistoryModal
          telegramId={telegramId}
          onClose={() => setShowHistory(false)}
          onReplay={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}
