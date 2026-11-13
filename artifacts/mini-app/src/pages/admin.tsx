import { useState, useEffect, useCallback, useRef } from "react";
import { NftGiftsTab } from "@/components/NftGiftsTab";
import { useTelegram } from "@/lib/telegram";
import { CasesAdminTab } from "@/components/CasesAdminTab";

const OWNER_ID = "7257793582";

type Currency = "ton" | "tonyx";
type Action = "add" | "deduct";

interface UserInfo {
  id: number; telegramId: string; username: string | null; firstName: string | null; lastName: string | null;
  coins: number; ton: number; tonyxCoins: number; totalTonDeposited: number;
  totalAdsWatched: number; totalGamesPlayed: number; wins: number; losses: number;
  isBlocked: boolean; isAdmin: boolean; isOnline: boolean; forceWin: boolean;
  lastIp: string | null; twinCount: number; lastLoginAt: string | null; createdAt: string;
  userStatus?: string; bannedReason?: string | null; winRateModifier?: number | null;
}
interface Stats {
  totalUsers: number; totalCoinsSold: number; totalTonVolume: number;
  activeOrders: number; isMarketActive: boolean; canActivate: boolean; poolProgress: string;
  isSuperAdmin: boolean;
  admins: { telegramId: string; username: string | null }[];
}

function normalizeId(raw: string | null | undefined): string {
  return raw != null ? String(raw).trim() : "";
}

async function apiCall(path: string, opts: RequestInit & { adminId: string }) {
  const { adminId, ...rest } = opts;
  const headers: Record<string, string> = {
    "Content-Type": "application/json", "X-Admin-Id": adminId,
    ...(rest.headers as Record<string, string> | undefined),
  };
  let url = `/api/mini/admin/${path}`;
  if (!rest.method || rest.method === "GET") {
    url += (url.includes("?") ? "&" : "?") + `adminId=${encodeURIComponent(adminId)}`;
  } else {
    if (rest.body && typeof rest.body === "string") {
      try { const p = JSON.parse(rest.body); rest.body = JSON.stringify({ adminId, ...p }); } catch { /* */ }
    } else if (!rest.body) { rest.body = JSON.stringify({ adminId }); }
  }
  return fetch(url, { ...rest, headers });
}

function Toast({ msg, type }: { msg: string; type: "success"|"error"|"info" }) {
  const bg = type==="success" ? "rgba(22,163,74,0.95)" : type==="error" ? "rgba(220,38,38,0.95)" : "rgba(30,64,175,0.95)";
  return <div style={{ position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", background:bg, color:"#fff", padding:"12px 20px", borderRadius:12, fontSize:14, fontWeight:600, zIndex:9999, maxWidth:"calc(100% - 32px)", boxShadow:"0 8px 28px rgba(0,0,0,0.5)" }}>{msg}</div>;
}

function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: "success"|"error"|"info" } | null>(null);
  const flash = useCallback((msg: string, type: "success"|"error"|"info" = "info") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
  }, []);
  return { toast, flash };
}

