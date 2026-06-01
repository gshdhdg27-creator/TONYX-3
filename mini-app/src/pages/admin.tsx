import { useState, useEffect, useCallback, useRef } from "react";
import { useTelegram } from "@/lib/telegram";

const OWNER_ID = "7257793582";

/* ─── Types ─── */
interface Stats {
  totalUsers: number; totalCoinsSold: number; totalTonVolume: number;
  activeOrders: number; isMarketActive: boolean; canActivate: boolean; poolProgress: string;
  isSuperAdmin: boolean;
  admins: { telegramId: string; username: string | null }[];
}

interface UserInfo {
  id: number; telegramId: string; username: string | null; firstName: string | null; lastName: string | null;
  coins: number; ton: number; tonyxCoins: number; boostRate?: number; totalTonDeposited: number;
  totalAdsWatched: number; totalGamesPlayed: number; wins: number; losses: number;
  totalOrders: number; referrals: number; isBlocked: boolean; isAdmin: boolean; isOnline: boolean;
  lastLoginAt: string | null; createdAt: string;
  dailyOrdersStart?: number; dailyOrdersPro?: number; dailyOrdersElite?: number;
}

type Currency = "points" | "ton" | "tonyx";
type Action = "add" | "deduct";

/* ─── Helpers ─── */
function normalizeId(raw: string | null | undefined): string {
  return raw != null ? String(raw).trim() : "";
}

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
    <div style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
      background: bg, color: "#fff", padding: "12px 20px", borderRadius: 12,
      fontSize: 14, fontWeight: 600, zIndex: 9999, maxWidth: "calc(100% - 32px)",
      boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
    }}>{msg}</div>
  );
}

/* ─── API helper — attaches adminId everywhere ─── */
async function apiCall(path: string, opts: RequestInit & { adminId: string }) {
  const { adminId, ...rest } = opts;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Admin-Id": adminId,
    ...(rest.headers as Record<string, string> | undefined),
  };
  let url = `/api/mini/admin/${path}`;
  // For GET: append adminId as query param too (belt-and-suspenders)
  if (!rest.method || rest.method === "GET") {
    const sep = url.includes("?") ? "&" : "?";
    url += `${sep}adminId=${encodeURIComponent(adminId)}`;
  } else {
    // For POST/PATCH: inject adminId into body
    if (rest.body && typeof rest.body === "string") {
      try {
        const parsed = JSON.parse(rest.body);
        rest.body = JSON.stringify({ adminId, ...parsed });
      } catch { /* ignore */ }
    } else if (!rest.body) {
      rest.body = JSON.stringify({ adminId });
    }
  }
  return fetch(url, { ...rest, headers });
}

