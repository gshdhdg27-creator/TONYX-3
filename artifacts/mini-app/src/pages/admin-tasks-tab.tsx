import { useState, useEffect, useCallback } from "react";
import type React from "react";
import {
  OWNER_ID, apiCall, Toast, useToast, SectionCard, SectionTitle,
  type Stats, type Currency, type Action, type UserInfo, type AdminTask,
  formatDate, normalizeId,
} from "./admin-shared";

const inp: React.CSSProperties = { background: "rgba(30,45,69,0.7)", border: "1px solid rgba(30,58,143,0.35)", borderRadius: 8, padding: "8px 10px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 12, outline: "none" };

export function TasksTab({ adminId, isSuperAdmin }: { adminId: string; isSuperAdmin: boolean }) {
  const { toast, flash } = useToast();
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", type: "visit", link: "", reward: "", rewardTon: "", maxCompletions: "" });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiCall("tasks-list", { adminId });
      if (!r.ok) { flash("Ошибка загрузки заданий", "error"); setTasks([]); return; }
      const d = await r.json(); setTasks(d.tasks ?? []);
    } catch { flash("Ошибка сети", "error"); setTasks([]); }
    finally { setLoading(false); }
  }, [adminId, flash]);
  useEffect(() => { load(); }, [load]);
  const createTask = async () => {
    if (!form.title.trim()) { flash("Введите название", "error"); return; }
    setLoading(true);
    try {
      const r = await apiCall("tasks-create", { adminId, method: "POST", body: JSON.stringify({ title: form.title.trim(), description: form.description.trim() || null, type: form.type, link: form.link.trim() || null, reward: parseInt(form.reward) || 0, rewardTon: parseFloat(form.rewardTon) || null, maxCompletions: parseInt(form.maxCompletions) || null }) });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash("✅ Создано", "success"); setShowForm(false); setForm({ title: "", description: "", type: "visit", link: "", reward: "", rewardTon: "", maxCompletions: "" }); load(); }
    } catch { flash("Ошибка сети", "error"); } finally { setLoading(false); }
  };
  const toggle = async (id: number, active: boolean) => {
    const r = await apiCall(`tasks/${id}/toggle`, { adminId, method: "POST", body: JSON.stringify({ active }) });
    const d = await r.json();
    if (!r.ok) flash(d.error || "Ошибка", "error"); else { flash(d.message || "✅", "success"); load(); }
  };
  const del = async (id: number) => {
    if (!confirm("Удалить задание?")) return;
    const r = await apiCall(`tasks/${id}`, { adminId, method: "DELETE" });
    const d = await r.json();
    if (!r.ok) flash(d.error || "Ошибка", "error"); else { flash("🗑 Удалено", "success"); load(); }
  };
  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <SectionCard color="#4338ca">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <SectionTitle icon="📋" label="Задания" color="#c7d2fe" />
          <button type="button" onClick={() => setShowForm(v => !v)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "rgba(99,102,241,0.2)", color: "#a5b4fc", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{showForm ? "✕" : "+ Добавить"}</button>
        </div>
        {showForm && (
          <div style={{ background: "rgba(30,45,69,0.5)", borderRadius: 12, padding: 12, marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {(["title", "description", "link", "reward", "rewardTon", "maxCompletions"] as const).map(k => (
              <input key={k} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                placeholder={{ title: "Название*", description: "Описание", link: "Ссылка", reward: "TONYX", rewardTon: "TON", maxCompletions: "Макс. выполнений" }[k]}
                style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
            ))}
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ ...inp, width: "100%" }}>
              <option value="visit">visit</option><option value="subscribe">subscribe</option><option value="bot">bot</option>
            </select>
            <button type="button" onClick={createTask} disabled={loading} style={{ padding: 10, borderRadius: 8, border: "none", background: "linear-gradient(135deg,#4f46e5,#6366f1)", color: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Создать</button>
          </div>
        )}
        <button type="button" onClick={load} style={{ marginBottom: 10, padding: "6px 12px", borderRadius: 8, border: "none", background: "rgba(30,45,69,0.6)", color: "#60a5fa", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{loading ? "…" : "🔄"}</button>
        {tasks.length === 0 && !loading && <div style={{ color: "#64748b" }}>Нет заданий — создайте первое</div>}
        {tasks.map(t => (
          <div key={t.id} style={{ background: "rgba(30,45,69,0.4)", borderRadius: 10, padding: 10, marginBottom: 8, fontSize: 12 }}>
            <div style={{ fontWeight: 700 }}>{t.title}</div>
            <div style={{ color: "#64748b" }}>{t.type} · {t.reward} TONYX{t.rewardTon ? ` / ${t.rewardTon} TON` : ""}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button type="button" onClick={() => toggle(t.id, !t.isActive)} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", fontFamily: "inherit", fontWeight: 700, cursor: "pointer", background: t.isActive ? "rgba(34,197,94,0.15)" : "rgba(100,116,139,0.2)", color: t.isActive ? "#4ade80" : "#94a3b8" }}>{t.isActive ? "ON" : "OFF"}</button>
              <button type="button" onClick={() => del(t.id)} style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "rgba(239,68,68,0.15)", color: "#f87171", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>🗑</button>
            </div>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}
