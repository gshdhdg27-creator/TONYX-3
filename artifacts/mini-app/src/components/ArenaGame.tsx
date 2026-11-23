import { useState } from "react";
import ArenaHistoryModal from "./ArenaHistoryModal";

/** Emergency stub after corrupted push. History (⏱) works. Full arena restore needed. */
export default function ArenaGame({
  telegramId,
  onClose,
}: {
  telegramId: string;
  tonBalance?: number;
  onBalanceChange?: (v?: number) => void;
  onClose: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "#07070c",
        color: "#f1f5f9",
        display: "flex",
        flexDirection: "column",
        fontFamily: "inherit",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.06)",
            color: "#fff",
            fontSize: 18,
            cursor: "pointer",
          }}
        >
          ←
        </button>
        <div style={{ flex: 1, textAlign: "center", fontWeight: 900, fontSize: 16 }}>ARENA</div>
        <button
          type="button"
          onClick={() => setShowHistory(true)}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.06)",
            color: "#fff",
            fontSize: 17,
            cursor: "pointer",
          }}
          title="История"
        >
          ⏱
        </button>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
            Арена на восстановлении
          </div>
          <div style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.5, maxWidth: 320 }}>
            Игра временно недоступна. История (кнопка ⏱) уже в стиле Portal — как в барабане.
            Полный код арены вернём сразу после фикса пуша.
          </div>
        </div>
      </div>

      {showHistory && (
        <ArenaHistoryModal
          telegramId={telegramId}
          onClose={() => setShowHistory(false)}
          onReplay={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}
