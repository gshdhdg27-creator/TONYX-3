import { useState, useEffect, useCallback } from "react";
import type React from "react";
import {
  OWNER_ID, apiCall, Toast, useToast, SectionCard, SectionTitle,
  type Stats, type Currency, type Action, type UserInfo, type AdminTask,
  formatDate, normalizeId,
} from "./admin-shared";

const GAMES_META = [
  { id: "spin", label: "Колесо", icon: "🎡" }, { id: "mines", label: "Мины", icon: "💣" },
  { id: "arena", label: "Арена", icon: "⚔️" }, { id: "igro", label: "Игромания", icon: "🃏" },
  { id: "crash", label: "Crash", icon: "📈" }, { id: "plinko", label: "Plinko", icon: "🔵" },
  { id: "coin", label: "Coin Flip", icon: "🪙" }, { id: "upgrade", label: "Upgrade", icon: "⬆️" },
];

export function GamesTab({ adminId }: { adminId: string }) {
  const { toast, flash } = useToast();
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ spin: true, mines: true, arena: true, igro: true, crash: true, plinko: true, coin: true, upgrade: true });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    fetch("/api/mini/admin/settings/games-enabled").then(r => r.json()).then(d => setEnabled(prev => ({ ...prev, ...d }))).catch(() => {});
  }, []);
  const toggle = async (id: string) => {
    const next = { ...enabled, [id]: !enabled[id] };
    setEnabled(next); setLoading(true);
    try {
      const r = await apiCall("settings/games-enabled", { adminId, method: "POST", body: JSON.stringify({ [id]: next[id] }) });
      const d = await r.json();
      if (!r.ok) { flash(d.error || "Ошибка", "error"); setEnabled(enabled); }
      else flash(`${next[id] ? "✅" : "⏸"} ${GAMES_META.find(g => g.id === id)?.label}`, "success");
    } catch { flash("Ошибка сети", "error"); setEnabled(enabled); }
    finally { setLoading(false); }
  };
  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <SectionCard>
        <SectionTitle icon="🕹️" label="Управление играми" color="#f59e0b" />
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>Выключенная игра недоступна игрокам</div>
        {GAMES_META.map(g => (
          <div key={g.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(30,45,69,0.5)", borderRadius: 12, padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 18 }}>{g.icon}</span>
              <span style={{ fontWeight: 700, color: enabled[g.id] ? "#f1f5f9" : "#64748b" }}>{g.label}</span>
            </div>
            <button type="button" disabled={loading} onClick={() => toggle(g.id)}
              style={{ padding: "8px 14px", borderRadius: 10, border: "none", fontFamily: "inherit", fontWeight: 800, cursor: "pointer",
                background: enabled[g.id] ? "linear-gradient(135deg,#15803d,#22c55e)" : "rgba(100,116,139,0.25)", color: enabled[g.id] ? "#fff" : "#94a3b8" }}>
              {enabled[g.id] ? "ВКЛ" : "ВЫКЛ"}
            </button>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}
