import { useState, useEffect, useCallback } from "react";
import { useTelegram } from "@/lib/telegram";

const SUPERADMIN_IDS = ["7257793582"];

/* ─── Types ─── */
interface Stats {
  totalUsers: number; totalCoinsSold: number; totalTonVolume: number;
  activeOrders: number; isMarketActive: boolean; canActivate: boolean; poolProgress: string;
  admins: { telegramId: string; username: string | null }[];
}

interface UserInfo {
  id: number; telegramId: string; username: string | null; firstName: string | null; lastName: string | null;
  coins: number; ton: number; tonyxCoins: number; totalTonDeposited: number;
  totalAdsWatched: number; totalGamesPlayed: number; wins: number; losses: number;
  totalOrders: number; referrals: number; isBlocked: boolean; isAdmin: boolean; isOnline: boolean;
  lastLoginAt: string | null; createdAt: string;
  dailyOrdersStart?: number; dailyOrdersPro?: number; dailyOrdersElite?: number;
}

type Currency = "points" | "ton" | "tonyx";
type Action = "add" | "deduct";

/* ─── Helpers ─── */
function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "2-digit" })
    + " " + d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
}
function timeAgo(iso: string | null) {
  if (!iso) return "никогда";
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)    return `${sec}с назад`;
  if (sec < 3600)  return `${Math.floor(sec / 60)}м назад`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}ч назад`;
  return `${Math.floor(sec / 86400)}д назад`;
}

/* ─── Toast ─── */
function Toast({ msg, type }: { msg: string; type: "success" | "error" | "info" }) {
  const bg = type === "success" ? "rgba(22,163,74,0.95)" : type === "error" ? "rgba(220,38,38,0.95)" : "rgba(30,64,175,0.95)";
  return (
    <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: bg, color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 600, zIndex: 9999, maxWidth: "calc(100% - 32px)", boxShadow: "0 8px 28px rgba(0,0,0,0.5)" }}>
      {msg}
    </div>
  );
}

/* ─── Balance Adjuster ─── */
function BalanceAdjuster({ userId, adminId, onDone }: { userId: string; adminId: string; onDone: () => void }) {
  const [currency, setCurrency] = useState<Currency>("points");
  const [action, setAction]     = useState<Action>("add");
  const [amount, setAmount]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [toast, setToast]       = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);

  const flash = (msg: string, type: "success" | "error" | "info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); };

  const CURRENCIES: { key: Currency; label: string; color: string }[] = [
    { key: "points", label: "Points", color: "#60a5fa" },
    { key: "ton",    label: "TON",    color: "#fbbf24" },
    { key: "tonyx",  label: "TONYX",  color: "#a78bfa" },
  ];

  const submit = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) { flash("Введите сумму > 0", "error"); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/mini/admin/users/${userId}/adjust-balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId, currency, amount: num, action }),
      });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(`✅ ${action === "add" ? "Начислено" : "Списано"}: ${num} ${currency.toUpperCase()}`, "success"); setAmount(""); onDone(); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 12, padding: 14, marginTop: 10 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ fontSize: 11, color: "#475569", fontWeight: 700, marginBottom: 10, letterSpacing: "0.1em" }}>УПРАВЛЕНИЕ БАЛАНСОМ</div>

      {/* Currency selector */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {CURRENCIES.map(({ key, label, color }) => (
          <button key={key} onClick={() => setCurrency(key)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${currency === key ? color : color + "30"}`, background: currency === key ? color + "20" : "transparent", color: currency === key ? color : "#475569", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Action toggle */}
      <div style={{ display: "flex", background: "rgba(30,45,69,0.6)", borderRadius: 10, padding: 3, gap: 3, marginBottom: 10 }}>
        {([["add", "✅ Начислить"], ["deduct", "➖ Списать"]] as [Action, string][]).map(([a, lbl]) => (
          <button key={a} onClick={() => setAction(a)} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", fontFamily: "inherit", background: action === a ? (a === "add" ? "linear-gradient(135deg,#15803d,#16a34a)" : "linear-gradient(135deg,#b91c1c,#dc2626)") : "transparent", color: action === a ? "#fff" : "#475569", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Amount */}
      <div style={{ display: "flex", gap: 8 }}>
        <input value={amount} onChange={e => setAmount(e.target.value)} type="number" step="any" placeholder="Сумма"
          style={{ flex: 1, background: "rgba(30,45,69,0.7)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 8, padding: "10px 12px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 13, outline: "none" }} />
        <button onClick={submit} disabled={loading} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: action === "add" ? "linear-gradient(135deg,#15803d,#16a34a)" : "linear-gradient(135deg,#b91c1c,#dc2626)", color: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {loading ? "..." : action === "add" ? "+" : "−"}
        </button>
      </div>
    </div>
  );
}

/* ─── User card ─── */
function UserCard({ user, adminId, isSuperAdmin, onRefresh }: {
  user: UserInfo; adminId: string; isSuperAdmin: boolean; onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [toast, setToast]       = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);

  const flash = (msg: string, type: "success" | "error" | "info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); };

  const api = async (path: string, body: Record<string, unknown> = {}) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/mini/admin/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminId, ...body }) });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(d.message || "Готово", "success"); onRefresh(); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setLoading(false); }
  };

  const name = user.firstName ?? user.username ?? user.telegramId;
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <div style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.25)", borderRadius: 16, padding: 14, marginBottom: 10 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#1d4ed8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
          {initial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>{name}</span>
            {user.username && <span style={{ fontSize: 11, color: "#475569" }}>@{user.username}</span>}
            {user.isOnline
              ? <span style={{ fontSize: 9, background: "rgba(22,163,74,0.15)", color: "#4ade80", padding: "2px 6px", borderRadius: 6, fontWeight: 700 }}>В сети</span>
              : <span style={{ fontSize: 9, background: "rgba(30,45,69,0.5)", color: "#475569", padding: "2px 6px", borderRadius: 6 }}>Офлайн</span>}
            {user.isAdmin && <span style={{ fontSize: 9, background: "rgba(251,191,36,0.15)", color: "#fbbf24", padding: "2px 6px", borderRadius: 6, fontWeight: 700 }}>АДМИН</span>}
            {user.isBlocked && <span style={{ fontSize: 9, background: "rgba(220,38,38,0.15)", color: "#f87171", padding: "2px 6px", borderRadius: 6, fontWeight: 700 }}>ЗАБЛОК</span>}
          </div>
          <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>
            ID: {user.telegramId} · {timeAgo(user.lastLoginAt)}
          </div>
        </div>
        <div style={{ fontSize: 16, color: "#475569" }}>{expanded ? "▲" : "▼"}</div>
      </div>

      {/* Balance pills */}
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        {[
          { label: "Points", val: user.coins.toLocaleString(), color: "#60a5fa" },
          { label: "TON",    val: user.ton.toFixed(2),         color: "#fbbf24" },
          { label: "TONYX",  val: user.tonyxCoins.toLocaleString(), color: "#a78bfa" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ flex: 1, background: "rgba(30,45,69,0.5)", borderRadius: 10, padding: "6px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 8, color: "#334155", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: 12, borderTop: "1px solid rgba(30,58,143,0.2)", paddingTop: 12 }}>

          {/* Stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
            {[
              { label: "Реклам",      val: user.totalAdsWatched },
              { label: "Игр",         val: user.totalGamesPlayed },
              { label: "Побед",       val: user.wins },
              { label: "Проигрышей",  val: user.losses },
              { label: "P2P ордеров", val: user.totalOrders },
              { label: "Рефералов",   val: user.referrals },
              { label: "TON внесено", val: user.totalTonDeposited.toFixed(2) },
              { label: "Регистрация", val: formatDate(user.createdAt) },
            ].map(({ label, val }) => (
              <div key={label} style={{ background: "rgba(30,45,69,0.4)", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 9, color: "#334155", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9" }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Daily order limits */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, marginBottom: 6, letterSpacing: "0.1em" }}>СУТОЧНЫЕ ЛИМИТЫ ОРДЕРОВ</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[{ cat: "START", cnt: user.dailyOrdersStart ?? 0 }, { cat: "PRO", cnt: user.dailyOrdersPro ?? 0 }, { cat: "ELITE", cnt: user.dailyOrdersElite ?? 0 }].map(({ cat, cnt }) => (
                <div key={cat} style={{ flex: 1, background: "rgba(30,45,69,0.4)", borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "#475569", marginBottom: 2 }}>{cat}</div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: cnt >= 3 ? "#f87171" : "#4ade80" }}>{cnt}/3</div>
                </div>
              ))}
            </div>
          </div>

          {/* Balance adjuster */}
          <BalanceAdjuster userId={user.telegramId} adminId={adminId} onDone={onRefresh} />

          {/* Admin actions */}
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => api(`users/${user.telegramId}/block`, { block: !user.isBlocked })} disabled={loading}
              style={{ padding: "11px 0", borderRadius: 10, border: "none", fontFamily: "inherit", background: user.isBlocked ? "rgba(22,163,74,0.12)" : "rgba(220,38,38,0.1)", color: user.isBlocked ? "#4ade80" : "#f87171", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {user.isBlocked ? "✅ Разблокировать" : "🚫 Заблокировать"}
            </button>

            {isSuperAdmin && !SUPERADMIN_IDS.includes(user.telegramId) && (
              <button onClick={() => api(user.isAdmin ? "team/revoke" : "team/grant", { targetId: user.telegramId })} disabled={loading}
                style={{ padding: "11px 0", borderRadius: 10, border: "none", fontFamily: "inherit", background: user.isAdmin ? "rgba(220,38,38,0.1)" : "rgba(251,191,36,0.1)", color: user.isAdmin ? "#f87171" : "#fbbf24", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {user.isAdmin ? "⭐ Забрать роль администратора" : "⭐ Выдать роль администратора"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Team management section ─── */
function TeamSection({ admins, adminId, onRefresh }: {
  admins: { telegramId: string; username: string | null }[];
  adminId: string;
  onRefresh: () => void;
}) {
  const [targetId, setTargetId] = useState("");
  const [loading, setLoading]   = useState(false);
  const [toast, setToast]       = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);

  const flash = (msg: string, type: "success" | "error" | "info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const changeAccess = async (action: "grant" | "revoke") => {
    if (!targetId.trim()) { flash("Введите Telegram ID", "error"); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/mini/admin/team/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminId, targetId: targetId.trim() }) });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(d.message || "Готово", "success"); setTargetId(""); onRefresh(); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 16, padding: 16, marginBottom: 14 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 18 }}>⭐</span>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#fbbf24" }}>Управление командой</div>
      </div>

      {/* Current admins */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, marginBottom: 8, letterSpacing: "0.1em" }}>ТЕКУЩИЕ АДМИНИСТРАТОРЫ</div>
        {admins.length === 0 ? (
          <div style={{ fontSize: 12, color: "#334155" }}>Только суперадмин</div>
        ) : (
          admins.map(a => (
            <div key={a.telegramId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(30,45,69,0.5)", borderRadius: 10, padding: "8px 12px", marginBottom: 6 }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9" }}>{a.username ? `@${a.username}` : a.telegramId}</span>
                {SUPERADMIN_IDS.includes(a.telegramId) && <span style={{ fontSize: 9, color: "#fbbf24", marginLeft: 6 }}>SUPER</span>}
              </div>
              <span style={{ fontSize: 10, color: "#334155" }}>{a.telegramId}</span>
            </div>
          ))
        )}
      </div>

      {/* Grant / revoke */}
      <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, marginBottom: 8, letterSpacing: "0.1em" }}>ВЫДАТЬ / ЗАБРАТЬ ДОСТУП</div>
      <input value={targetId} onChange={e => setTargetId(e.target.value)} placeholder="Telegram ID пользователя"
        style={{ width: "100%", background: "rgba(30,45,69,0.6)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 10, padding: "11px 14px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => changeAccess("grant")} disabled={loading} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontFamily: "inherit", background: "linear-gradient(135deg,#92400e,#b45309)", color: "#fbbf24", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
          ✅ Дать доступ
        </button>
        <button onClick={() => changeAccess("revoke")} disabled={loading} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontFamily: "inherit", background: "rgba(220,38,38,0.1)", color: "#f87171", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          ❌ Забрать
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════
   ADMIN PAGE
═══════════════════════════ */
export default function AdminPage() {
  const { telegramId } = useTelegram();
  const [authed, setAuthed]       = useState(false);
  const [pinInput, setPinInput]   = useState("");
  const [adminId, setAdminId]     = useState<string>("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [stats, setStats]         = useState<Stats | null>(null);
  const [users, setUsers]         = useState<UserInfo[]>([]);
  const [search, setSearch]       = useState("");
  const [loading, setLoading]     = useState(false);
  const [activating, setActivating] = useState(false);
  const [toast, setToast]         = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);

  const flash = (msg: string, type: "success" | "error" | "info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const fetchStats = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/mini/admin/stats?adminId=${id}`);
      if (r.ok) setStats(await r.json());
    } catch {}
  }, []);

  const fetchUsers = useCallback(async (id: string, q = "") => {
    setLoading(true);
    try {
      const r = await fetch(`/api/mini/admin/users?adminId=${id}${q ? `&search=${encodeURIComponent(q)}` : ""}`);
      if (r.ok) { const d = await r.json(); setUsers(d.users ?? []); }
    } catch {}
    finally { setLoading(false); }
  }, []);

  const checkAccess = async (id: string) => {
    const r = await fetch(`/api/mini/admin/check?telegramId=${id}`);
    if (!r.ok) { flash("Ошибка проверки", "error"); return; }
    const d = await r.json() as { isAdmin: boolean; isSuperAdmin: boolean };
    if (!d.isAdmin) { flash("Нет доступа. Вы не администратор.", "error"); return; }
    setAdminId(id);
    setIsSuperAdmin(d.isSuperAdmin);
    setAuthed(true);
    fetchStats(id);
    fetchUsers(id);
  };

  /* Auto-login if user is admin */
  useEffect(() => {
    if (telegramId) checkAccess(telegramId);
  }, [telegramId]);

  useEffect(() => {
    if (authed && adminId) {
      const t = setInterval(() => fetchStats(adminId), 15000);
      return () => clearInterval(t);
    }
  }, [authed, adminId]);

  const handleMarketAction = async (action: "activate" | "deactivate" | "force-activate") => {
    setActivating(true);
    try {
      const r = await fetch(`/api/mini/admin/market/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminId }) });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(d.message || "Готово", "success"); fetchStats(adminId); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setActivating(false); }
  };

  /* ── Login screen ── */
  if (!authed) {
    return (
      <div style={{ padding: "40px 24px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh", gap: 16 }}>
        {toast && <Toast msg={toast.msg} type={toast.type} />}
        <div style={{ fontSize: 48 }}>🔐</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#f1f5f9" }}>Панель управления</div>
        <div style={{ fontSize: 12, color: "#475569", textAlign: "center" }}>Доступ только для администраторов</div>
        <input value={pinInput} onChange={e => setPinInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") checkAccess(pinInput); }}
          placeholder="Ваш Telegram ID"
          style={{ width: "100%", maxWidth: 300, background: "rgba(30,45,69,0.6)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 10, padding: "14px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 15, outline: "none", boxSizing: "border-box", textAlign: "center" }} />
        <button onClick={() => checkAccess(pinInput)} style={{ width: "100%", maxWidth: 300, padding: "14px 0", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>
          Войти
        </button>
      </div>
    );
  }

  /* ── Main admin panel ── */
  const poolPct = Math.min(100, ((stats?.totalCoinsSold ?? 0) / 1_000_000) * 100);

  return (
    <div style={{ padding: "16px 16px 90px" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#f1f5f9" }}>⚙️ Панель управления</div>
          <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>
            {isSuperAdmin ? "👑 Суперадмин" : "🔧 Администратор"} · {adminId}
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            {[
              { label: "ПОЛЬЗОВАТЕЛЕЙ", val: stats.totalUsers, color: "#60a5fa" },
              { label: "TONYX ПРОДАНО", val: stats.totalCoinsSold.toLocaleString(), color: "#4ade80" },
              { label: "ОБЪЁМ TON", val: stats.totalTonVolume.toFixed(2), color: "#fbbf24" },
              { label: "ОРДЕРОВ", val: stats.activeOrders, color: "#a78bfa" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 14, padding: "12px 14px" }}>
                <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Pool + market control */}
          <div style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.35)", borderRadius: 16, padding: 16, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#f1f5f9" }}>Прогресс системного пула</div>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#60a5fa" }}>{poolPct.toFixed(2)}%</div>
            </div>
            <div style={{ height: 14, borderRadius: 7, background: "rgba(30,45,69,0.8)", overflow: "hidden", marginBottom: 8 }}>
              <div style={{ height: "100%", width: `${poolPct}%`, background: "linear-gradient(90deg,#1d4ed8,#22d3ee)", borderRadius: 7, transition: "width 0.8s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569", marginBottom: 12 }}>
              <span>{stats.totalCoinsSold.toLocaleString()} продано</span>
              <span>цель: 1 000 000</span>
            </div>

            <div style={{ fontSize: 12, color: "#475569", marginBottom: 10 }}>
              Статус P2P рынка:&nbsp;
              <b style={{ color: stats.isMarketActive ? "#4ade80" : "#f87171" }}>
                {stats.isMarketActive ? "✅ АКТИВЕН" : "🔒 ЗАБЛОКИРОВАН"}
              </b>
            </div>

            {!stats.isMarketActive ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => handleMarketAction("activate")} disabled={activating || !stats.canActivate}
                  style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontFamily: "inherit", background: stats.canActivate ? "linear-gradient(135deg,#15803d,#16a34a)" : "rgba(30,45,69,0.4)", color: stats.canActivate ? "#fff" : "#334155", fontSize: 13, fontWeight: 800, cursor: stats.canActivate ? "pointer" : "not-allowed" }}>
                  {activating ? "..." : "🚀 Запустить рынок"}
                </button>
                <button onClick={() => handleMarketAction("force-activate")} disabled={activating}
                  style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(251,191,36,0.3)", background: "rgba(180,83,9,0.1)", color: "#fbbf24", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Форс
                </button>
              </div>
            ) : (
              <button onClick={() => handleMarketAction("deactivate")} disabled={activating}
                style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", fontFamily: "inherit", background: "rgba(220,38,38,0.12)", color: "#f87171", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                ⛔ Отключить рынок
              </button>
            )}
          </div>
        </>
      )}

      {/* Team management — superadmin only */}
      {isSuperAdmin && stats && (
        <TeamSection admins={stats.admins} adminId={adminId} onRefresh={() => { fetchStats(adminId); fetchUsers(adminId, search); }} />
      )}

      {/* User search */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#475569", fontWeight: 700, marginBottom: 8, letterSpacing: "0.1em" }}>ПОИСК ПОЛЬЗОВАТЕЛЕЙ</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") fetchUsers(adminId, search); }}
            placeholder="Telegram ID или @username"
            style={{ flex: 1, background: "rgba(30,45,69,0.6)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 10, padding: "11px 14px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 13, outline: "none" }} />
          <button onClick={() => fetchUsers(adminId, search)}
            style={{ padding: "11px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            🔍
          </button>
        </div>
        {search && (
          <button onClick={() => { setSearch(""); fetchUsers(adminId, ""); }}
            style={{ fontSize: 11, color: "#475569", background: "none", border: "none", cursor: "pointer", marginTop: 6, paddingLeft: 2 }}>
            Сбросить поиск
          </button>
        )}
      </div>

      {/* Users list */}
      <div style={{ fontSize: 11, color: "#475569", fontWeight: 700, marginBottom: 8, letterSpacing: "0.1em" }}>
        ПОЛЬЗОВАТЕЛИ {users.length > 0 && `(${users.length})`}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: "#334155", padding: "24px 0" }}>Загрузка...</div>
      ) : users.length === 0 ? (
        <div style={{ textAlign: "center", color: "#334155", padding: "24px 0" }}>Не найдено</div>
      ) : (
        users.map(u => (
          <UserCard key={u.telegramId} user={u} adminId={adminId} isSuperAdmin={isSuperAdmin}
            onRefresh={() => { fetchStats(adminId); fetchUsers(adminId, search); }} />
        ))
      )}
    </div>
  );
}