/* ─── Balance Adjuster ─── */
function BalanceAdjuster({ userId, adminId, onDone }: { userId: string; adminId: string; onDone: () => void }) {
  const [currency, setCurrency] = useState<Currency>("ton");
  const [action, setAction]     = useState<Action>("add");
  const [amount, setAmount]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [toast, setToast]       = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);

  const flash = (msg: string, type: "success" | "error" | "info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); };

  const CURRENCIES: { key: Currency; label: string; color: string }[] = [
    { key: "ton",    label: "TON",    color: "#fbbf24" },
    { key: "tonyx",  label: "TONYX",  color: "#a78bfa" },
    { key: "points", label: "Points", color: "#60a5fa" },
  ];

  const submit = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) { flash("Введите сумму > 0", "error"); return; }
    setLoading(true);
    try {
      const r = await apiCall(`users/${userId}/adjust-balance`, {
        adminId, method: "POST",
        body: JSON.stringify({ currency, amount: num, action }),
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

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {CURRENCIES.map(({ key, label, color }) => (
          <button key={key} onClick={() => setCurrency(key)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${currency === key ? color : color + "30"}`, background: currency === key ? color + "20" : "transparent", color: currency === key ? color : "#475569", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", background: "rgba(30,45,69,0.6)", borderRadius: 10, padding: 3, gap: 3, marginBottom: 10 }}>
        {([["add", "✅ Начислить"], ["deduct", "➖ Списать"]] as [Action, string][]).map(([a, lbl]) => (
          <button key={a} onClick={() => setAction(a)} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", fontFamily: "inherit", background: action === a ? (a === "add" ? "linear-gradient(135deg,#15803d,#16a34a)" : "linear-gradient(135deg,#b91c1c,#dc2626)") : "transparent", color: action === a ? "#fff" : "#475569", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            {lbl}
          </button>
        ))}
      </div>

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

  const callApi = async (path: string, body: Record<string, unknown> = {}) => {
    setLoading(true);
    try {
      const r = await apiCall(path, { adminId, method: "POST", body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(d.message || "Готово", "success"); onRefresh(); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setLoading(false); }
  };

  const name = user.firstName ?? user.username ?? user.telegramId;
  const initial = name.slice(0, 1).toUpperCase();
  const isOwnerUser = user.telegramId === OWNER_ID;

  return (
    <div style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.25)", borderRadius: 16, padding: 14, marginBottom: 10 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: isOwnerUser ? "linear-gradient(135deg,#92400e,#b45309)" : "#1d4ed8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
          {initial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>{name}</span>
            {user.username && <span style={{ fontSize: 11, color: "#475569" }}>@{user.username}</span>}
            {isOwnerUser && <span style={{ fontSize: 9, background: "rgba(251,191,36,0.2)", color: "#fbbf24", padding: "2px 6px", borderRadius: 6, fontWeight: 700 }}>👑 OWNER</span>}
            {user.isOnline
              ? <span style={{ fontSize: 9, background: "rgba(22,163,74,0.15)", color: "#4ade80", padding: "2px 6px", borderRadius: 6, fontWeight: 700 }}>В сети</span>
              : <span style={{ fontSize: 9, background: "rgba(30,45,69,0.5)", color: "#475569", padding: "2px 6px", borderRadius: 6 }}>Офлайн</span>}
            {user.isAdmin && !isOwnerUser && <span style={{ fontSize: 9, background: "rgba(251,191,36,0.15)", color: "#fbbf24", padding: "2px 6px", borderRadius: 6, fontWeight: 700 }}>АДМИН</span>}
            {user.isBlocked && <span style={{ fontSize: 9, background: "rgba(220,38,38,0.15)", color: "#f87171", padding: "2px 6px", borderRadius: 6, fontWeight: 700 }}>ЗАБЛОК</span>}
          </div>
          <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>
            ID: {user.telegramId} · {timeAgo(user.lastLoginAt)}
          </div>
        </div>
        <div style={{ fontSize: 16, color: "#475569" }}>{expanded ? "▲" : "▼"}</div>
      </div>

      {/* Balance pills */}
      <div style={{ display: "flex", gap: 5, marginTop: 10, flexWrap: "wrap" }}>
        {[
          { label: "TON",    val: user.ton.toFixed(4),          color: "#fbbf24" },
          { label: "TONYX",  val: user.tonyxCoins.toLocaleString(), color: "#a78bfa" },
          { label: "Pts",    val: user.coins.toLocaleString(),  color: "#60a5fa" },
          { label: "Boost",  val: `+${((user.boostRate ?? 0) * 100).toFixed(1)}%`, color: "#4ade80" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ flex: 1, minWidth: 60, background: "rgba(30,45,69,0.5)", borderRadius: 10, padding: "5px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 8, color: "#334155", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color }}>{val}</div>
          </div>
        ))}
      </div>

      {expanded && (
        <div style={{ marginTop: 12, borderTop: "1px solid rgba(30,58,143,0.2)", paddingTop: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
            {[
              { label: "Реклам",      val: user.totalAdsWatched },
              { label: "Игр",         val: user.totalGamesPlayed },
              { label: "Побед",       val: user.wins },
              { label: "Поражений",   val: user.losses },
              { label: "P2P ордеров", val: user.totalOrders },
              { label: "Рефералов",   val: user.referrals },
              { label: "TON внесено", val: user.totalTonDeposited.toFixed(4) },
              { label: "Регистрация", val: formatDate(user.createdAt) },
            ].map(({ label, val }) => (
              <div key={label} style={{ background: "rgba(30,45,69,0.4)", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 9, color: "#334155", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9" }}>{val}</div>
              </div>
            ))}
          </div>

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

          <BalanceAdjuster userId={user.telegramId} adminId={adminId} onDone={onRefresh} />

          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {!isOwnerUser && (
              <button onClick={() => callApi(`users/${user.telegramId}/block`, { block: !user.isBlocked })} disabled={loading}
                style={{ padding: "11px 0", borderRadius: 10, border: "none", fontFamily: "inherit", background: user.isBlocked ? "rgba(22,163,74,0.12)" : "rgba(220,38,38,0.1)", color: user.isBlocked ? "#4ade80" : "#f87171", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {user.isBlocked ? "✅ Разблокировать" : "🚫 Заблокировать"}
              </button>
            )}

            {isSuperAdmin && !isOwnerUser && (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => callApi("team/grant", { targetId: user.telegramId })}
                  disabled={loading || user.isAdmin}
                  style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none", fontFamily: "inherit", background: user.isAdmin ? "rgba(30,45,69,0.3)" : "rgba(251,191,36,0.12)", color: user.isAdmin ? "#334155" : "#fbbf24", fontSize: 12, fontWeight: 700, cursor: user.isAdmin ? "not-allowed" : "pointer", opacity: user.isAdmin ? 0.5 : 1 }}>
                  ⭐ Назначить админом
                </button>
                <button
                  onClick={() => callApi("team/revoke", { targetId: user.telegramId })}
                  disabled={loading || !user.isAdmin}
                  style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none", fontFamily: "inherit", background: !user.isAdmin ? "rgba(30,45,69,0.3)" : "rgba(220,38,38,0.1)", color: !user.isAdmin ? "#334155" : "#f87171", fontSize: 12, fontWeight: 700, cursor: !user.isAdmin ? "not-allowed" : "pointer", opacity: !user.isAdmin ? 0.5 : 1 }}>
                  🔻 Снять с должности
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Team Management ─── */
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
      const r = await apiCall(`team/${action}`, { adminId, method: "POST", body: JSON.stringify({ targetId: targetId.trim() }) });
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

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, marginBottom: 8, letterSpacing: "0.1em" }}>ТЕКУЩИЕ АДМИНИСТРАТОРЫ</div>
        <div style={{ background: "rgba(30,45,69,0.5)", borderRadius: 10, padding: "8px 12px", marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24" }}>👑 Суперадмин</span>
            <span style={{ fontSize: 10, color: "#334155" }}>{OWNER_ID}</span>
          </div>
        </div>
        {admins.filter(a => a.telegramId !== OWNER_ID).map(a => (
          <div key={a.telegramId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(30,45,69,0.5)", borderRadius: 10, padding: "8px 12px", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9" }}>{a.username ? `@${a.username}` : a.telegramId}</span>
            <span style={{ fontSize: 10, color: "#334155" }}>{a.telegramId}</span>
          </div>
        ))}
      </div>

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

/* ══════════════════════════════
   ADMIN PAGE
══════════════════════════════ */
export default function AdminPage() {
  const { telegramId: tgId } = useTelegram();
  const [adminId, setAdminId]             = useState<string>("");
  const [manualId, setManualId]           = useState<string>("");
  const [authed, setAuthed]               = useState(false);
  const [authError, setAuthError]         = useState<string | null>(null);
  const [checking, setChecking]           = useState(false);
  const [isSuperAdmin, setIsSuperAdmin]   = useState(false);
  const [stats, setStats]                 = useState<Stats | null>(null);
  const [statsError, setStatsError]       = useState<string | null>(null);
  const [users, setUsers]                 = useState<UserInfo[]>([]);
  const [usersError, setUsersError]       = useState<string | null>(null);
  const [search, setSearch]               = useState("");
  const [loading, setLoading]             = useState(false);
  const [activating, setActivating]       = useState(false);
  const [toast, setToast]                 = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [page, setPage]                   = useState(1);
  const [hasMore, setHasMore]             = useState(false);

  const flash = (msg: string, type: "success" | "error" | "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  /* ── Fetch stats ── */
  const fetchStats = useCallback(async (id: string) => {
    setStatsError(null);
    try {
      const r = await apiCall("stats", { adminId: id });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setStatsError(d.error ?? `HTTP ${r.status}`);
        return;
      }
      setStats(await r.json());
    } catch (e) {
      setStatsError(String(e));
    }
  }, []);

  /* ── Fetch users ── */
  const fetchUsers = useCallback(async (id: string, q = "", pg = 1) => {
    setLoading(true);
    setUsersError(null);
    try {
      const qs = [`adminId=${encodeURIComponent(id)}`, `page=${pg}`];
      if (q) qs.push(`search=${encodeURIComponent(q)}`);
      const r = await fetch(`/api/mini/admin/users?${qs.join("&")}`, {
        headers: { "X-Admin-Id": id },
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setUsersError(d.error ?? `HTTP ${r.status}`);
        return;
      }
      const d = await r.json();
      if (pg === 1) setUsers(d.users ?? []);
      else setUsers(prev => [...prev, ...(d.users ?? [])]);
      setHasMore(d.hasMore ?? false);
      setPage(pg);
    } catch (e) {
      setUsersError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Auth check ── */
  const doAuth = useCallback(async (rawId: string) => {
    const id = normalizeId(rawId);
    if (!id) { setAuthError("Нет Telegram ID"); return; }

    // Owner: bypass network — instant auth
    if (id === OWNER_ID) {
      setAdminId(id);
      setIsSuperAdmin(true);
      setAuthed(true);
      fetchStats(id);
      fetchUsers(id);
      return;
    }

    // Others: check via API
    setChecking(true);
    setAuthError(null);
    try {
      const r = await fetch(`/api/mini/admin/check?telegramId=${encodeURIComponent(id)}`);
      if (!r.ok) { setAuthError(`Сервер недоступен (${r.status})`); return; }
      const d = await r.json() as { isAdmin: boolean; isSuperAdmin: boolean };
      if (!d.isAdmin) {
        setAuthError(`Нет доступа. Ваш ID: ${id}`);
        return;
      }
      setAdminId(id);
      setIsSuperAdmin(d.isSuperAdmin);
      setAuthed(true);
      fetchStats(id);
      fetchUsers(id);
    } catch (e) {
      setAuthError(`Ошибка сети: ${String(e)}`);
    } finally {
      setChecking(false);
    }
  }, [fetchStats, fetchUsers]);

  /* Auto-auth from Telegram context */
  const autoAuthRef = useRef(false);
  useEffect(() => {
    if (!tgId || autoAuthRef.current) return;
    autoAuthRef.current = true;
    doAuth(tgId);
  }, [tgId, doAuth]);

  /* Poll stats when authed */
  useEffect(() => {
    if (!authed || !adminId) return;
    const t = setInterval(() => fetchStats(adminId), 20000);
    return () => clearInterval(t);
  }, [authed, adminId, fetchStats]);

  /* ── Market actions ── */
  const handleMarketAction = async (action: "activate" | "deactivate" | "force-activate") => {
    setActivating(true);
    try {
      const r = await apiCall(`market/${action}`, { adminId, method: "POST" });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(d.message || "Готово", "success"); fetchStats(adminId); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setActivating(false); }
  };

  /* ── Not authed ── */
  if (!authed) {
    return (
      <div style={{ padding: "24px 16px", minHeight: "80vh", display: "flex", flexDirection: "column" }}>
        {toast && <Toast msg={toast.msg} type={toast.type} />}

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🔐</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#f1f5f9" }}>Панель управления</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>TONYX Admin</div>
        </div>

        {/* Auto-detecting from Telegram */}
        {checking && (
          <div style={{ textAlign: "center", padding: "16px 0", color: "#60a5fa", fontSize: 14 }}>
            ⏳ Проверяем доступ…
          </div>
        )}

        {/* Show detected TelegramID */}
        {tgId && !authed && !checking && (
          <div style={{ background: "rgba(30,45,69,0.5)", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#475569", textAlign: "center" }}>
            Ваш ID: <b style={{ color: "#60a5fa" }}>{tgId}</b>
          </div>
        )}

        {/* Error */}
        {authError && (
          <div style={{ background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 12, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#f87171" }}>
            {authError}
          </div>
        )}

        {/* Manual ID fallback */}
        <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#475569", marginBottom: 10 }}>Введите ваш Telegram ID вручную:</div>
          <input
            value={manualId}
            onChange={e => setManualId(e.target.value)}
            type="text"
            placeholder="Telegram ID (например: 7257793582)"
            style={{ width: "100%", background: "rgba(30,45,69,0.7)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 10, padding: "12px 14px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 10 }}
          />
          <button
            onClick={() => doAuth(manualId || tgId || "")}
            disabled={checking}
            style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}
          >
            {checking ? "⏳ Проверка…" : "Войти в панель"}
          </button>
        </div>
      </div>
    );
  }

  /* ── Main admin panel ── */
  const poolPct = Math.min(100, ((stats?.totalCoinsSold ?? 0) / 1_000_000) * 100);

  return (
    <div style={{ padding: "16px 16px 100px" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#f1f5f9" }}>⚙️ Панель управления</div>
          <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>
            {isSuperAdmin ? "👑 Суперадмин" : "🔧 Администратор"} · {adminId}
          </div>
        </div>
        <button onClick={() => fetchStats(adminId)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(30,58,143,0.3)", background: "rgba(30,45,69,0.5)", color: "#60a5fa", fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
          🔄 Обновить
        </button>
      </div>

      {/* Stats error */}
      {statsError && (
        <div style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#f87171" }}>
          ⚠️ Ошибка загрузки статистики: {statsError}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            {[
              { label: "Пользователей", val: stats.totalUsers.toLocaleString(), color: "#60a5fa", icon: "👥" },
              { label: "TONYX продано", val: stats.totalCoinsSold.toLocaleString(), color: "#a78bfa", icon: "🪙" },
              { label: "TON оборот",   val: stats.totalTonVolume.toFixed(2), color: "#fbbf24", icon: "💰" },
              { label: "Активных P2P", val: stats.activeOrders.toLocaleString(), color: "#4ade80", icon: "📊" },
            ].map(({ label, val, color, icon }) => (
              <div key={label} style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(30,58,143,0.25)", borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "#334155", marginBottom: 6 }}>{icon} {label}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Pool progress */}
          <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(30,58,143,0.25)", borderRadius: 14, padding: 16, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>🏊 Прогресс TONYX пула</div>
              <div style={{ fontSize: 12, color: stats.isMarketActive ? "#4ade80" : "#fbbf24", fontWeight: 700 }}>
                {stats.isMarketActive ? "✅ P2P ОТКРЫТ" : `${stats.poolProgress}%`}
              </div>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "rgba(30,45,69,0.8)", marginBottom: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${poolPct}%`, background: "linear-gradient(90deg,#1d4ed8,#a78bfa)", borderRadius: 4, transition: "width 0.5s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#334155" }}>
              <span>{stats.totalCoinsSold.toLocaleString()} / 1 000 000 TONYX</span>
              <span>TON: {stats.totalTonVolume.toFixed(2)}</span>
            </div>

            {/* Market controls */}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {!stats.isMarketActive && stats.canActivate && (
                <button onClick={() => handleMarketAction("activate")} disabled={activating}
                  style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", fontFamily: "inherit", background: "linear-gradient(135deg,#15803d,#16a34a)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                  ✅ Активировать P2P
                </button>
              )}
              {isSuperAdmin && (
                <button onClick={() => handleMarketAction(stats.isMarketActive ? "deactivate" : "force-activate")} disabled={activating}
                  style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", fontFamily: "inherit", background: stats.isMarketActive ? "rgba(220,38,38,0.12)" : "rgba(30,58,143,0.3)", color: stats.isMarketActive ? "#f87171" : "#60a5fa", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                  {activating ? "..." : stats.isMarketActive ? "🔒 Деактивировать" : "⚡ Форс-активация"}
                </button>
              )}
            </div>
          </div>

          {/* Team management */}
          {isSuperAdmin && (
            <TeamSection admins={stats.admins} adminId={adminId} onRefresh={() => fetchStats(adminId)} />
          )}
        </>
      )}

      {/* Users section */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#f1f5f9", marginBottom: 10 }}>👤 Пользователи</div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") fetchUsers(adminId, search, 1); }}
            placeholder="Поиск по ID или @username"
            style={{ flex: 1, background: "rgba(30,45,69,0.7)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 10, padding: "10px 14px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 13, outline: "none" }}
          />
          <button onClick={() => fetchUsers(adminId, search, 1)} style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            🔍
          </button>
        </div>

        {usersError && (
          <div style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 12, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#f87171" }}>
            ⚠️ Ошибка загрузки: {usersError}
          </div>
        )}

        {loading && users.length === 0 ? (
          <div style={{ textAlign: "center", color: "#475569", padding: "32px 0" }}>⏳ Загрузка пользователей…</div>
        ) : users.length === 0 ? (
          <div style={{ textAlign: "center", color: "#475569", padding: "32px 0" }}>Нет пользователей</div>
        ) : (
          <>
            {users.map(u => (
              <UserCard key={u.telegramId} user={u} adminId={adminId} isSuperAdmin={isSuperAdmin}
                onRefresh={() => fetchUsers(adminId, search, 1)} />
            ))}
            {hasMore && (
              <button onClick={() => fetchUsers(adminId, search, page + 1)} disabled={loading}
                style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "1px solid rgba(30,58,143,0.3)", background: "rgba(30,45,69,0.5)", color: "#60a5fa", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 8 }}>
                {loading ? "⏳ Загрузка…" : "Загрузить ещё"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
