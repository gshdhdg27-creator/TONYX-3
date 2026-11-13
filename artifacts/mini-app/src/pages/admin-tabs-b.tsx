import { useState, useEffect, useCallback } from "react";
import type React from "react";
import {
  OWNER_ID, apiCall, Toast, useToast, SectionCard, SectionTitle,
  type Stats, type UserInfo, type AdminWithdrawal, type AdminTopup, formatDate,
} from "./admin-shared";
import { UserCard } from "./admin-tabs-a";

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

interface TwinAccount {
  telegramId: string;
  username: string | null;
  firstName: string | null;
  createdAt: string | null;
  lastLoginAt?: string | null;
  warningCount: number;
  isMain: boolean;
  isBlocked?: boolean;
  userStatus?: string | null;
  ton?: number;
  tonyxCoins?: number;
}
interface TwinGroup {
  ip: string;
  matchedBy: "ip" | "device" | "ip+device";
  count: number;
  accounts: TwinAccount[];
}

export function PlayersTab({ adminId, isSuperAdmin, stats, onRefresh }: {
  adminId: string; isSuperAdmin: boolean; stats: Stats | null; onRefresh: () => void;
}) {
  const { toast, flash } = useToast();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<TwinGroup[]>([]);
  const [twinsLoading, setTwinsLoading] = useState(false);
  const [banningIp, setBanningIp] = useState<string | null>(null);
  const [banningId, setBanningId] = useState<string | null>(null);

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

  const loadTwins = useCallback(async () => {
    setTwinsLoading(true);
    try {
      const r = await apiCall("twins", { adminId });
      if (!r.ok) { setGroups([]); return; }
      const d = await r.json();
      setGroups(d.groups ?? []);
    } catch { setGroups([]); }
    finally { setTwinsLoading(false); }
  }, [adminId]);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { loadTwins(); }, [loadTwins]);

  const banGroup = async (group: TwinGroup, keepMain: boolean) => {
    setBanningIp(group.ip);
    try {
      const r = await apiCall("twins/ban-group", {
        adminId, method: "POST",
        body: JSON.stringify({ ip: group.ip, keepMain, reason: "Твинк-аккаунт (мульти-аккаунт)" }),
      });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(d.message || "✅ Заблокировано", "success"); loadTwins(); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setBanningIp(null); }
  };

  const banOne = async (telegramId: string) => {
    if (telegramId === OWNER_ID) { flash("Нельзя банить владельца", "error"); return; }
    setBanningId(telegramId);
    try {
      const r = await apiCall(`users/${telegramId}/ban`, {
        adminId, method: "POST",
        body: JSON.stringify({ reason: "Твинк-аккаунт (тот же IP)" }),
      });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(d.message || "🔴 Забанен", "success"); loadTwins(); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setBanningId(null); }
  };

  const unbanOne = async (telegramId: string) => {
    setBanningId(telegramId);
    try {
      const r = await apiCall(`users/${telegramId}/unban`, { adminId, method: "POST" });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(d.message || "✅ Разбанен", "success"); loadTwins(); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setBanningId(null); }
  };

  const multi = groups.filter((g) => g.count >= 2);

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <SectionCard color="#dc2626">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <SectionTitle icon="🌐" label="Один IP — несколько аккаунтов" color="#f87171" />
          <button type="button" onClick={loadTwins} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(220,38,38,0.3)", background: "rgba(30,45,69,0.5)", color: "#f87171", fontFamily: "inherit", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>🔄</button>
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>
          Группы по lastIp. Самый ранний = <b style={{ color: "#4ade80" }}>ГЛАВНЫЙ</b>. Остальные — твинки (бан по одному или всех).
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#f87171", marginBottom: 12 }}>
          {multi.length} групп · {multi.reduce((s, g) => s + g.count, 0)} акк.
        </div>

        {twinsLoading ? (
          <div style={{ textAlign: "center", color: "#475569", padding: 16 }}>⏳ Загрузка…</div>
        ) : multi.length === 0 ? (
          <div style={{ textAlign: "center", color: "#475569", padding: 16 }}>✅ Совпадений по IP не найдено</div>
        ) : multi.map((g) => {
          const main = g.accounts.find((a) => a.isMain) ?? g.accounts[0];
          const twins = g.accounts.filter((a) => !a.isMain);
          return (
            <div key={g.ip} style={{ background: "rgba(30,15,15,0.65)", border: "1px solid rgba(220,38,38,0.35)", borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <div style={{ fontFamily: "monospace", fontSize: 13, color: "#fca5a5", fontWeight: 800, marginBottom: 4 }}>{g.ip}</div>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 10 }}>{g.count} аккаунтов</div>

              {main && (
                <div style={{ background: "rgba(22,163,74,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 12, padding: 10, marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span>👑</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#fbbf24" }}>{main.firstName || main.username || main.telegramId}</div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>ID: {main.telegramId}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 900, padding: "3px 8px", borderRadius: 6, background: "rgba(34,197,94,0.2)", color: "#4ade80" }}>ГЛАВНЫЙ</span>
                  </div>
                  {(main.isBlocked || main.userStatus === "banned") ? (
                    <button type="button" onClick={() => unbanOne(main.telegramId)} disabled={banningId === main.telegramId}
                      style={{ width: "100%", marginTop: 8, padding: "8px 0", borderRadius: 8, border: "none", fontFamily: "inherit", background: "rgba(22,163,74,0.15)", color: "#4ade80", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                      {banningId === main.telegramId ? "…" : "✅ Разбанить главного"}
                    </button>
                  ) : (
                    <button type="button" onClick={() => banOne(main.telegramId)} disabled={banningId === main.telegramId || main.telegramId === OWNER_ID}
                      style={{ width: "100%", marginTop: 8, padding: "8px 0", borderRadius: 8, border: "1px solid rgba(220,38,38,0.25)", fontFamily: "inherit", background: "transparent", color: "#f87171", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: main.telegramId === OWNER_ID ? 0.4 : 1 }}>
                      {banningId === main.telegramId ? "…" : "🔴 Бан главного"}
                    </button>
                  )}
                </div>
              )}

              {twins.map((acc, i) => {
                const banned = acc.isBlocked || acc.userStatus === "banned";
                return (
                  <div key={acc.telegramId} style={{ background: "rgba(15,23,42,0.7)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 10, padding: 10, marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span>👤</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9" }}>{acc.firstName || acc.username || acc.telegramId}</div>
                        <div style={{ fontSize: 9, color: "#64748b" }}>ID: {acc.telegramId}</div>
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 900, padding: "2px 7px", borderRadius: 6, background: "rgba(220,38,38,0.18)", color: "#f87171" }}>ТВИНК #{i + 1}</span>
                      {banned && <span style={{ fontSize: 9, fontWeight: 900, color: "#94a3b8" }}>БАН</span>}
                    </div>
                    {banned ? (
                      <button type="button" onClick={() => unbanOne(acc.telegramId)} disabled={banningId === acc.telegramId}
                        style={{ width: "100%", padding: "9px 0", borderRadius: 8, border: "none", fontFamily: "inherit", background: "rgba(22,163,74,0.12)", color: "#4ade80", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                        {banningId === acc.telegramId ? "…" : "✅ Разбан"}
                      </button>
                    ) : (
                      <button type="button" onClick={() => banOne(acc.telegramId)} disabled={banningId === acc.telegramId}
                        style={{ width: "100%", padding: "9px 0", borderRadius: 8, border: "none", fontFamily: "inherit", background: "rgba(220,38,38,0.2)", color: "#f87171", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                        {banningId === acc.telegramId ? "…" : "🔴 Бан этот акк"}
                      </button>
                    )}
                  </div>
                );
              })}

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => banGroup(g, true)} disabled={banningIp === g.ip || twins.length === 0}
                  style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", fontFamily: "inherit", background: "rgba(220,38,38,0.18)", color: "#f87171", fontSize: 12, fontWeight: 800, cursor: "pointer", opacity: twins.length === 0 ? 0.45 : 1 }}>
                  {banningIp === g.ip ? "⏳..." : "🔴 Бан всех твинков (главный ОК)"}
                </button>
                <button type="button" onClick={() => banGroup(g, false)} disabled={banningIp === g.ip}
                  style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none", fontFamily: "inherit", background: "rgba(127,29,29,0.35)", color: "#fca5a5", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                  {banningIp === g.ip ? "⏳..." : "💀 Всех"}
                </button>
              </div>
            </div>
          );
        })}
      </SectionCard>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, marginTop: 8 }}>
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