function BalanceAdjuster({ userId, adminId, onDone }: { userId: string; adminId: string; onDone: ()=>void }) {
  const { toast, flash } = useToast();
  const [currency, setCurrency] = useState<Currency>("ton");
  const [action, setAction] = useState<Action>("add");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) { flash("Введите сумму > 0", "error"); return; }
    setLoading(true);
    try {
      const r = await apiCall(`users/${userId}/adjust-balance`, {
        adminId, method: "POST", body: JSON.stringify({ currency, amount: num, action }),
      });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(`✅ ${action === "add" ? "Начислено" : "Списано"}: ${num} ${currency.toUpperCase()}`, "success"); setAmount(""); onDone(); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setLoading(false); }
  };

  const CURRENCIES = [
    { key: "ton" as Currency, label: "TON", color: "#fbbf24" },
    { key: "tonyx" as Currency, label: "TONYX", color: "#a78bfa" },
  ];

  return (
    <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 12, padding: 14, marginTop: 10 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, marginBottom: 10, letterSpacing: "0.1em" }}>УПРАВЛЕНИЕ БАЛАНСОМ</div>
      <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
        {CURRENCIES.map(({ key, label, color }) => (
          <button key={key} type="button" onClick={() => setCurrency(key)} style={{
            flex: 1, padding: "8px 0", borderRadius: 8,
            border: `1px solid ${currency === key ? color : color + "30"}`,
            background: currency === key ? color + "20" : "transparent",
            color: currency === key ? color : "#475569", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>{label}</button>
        ))}
      </div>
      <div style={{ display: "flex", background: "rgba(30,45,69,0.6)", borderRadius: 10, padding: 3, gap: 3, marginBottom: 8 }}>
        {(["add", "deduct"] as Action[]).map((a) => (
          <button key={a} type="button" onClick={() => setAction(a)} style={{
            flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer",
            background: action === a ? (a === "add" ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)") : "transparent",
            color: action === a ? (a === "add" ? "#4ade80" : "#f87171") : "#64748b",
          }}>{a === "add" ? "✅ Начислить" : "➖ Списать"}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Сумма"
          style={{ flex: 1, background: "rgba(30,45,69,0.7)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 8, padding: "10px 12px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 14, outline: "none" }} />
        <button type="button" onClick={submit} disabled={loading} style={{
          padding: "10px 16px", borderRadius: 8, border: "none", fontFamily: "inherit", fontSize: 13, fontWeight: 800, cursor: "pointer",
          background: action === "add" ? "linear-gradient(135deg,#15803d,#22c55e)" : "linear-gradient(135deg,#b91c1c,#ef4444)", color: "#fff", opacity: loading ? 0.6 : 1,
        }}>{loading ? "…" : action === "add" ? "+" : "−"}</button>
      </div>
    </div>
  );
}

function UserCard({ user, adminId, onRefresh }: { user: UserInfo; adminId: string; onRefresh: () => void }) {
  const { toast, flash } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const name = user.firstName ?? user.username ?? user.telegramId ?? "?";
  const isOwnerUser = user.telegramId === OWNER_ID;

  const post = async (action: string, body?: object) => {
    setLoading(true);
    try {
      const r = await apiCall(`users/${user.telegramId}/${action}`, { adminId, method: "POST", body: body ? JSON.stringify(body) : undefined });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(d.message || "✅ Готово", "success"); onRefresh(); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(30,58,143,0.25)", borderRadius: 16, padding: 14, marginBottom: 10 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%", background: isOwnerUser ? "linear-gradient(135deg,#92400e,#b45309)" : "#1d4ed8",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: "#fff", flexShrink: 0,
        }}>{name.slice(0, 1).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#e2e8f0" }}>{name}{user.isAdmin ? " ⭐" : ""}</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>ID {user.telegramId}</div>
          <div style={{ fontSize: 12, marginTop: 2 }}>
            <span style={{ color: "#fbbf24", fontWeight: 700 }}>{Number(user.ton).toFixed(3)} TON</span>
            <span style={{ color: "#a78bfa", fontWeight: 700, marginLeft: 10 }}>{user.tonyxCoins} TONYX</span>
          </div>
        </div>
        <div style={{ color: "#64748b", fontSize: 18 }}>{expanded ? "▲" : "▼"}</div>
      </div>
      {expanded && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {!isOwnerUser && <BalanceAdjuster userId={user.telegramId} adminId={adminId} onDone={onRefresh} />}
          {!isOwnerUser && (
            <div style={{ display: "flex", gap: 8 }}>
              {user.userStatus === "banned" || user.isBlocked ? (
                <button type="button" disabled={loading} onClick={() => post("unban")} style={{
                  flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: "rgba(34,197,94,0.2)", color: "#4ade80", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>Разбанить</button>
              ) : (
                <button type="button" disabled={loading} onClick={() => post("ban", { reason: "Banned by admin" })} style={{
                  flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: "rgba(239,68,68,0.2)", color: "#f87171", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>Бан</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { telegramId: tgId } = useTelegram();
  const [adminId, setAdminId] = useState("");
  const [manualId, setManualId] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const { toast, flash } = useToast();
  const autoAuthRef = useRef(false);

  const fetchStats = useCallback(async (id: string) => {
    try {
      const r = await apiCall("stats", { adminId: id });
      if (r.ok) {
        const d = await r.json();
        setStats(d);
        setIsSuperAdmin(!!d.isSuperAdmin || id === OWNER_ID);
      }
    } catch { /* */ }
    try {
      const r = await fetch(`/api/mini/admin/online-count`, { headers: { "X-Admin-Id": id } });
      if (r.ok) { const d = await r.json(); setOnlineCount(d.count ?? 0); }
    } catch { /* */ }
  }, []);

  const doAuth = useCallback(async (rawId: string) => {
    const id = normalizeId(rawId);
    if (!id) { setAuthError("Нет Telegram ID"); return; }
    if (id === OWNER_ID) {
      setAdminId(id); setIsSuperAdmin(true); setAuthed(true);
      fetchStats(id); return;
    }
    setChecking(true); setAuthError(null);
    try {
      const r = await fetch(`/api/mini/admin/check?telegramId=${encodeURIComponent(id)}`);
      const d = await r.json() as { isAdmin: boolean; isSuperAdmin: boolean };
      if (!d.isAdmin) { setAuthError(`Нет доступа. Ваш ID: ${id}`); return; }
      setAdminId(id); setIsSuperAdmin(d.isSuperAdmin); setAuthed(true); fetchStats(id);
    } catch (e) { setAuthError(`Ошибка сети: ${String(e)}`); }
    finally { setChecking(false); }
  }, [fetchStats]);

  useEffect(() => {
    if (autoAuthRef.current) return;
    if (tgId) {
      autoAuthRef.current = true;
      doAuth(tgId);
    }
  }, [tgId, doAuth]);

  const loadUsers = useCallback(async () => {
    if (!adminId) return;
    setLoading(true);
    try {
      const q = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : "";
      const r = await apiCall(`users?page=1&limit=40${q}`, { adminId });
      const d = await r.json();
      if (r.ok) setUsers(d.users ?? []);
      else flash(d.error || "Ошибка загрузки", "error");
    } catch { flash("Ошибка сети", "error"); }
    finally { setLoading(false); }
  }, [adminId, search, flash]);

  useEffect(() => {
    if (authed && adminId) loadUsers();
  }, [authed, adminId, loadUsers]);

  if (!authed) {
    return (
      <div style={{ minHeight: "100%", background: "#0a0e1a", color: "#e2e8f0", padding: 24, fontFamily: "system-ui,-apple-system,sans-serif" }}>
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>Admin</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>Авторизация</div>
        {checking && <div style={{ color: "#60a5fa", marginBottom: 12 }}>Проверка доступа…</div>}
        {authError && <div style={{ color: "#f87171", marginBottom: 12, fontSize: 13 }}>{authError}</div>}
        {!tgId && (
          <div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>Telegram ID не получен. Введите вручную:</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={manualId} onChange={(e) => setManualId(e.target.value)} placeholder="Telegram ID"
                style={{ flex: 1, background: "rgba(30,45,69,0.7)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 10, padding: "10px 12px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 14, outline: "none" }} />
              <button type="button" onClick={() => doAuth(manualId)} disabled={checking} style={{
                padding: "10px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              }}>Войти</button>
            </div>
          </div>
        )}
        {tgId && !checking && !authError && (
          <div style={{ color: "#64748b", fontSize: 13 }}>Вход… ID {tgId}</div>
        )}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100%", background: "#0a0e1a", color: "#e2e8f0", padding: "12px 14px 100px", fontFamily: "system-ui,-apple-system,sans-serif" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>Admin</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>ID {adminId}{isSuperAdmin ? " · super" : ""}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 10, padding: "6px 10px", fontWeight: 800, color: "#4ade80", fontSize: 14 }}>
            {onlineCount ?? "—"} online
          </div>
          <button type="button" onClick={() => { fetchStats(adminId); loadUsers(); }} style={{
            padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(30,58,143,0.3)", background: "rgba(30,45,69,0.5)", color: "#60a5fa", fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
          }}>🔄</button>
        </div>
      </div>

      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 14 }}>
          {[
            { label: "Игроков", val: Number(stats.totalUsers).toLocaleString(), color: "#60a5fa" },
            { label: "TONYX", val: Number(stats.totalCoinsSold).toLocaleString(), color: "#a78bfa" },
            { label: "TON", val: Number(stats.totalTonVolume).toFixed(2), color: "#fbbf24" },
            { label: "P2P", val: Number(stats.activeOrders).toLocaleString(), color: "#4ade80" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(30,58,143,0.2)", borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#334155", marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 900, color }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Игроки · начисление баланса</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск ID / username"
            style={{ flex: 1, background: "rgba(30,45,69,0.7)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 10, padding: "10px 12px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 13, outline: "none" }} />
          <button type="button" onClick={loadUsers} disabled={loading} style={{
            padding: "10px 14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          }}>{loading ? "…" : "Найти"}</button>
        </div>
        {users.length === 0 && !loading && (
          <div style={{ color: "#64748b", fontSize: 13, textAlign: "center", padding: 20 }}>Нет игроков</div>
        )}
        {users.map((u) => (
          <UserCard key={u.telegramId} user={u} adminId={adminId} onRefresh={loadUsers} />
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <CasesAdminTab adminId={adminId} />
      </div>
      <div style={{ marginTop: 12 }}>
        <NftGiftsTab />
      </div>
    </div>
  );
}
