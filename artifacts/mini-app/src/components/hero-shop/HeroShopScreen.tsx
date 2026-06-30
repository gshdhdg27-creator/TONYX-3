import { useGameStore } from "../../store/gameStore";

export default function HeroShopScreen() {
  const setView = useGameStore((s) => s.setView);

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 40,
      display: "flex",
      flexDirection: "column",
      background: "#0a0a12",
      fontFamily: "'Space Grotesk','Inter',system-ui,sans-serif",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        padding: "16px 16px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        marginTop: 56,
        flexShrink: 0,
      }}>
        <button
          onClick={() => setView("home")}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "none",
            borderRadius: 10,
            padding: "8px 14px",
            color: "#a0a0c0",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            marginRight: 12,
          }}
        >
          ←
        </button>
        <div>
          <div style={{ fontSize: 17, fontWeight: 900, color: "#f1f1f8", letterSpacing: 0.5 }}>
            🏪 Магазин героев
          </div>
          <div style={{ fontSize: 11, color: "#606080", marginTop: 2 }}>
            Покупайте героев для сражений
          </div>
        </div>
      </div>

      {/* Empty state */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: "0 32px",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 8 }}>⚔️</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#f1f1f8" }}>
          Скоро появятся герои
        </div>
        <div style={{ fontSize: 13, color: "#606080", lineHeight: 1.6, maxWidth: 260 }}>
          Магазин пока пустой. Герои появятся совсем скоро — следите за обновлениями!
        </div>
        <div style={{
          marginTop: 8,
          padding: "10px 22px",
          borderRadius: 12,
          background: "rgba(124,58,237,0.12)",
          border: "1px solid rgba(124,58,237,0.3)",
          fontSize: 12,
          color: "#a855f7",
          fontWeight: 700,
        }}>
          Обновление скоро
        </div>
      </div>
    </div>
  );
}
