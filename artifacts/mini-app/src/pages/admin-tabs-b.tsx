import { useState, useEffect, useCallback, useRef } from "react";
import type React from "react";
import {
  OWNER_ID, apiCall, Toast, useToast, SectionCard, SectionTitle, NumInput,
  type Stats, type UserInfo, type AdminWithdrawal, type AdminTopup, formatDate, toUZT, normalizeId,
} from "./admin-shared";
import { UserCard, BalanceAdjuster } from "./admin-tabs-a";

export function GeneralTab({ adminId, isSuperAdmin }: { adminId: string; isSuperAdmin: boolean }) {
  const { toast, flash } = useToast();
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[]>([]);
  const [topups, setTopups] = useState<AdminTopup[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, t] = await Promise.all([
        apiCall("withdrawals?limit=30", { adminId }),
        apiCall("topups?limit=30", { adminId }),
      ]);
      if (w.ok) { const d = await w.json(); setWithdrawals(d.withdrawals ?? d ?? []); }
      if (t.ok) { const d = await t.json(); setTopups(d.topups ?? d ?? []); }
    } catch { flash("Ошибка загрузки", "error"); }
    finally { setLoading(false); }
  }, [adminId, flash]);

  useEffect(() => { load(); }, [load]);

  const act = async (path: string, body?: object) => {
    try {
      const r = await apiCall(path, { adminId, method: "POST", body: body ? JSON.stringify(body) : undefined });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(d.message || "Готово", "success"); load(); }
    } catch { flash("Ошибка сети", "error"); }
  };

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <SectionCard color="#b45309">
        <SectionTitle icon="💸" label="Выводы" color="#fbbf24" />
        <button type="button" onClick={load} style={{ marginBottom: 10, padding: "6px 12px", borderRadius: 8, border: "none", background: "rgba(30,45,69,0.6)", color: "#60a5fa", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
          {loading ? "…" : "🔄 Обновить"}
        </button>
        {withdrawals.length === 0 && <div style={{ color: "#64748b", fontSize: 13 }}>Нет заявок</div>}
        {withdrawals.map((w) => (
          <div key={w.id} style={{ background: "rgba(30,45,69,0.4)", borderRadius: 10, padding: 10, marginBottom: 8, fontSize: 12 }}>
            <div style={{ fontWeight: 700, color: "#e2e8f0" }}>{w.userFirstName || w.userUsername || w.telegramId}</div>
            <div style={{ color: "#fbbf24" }}>{w.tonAmount ?? w.amount} TON → {w.address?.slice(0, 12)}…</div>
            <div style={{ color: "#64748b", marginTop: 4 }}>{formatDate(w.createdAt)} · {w.status}</div>
            {w.status === "pending" && isSuperAdmin && (
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button type="button" onClick={() => act(`withdrawals/${w.id}/approve`)} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", background: "rgba(34,197,94,0.2)", color: "#4ade80", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>OK</button>
                <button type="button" onClick={() => act(`withdrawals/${w.id}/reject`)} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", background: "rgba(239,68,68,0.2)", color: "#f87171", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Reject</button>
              </div>
            )}
          </div>
        ))}
      </SectionCard>
      <SectionCard color="#1d4ed8">
        <SectionTitle icon="💳" label="Пополнения" color="#60a5fa" />
        {topups.length === 0 && <div style={{ color: "#64748b", fontSize: 13 }}>Нет записей</div>}
        {topups.map((t) => (
          <div key={t.id} style={{ background: "rgba(30,45,69,0.4)", borderRadius: 10, padding: 10, marginBottom: 8, fontSize: 12 }}>
            <div style={{ fontWeight: 700 }}>{t.userFirstName || t.userUsername || t.telegramId}</div>
            <div style={{ color: "#4ade80" }}>+{t.tonAmount} TON</div>
            <div style={{ color: "#64748b" }}>{formatDate(t.createdAt)} · {t.status}</div>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

export function PlayersTab({ adminId, isSuperAdmin, stats, onRefresh }: {
  adminId: string; isSuperAdmin: boolean; stats: Stats | null; onRefresh: () => void;
}) {
  const { toast, flash } = useToast();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const q = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : "";
      const r = await apiCall(`users?page=1&limit=40${q}`, { adminId });
      const d = await r.json();
      if (r.ok) setUsers(d.users ?? []);
      else flash(d.error || "Ошибка", "error");
    } catch { flash("Ошибка сети", "error"); }
    finally { setLoading(false); }
  }, [adminId, search, flash]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ID / username"
          style={{ flex: 1, background: "rgba(30,45,69,0.7)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 10, padding: "10px 12px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 13, outline: "none" }} />
        <button type="button" onClick={loadUsers} disabled={loading} style={{
          padding: "10px 14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
        }}>{loading ? "…" : "Найти"}</button>
      </div>
      {users.map((u) => (
        <UserCard key={u.telegramId} user={u} adminId={adminId} isSuperAdmin={isSuperAdmin} onRefresh={loadUsers} />
      ))}
      {users.length === 0 && !loading && <div style={{ color: "#64748b", textAlign: "center", padding: 20 }}>Нет игроков</div>}
    </div>
  );
}
