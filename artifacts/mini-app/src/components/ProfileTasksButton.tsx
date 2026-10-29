import { haptic } from "@/lib/telegram";
import { useLocation } from "wouter";

/** Big Portals-style entry to Tasks from Profile */
export function ProfileTasksButton() {
  const [, setLocation] = useLocation();
  return (
    <button
      type="button"
      onClick={() => { haptic("medium"); setLocation("/tasks"); }}
      style={{
        width: "100%",
        marginBottom: 14,
        padding: "16px 18px",
        borderRadius: 18,
        border: "1px solid rgba(251,191,36,0.35)",
        background: "linear-gradient(135deg, rgba(180,83,9,0.25), rgba(251,191,36,0.12))",
        display: "flex",
        alignItems: "center",
        gap: 14,
        cursor: "pointer",
        fontFamily: "inherit",
        boxShadow: "0 8px 28px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: "linear-gradient(135deg,#f59e0b,#fbbf24)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 22, flexShrink: 0,
        boxShadow: "0 4px 16px rgba(251,191,36,0.4)",
      }}>📋</div>
      <div style={{ flex: 1, textAlign: "left" }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: "#fde68a" }}>Задания</div>
        <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 2 }}>Выполняй задания и получай награды</div>
      </div>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "rgba(251,191,36,0.15)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fbbf24", fontSize: 18, fontWeight: 700,
      }}>→</div>
    </button>
  );
}
