import { useState, useEffect, useCallback } from "react";
import type React from "react";
import {
  OWNER_ID, apiCall, Toast, useToast, SectionCard, SectionTitle,
  type Stats, type Currency, type Action, type UserInfo, type AdminTask,
  formatDate, normalizeId,
} from "./admin-shared";

export function BalanceAdjuster({ userId, adminId, onDone }: { userId: string; adminId: string; onDone: () => void }) {
  const { toast, flash } = useToast();
  const [currency, setCurrency] = useState<Currency>("ton");
  const [action, setAction] = useState<Action>("add");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    const num = parseFloat(amount);
    if (action !== "set" && (!num || num <= 0)) { flash("Сумма > 0", "error"); return; }
    if (action === "set" && (!Number.isFinite(num) || num < 0)) { flash("Сумма >= 0", "error"); return; }
    setLoading(true);
    try {
      const r = await apiCall(`users/${userId}/adjust-balance`, { adminId, method: "POST", body: JSON.stringify({ currency, amount: num, action }) });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(`✅ ${action === "set" ? "Set" : action === "add" ? "+" : "−"} ${num} ${currency}`, "success"); setAmount(""); onDone(); }
    } catch { flash("Ошибка сети", "error"); } finally { setLoading(false); }
  };
  return (
    <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 12, padding: 14, marginTop: 10 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, marginBottom: 10 }}>БАЛАНС</div>
      <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
        {([{ k: "ton" as Currency, l: "TON", c: "#fbbf24" }, { k: "tonyx" as Currency, l: "TONYX", c: "#a78bfa" }, { k: "coins" as Currency, l: "Pts", c: "#34d399" }]).map(({ k, l, c }) => (
          <button key={k} type="button" onClick={() => setCurrency(k)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${currency === k ? c : c + "30"}`, background: currency === k ? c + "20" : "transparent", color: currency === k ? c : "#475569", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{l}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 3, marginBottom: 8, background: "rgba(30,45,69,0.6)", borderRadius: 10, padding: 3 }}>
        {(["add", "deduct", "set"] as Action[]).map(a => (
          <button key={a} type="button" onClick={() => setAction(a)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontFamily: "inherit", fontSize: 11, fontWeight: 700, cursor: "pointer",
            background: action === a ? (a === "add" ? "rgba(34,197,94,0.25)" : a === "deduct" ? "rgba(239,68,68,0.25)" : "rgba(59,130,246,0.25)") : "transparent",
            color: action === a ? (a === "add" ? "#4ade80" : a === "deduct" ? "#f87171" : "#60a5fa") : "#64748b" }}>{a === "add" ? "+" : a === "deduct" ? "−" : "Set"}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="Сумма" style={{ flex: 1, background: "rgba(30,45,69,0.7)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 8, padding: "10px 12px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 14, outline: "none" }} />
        <button type="button" onClick={submit} disabled={loading} style={{ padding: "10px 16px", borderRadius: 8, border: "none", fontFamily: "inherit", fontWeight: 800, cursor: "pointer", color: "#fff",
          background: action === "add" ? "linear-gradient(135deg,#15803d,#22c55e)" : action === "deduct" ? "linear-gradient(135deg,#b91c1c,#ef4444)" : "linear-gradient(135deg,#1d4ed8,#3b82f6)" }}>{loading ? "…" : "OK"}</button>
      </div>
    </div>
  );
}

export function UserCard({ user, adminId, isSuperAdmin, onRefresh }: { user: UserInfo; adminId: string; isSuperAdmin?: boolean; onRefresh: () => void }) {
  const { toast, flash } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const name = user.firstName ?? user.username ?? user.telegramId ?? "?";
  const isOwner = user.telegramId === OWNER_ID;
  const post = async (action: string, body?: object) => {
    setLoading(true);
    try {
      const r = await apiCall(`users/${user.telegramId}/${action}`, { adminId, method: "POST", body: body ? JSON.stringify(body) : undefined });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error"); else { flash(d.message || "✅", "success"); onRefresh(); }
    } catch { flash("Ошибка сети", "error"); } finally { setLoading(false); }
  };
  return (
    <div style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.25)", borderRadius: 16, padding: 14, marginBottom: 10 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: isOwner ? "linear-gradient(135deg,#92400e,#b45309)" : "#1d4ed8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: "#fff" }}>{name.slice(0, 1).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#e2e8f0" }}>{name}{isOwner ? " 👑" : ""}{user.isAdmin ? " ⭐" : ""}</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>ID {user.telegramId}</div>
          <div style={{ fontSize: 12, marginTop: 2 }}><span style={{ color: "#fbbf24", fontWeight: 700 }}>{Number(user.ton).toFixed(3)} TON</span><span style={{ color: "#a78bfa", fontWeight: 700, marginLeft: 10 }}>{user.tonyxCoins} TONYX</span></div>
        </div>
        <div style={{ color: "#64748b" }}>{expanded ? "▲" : "▼"}</div>
      </div>
      {expanded && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <BalanceAdjuster userId={user.telegramId} adminId={adminId} onDone={onRefresh} />
          {!isOwner && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(user.userStatus === "banned" || user.isBlocked) ? (
                <button type="button" disabled={loading} onClick={() => post("unban")} style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: "rgba(34,197,94,0.2)", color: "#4ade80", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Разбанить</button>
              ) : (
                <button type="button" disabled={loading} onClick={() => post("ban", { reason: "Banned by admin" })} style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: "rgba(239,68,68,0.2)", color: "#f87171", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>🔴 Бан</button>
              )}
              <button type="button" disabled={loading} onClick={() => post("soft-delete", { reason: "Мягкое удаление" })} style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: "rgba(234,179,8,0.15)", color: "#fbbf24", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>🗑 Soft-del</button>
            </div>
          )}
          {isSuperAdmin && !isOwner && (
            <button type="button" disabled={loading} onClick={() => { if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 4000); return; } post("delete-data"); setConfirmDelete(false); }}
              style={{ padding: 11, borderRadius: 10, border: `1px solid ${confirmDelete ? "rgba(239,68,68,0.7)" : "rgba(239,68,68,0.25)"}`, background: confirmDelete ? "rgba(220,38,38,0.25)" : "rgba(220,38,38,0.06)", color: "#f87171", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              {confirmDelete ? "⚠️ ЕЩЁ РАЗ" : "🗑️ Удалить данные"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
