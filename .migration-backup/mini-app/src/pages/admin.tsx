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
  forceWin: boolean; lastIp: string | null; twinCount: number; isMainAccount: boolean;
  lastLoginAt: string | null; createdAt: string;
  dailyOrdersStart?: number; dailyOrdersPro?: number; dailyOrdersElite?: number;
  userStatus?: string; bannedReason?: string | null; winRateModifier?: number | null;
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

function toUZT(iso: string | null): string {
  if (!iso) return "—";
  const utc = new Date(iso).getTime();
  const uzt = new Date(utc + 5 * 60 * 60 * 1000);
  const d = uzt.getUTCDate().toString().padStart(2, "0");
  const mo = (uzt.getUTCMonth() + 1).toString().padStart(2, "0");
  const h = uzt.getUTCHours().toString().padStart(2, "0");
  const m = uzt.getUTCMinutes().toString().padStart(2, "0");
  return `${d}.${mo} ${h}:${m} UZT`;
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
  const [expanded, setExpanded]       = useState(false);
  const [loading, setLoading]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast]             = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);

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

  const handleDeleteData = async () => {
    if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 4000); return; }
    setConfirmDelete(false);
    await callApi(`users/${user.telegramId}/delete-data`);
  };

  const name = user.firstName ?? user.username ?? user.telegramId ?? "?";
  const initial = (name ?? "?").slice(0, 1).toUpperCase();
  const isOwnerUser = user.telegramId === OWNER_ID;
  const hasTwins = (user.twinCount ?? 0) > 0;

  return (
    <div style={{ background: "rgba(15,23,42,0.95)", border: `1px solid ${hasTwins ? "rgba(251,191,36,0.35)" : "rgba(30,58,143,0.25)"}`, borderRadius: 16, padding: 14, marginBottom: 10 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: isOwnerUser ? "linear-gradient(135deg,#92400e,#b45309)" : "#1d4ed8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: "#fff", flexShrink: 0, position: "relative" }}>
          {initial}
          {user.isOnline && (
            <div style={{ position: "absolute", bottom: 1, right: 1, width: 10, height: 10, borderRadius: "50%", background: "#22c55e", border: "2px solid #0f172a", boxShadow: "0 0 6px #22c55e" }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>{name}</span>
            {user.username && <span style={{ fontSize: 11, color: "#475569" }}>@{user.username}</span>}
            {isOwnerUser && <span style={{ fontSize: 9, background: "rgba(251,191,36,0.2)", color: "#fbbf24", padding: "2px 6px", borderRadius: 6, fontWeight: 700 }}>👑 OWNER</span>}
            {user.isOnline
              ? <span style={{ fontSize: 9, background: "rgba(22,163,74,0.2)", color: "#4ade80", padding: "2px 6px", borderRadius: 6, fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />В СЕТИ</span>
              : <span style={{ fontSize: 9, background: "rgba(30,45,69,0.5)", color: "#475569", padding: "2px 6px", borderRadius: 6 }}>ОФЛАЙН</span>}
            {user.isAdmin && !isOwnerUser && <span style={{ fontSize: 9, background: "rgba(251,191,36,0.15)", color: "#fbbf24", padding: "2px 6px", borderRadius: 6, fontWeight: 700 }}>АДМИН</span>}
            {user.isBlocked && <span style={{ fontSize: 9, background: "rgba(220,38,38,0.15)", color: "#f87171", padding: "2px 6px", borderRadius: 6, fontWeight: 700 }}>ЗАБЛОК</span>}
            {user.forceWin && <span style={{ fontSize: 9, background: "rgba(250,204,21,0.2)", color: "#facc15", padding: "2px 6px", borderRadius: 6, fontWeight: 700 }}>⚡ БОГ</span>}
          </div>
          <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>
            ID: {user.telegramId} · {toUZT(user.lastLoginAt)}
          </div>
        </div>
        <div style={{ fontSize: 16, color: "#475569" }}>{expanded ? "▲" : "▼"}</div>
      </div>

      {/* Twin detection badge */}
      {hasTwins && (
        <div style={{ marginTop: 8, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.35)", borderRadius: 10, padding: "7px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#fbbf24" }}>⚠️ Найдено {user.twinCount} аккаунт(ов) на этом IP</div>
            {user.lastIp && <div style={{ fontSize: 9, color: "#92400e", marginTop: 2, fontFamily: "monospace" }}>IP: {user.lastIp}</div>}
          </div>
          <span style={{ fontSize: 9, fontWeight: 900, padding: "3px 8px", borderRadius: 6, background: user.isMainAccount ? "rgba(34,197,94,0.15)" : "rgba(220,38,38,0.15)", color: user.isMainAccount ? "#4ade80" : "#f87171" }}>
            {user.isMainAccount ? "ГЛАВНЫЙ" : "ТВИНК"}
          </span>
        </div>
      )}
      {!hasTwins && user.lastIp && (
        <div style={{ marginTop: 6, fontSize: 9, color: "#334155", fontFamily: "monospace" }}>IP: {user.lastIp}</div>
      )}

      {/* Balance pills */}
      <div style={{ display: "flex", gap: 5, marginTop: 10, flexWrap: "wrap" }}>
        {[
          { label: "TON",    val: Number(user.ton ?? 0).toFixed(4),              color: "#fbbf24" },
          { label: "TONYX",  val: Number(user.tonyxCoins ?? 0).toLocaleString(), color: "#a78bfa" },
          { label: "Pts",    val: Number(user.coins ?? 0).toLocaleString(),      color: "#60a5fa" },
          { label: "Boost",  val: `+${(Number(user.boostRate ?? 0) * 100).toFixed(1)}%`, color: "#4ade80" },
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
              { label: "TON внесено", val: Number(user.totalTonDeposited ?? 0).toFixed(4) },
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

            {/* God mode toggle */}
            {!isOwnerUser && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: user.forceWin ? "rgba(250,204,21,0.1)" : "rgba(30,45,69,0.5)", border: `1px solid ${user.forceWin ? "rgba(250,204,21,0.4)" : "rgba(30,58,143,0.25)"}`, borderRadius: 10, padding: "10px 14px" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: user.forceWin ? "#facc15" : "#94a3b8" }}>⚡ Режим Бога (100% выигрыш в Минах)</div>
                  <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>{user.forceWin ? "АКТИВЕН" : "ВЫКЛЮЧЕН"}</div>
                </div>
                <button
                  onClick={() => callApi(`users/${user.telegramId}/force-win`, { enable: !user.forceWin })}
                  disabled={loading}
                  style={{ padding: "8px 16px", borderRadius: 8, border: "none", fontFamily: "inherit", background: user.forceWin ? "rgba(250,204,21,0.2)" : "rgba(30,58,143,0.4)", color: user.forceWin ? "#facc15" : "#60a5fa", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                >
                  {user.forceWin ? "ВЫКЛ" : "ВКЛ"}
                </button>
              </div>
            )}

            {/* Win Rate Modifier */}
            {!isOwnerUser && (
              <WinRateRow telegramId={user.telegramId} adminId={adminId} current={user.winRateModifier ?? null} onDone={onRefresh} />
            )}

            {/* Moderation: ban/soft-delete/restore/reset */}
            {!isOwnerUser && (
              <ModerationRow telegramId={user.telegramId} adminId={adminId} status={user.userStatus ?? "active"} bannedReason={user.bannedReason ?? null} onDone={onRefresh} />
            )}

            {/* Admin grant / revoke */}
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

            {/* Delete data — super admin only */}
            {isSuperAdmin && !isOwnerUser && (
              <button
                onClick={handleDeleteData}
                disabled={loading}
                style={{ padding: "11px 0", borderRadius: 10, border: `1px solid ${confirmDelete ? "rgba(239,68,68,0.7)" : "rgba(239,68,68,0.25)"}`, fontFamily: "inherit", background: confirmDelete ? "rgba(220,38,38,0.25)" : "rgba(220,38,38,0.06)", color: confirmDelete ? "#fca5a5" : "#f87171", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
              >
                {confirmDelete ? "⚠️ НАЖМИТЕ ЕЩЁ РАЗ для подтверждения" : "🗑️ УДАЛИТЬ ДАННЫЕ профиля"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Win Rate Row ─── */
function WinRateRow({ telegramId, adminId, current, onDone }: {
  telegramId: string; adminId: string; current: number | null; onDone: () => void;
}) {
  const [val, setVal] = useState(current !== null ? String(current) : "");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success"|"error"|"info" } | null>(null);
  const flash = (msg: string, type: "success"|"error"|"info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const save = async () => {
    setLoading(true);
    try {
      const r = await apiCall(`users/${telegramId}/win-rate`, { adminId, method: "POST", body: JSON.stringify({ modifier: val === "" ? null : Number(val) }) });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(d.message || "✅ Сохранено", "success"); onDone(); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10, padding: "10px 12px" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ fontSize: 10, color: "#818cf8", fontWeight: 800, letterSpacing: "0.08em", marginBottom: 6 }}>
        ⚙️ WIN RATE MODIFIER {current !== null ? <span style={{ color: "#c7d2fe" }}>({current}%)</span> : <span style={{ color: "#334155" }}>(честная игра)</span>}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="number" min={0} max={100} value={val} onChange={e => setVal(e.target.value)}
          placeholder="0–100 или пусто"
          style={{ flex: 1, background: "rgba(30,45,69,0.7)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 8, padding: "8px 10px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 12, outline: "none" }}
        />
        <button onClick={save} disabled={loading}
          style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "rgba(99,102,241,0.3)", color: "#c7d2fe", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          {loading ? "…" : "Применить"}
        </button>
      </div>
      <div style={{ fontSize: 9, color: "#334155", marginTop: 4 }}>0%=всегда проигрывает · 100%=всегда выигрывает · пусто=честная игра</div>
    </div>
  );
}

/* ─── Moderation Row ─── */
function ModerationRow({ telegramId, adminId, status, bannedReason, onDone }: {
  telegramId: string; adminId: string; status: string; bannedReason: string | null; onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success"|"error"|"info" } | null>(null);
  const [banReason, setBanReason] = useState("");
  const [showBanInput, setShowBanInput] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const flash = (msg: string, type: "success"|"error"|"info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const post = async (action: string, body?: object) => {
    setLoading(true);
    try {
      const r = await apiCall(`users/${telegramId}/${action}`, { adminId, method: "POST", body: body ? JSON.stringify(body) : undefined });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(d.message || "✅ Готово", "success"); onDone(); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ background: "rgba(30,45,69,0.4)", border: "1px solid rgba(30,58,143,0.2)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ fontSize: 10, color: "#475569", fontWeight: 800, letterSpacing: "0.08em" }}>
        🛡 МОДЕРАЦИЯ — статус: <span style={{ color: status === "banned" ? "#f87171" : status === "soft_deleted" ? "#fbbf24" : "#4ade80" }}>{status}</span>
        {bannedReason && <span style={{ color: "#64748b", fontWeight: 500 }}> · {bannedReason}</span>}
      </div>

      {/* Ban button */}
      {status !== "banned" && (
        showBanInput ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Причина бана…"
              style={{ background: "rgba(30,45,69,0.7)", border: "1px solid rgba(220,38,38,0.4)", borderRadius: 8, padding: "8px 10px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 12, outline: "none" }} />
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => { post("ban", { reason: banReason }); setShowBanInput(false); }} disabled={loading}
                style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: "rgba(220,38,38,0.2)", color: "#f87171", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                🔴 Подтвердить бан
              </button>
              <button onClick={() => setShowBanInput(false)}
                style={{ padding: "9px 12px", borderRadius: 8, border: "none", background: "rgba(30,45,69,0.5)", color: "#94a3b8", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowBanInput(true)} disabled={loading}
            style={{ padding: "9px 0", borderRadius: 8, border: "none", background: "rgba(220,38,38,0.1)", color: "#f87171", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            🔴 Заблокировать (ban)
          </button>
        )
      )}

      {/* Unban */}
      {status === "banned" && (
        <button onClick={() => post("unban")} disabled={loading}
          style={{ padding: "9px 0", borderRadius: 8, border: "none", background: "rgba(22,163,74,0.12)", color: "#4ade80", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          ✅ Разблокировать
        </button>
      )}

      {/* Soft-delete */}
      {status !== "soft_deleted" && (
        <button onClick={() => post("soft-delete")} disabled={loading}
          style={{ padding: "9px 0", borderRadius: 8, border: "none", background: "rgba(234,179,8,0.08)", color: "#fbbf24", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          🗑 Мягкое удаление
        </button>
      )}

      {/* Restore */}
      {(status === "soft_deleted") && (
        <button onClick={() => post("restore")} disabled={loading}
          style={{ padding: "9px 0", borderRadius: 8, border: "none", background: "rgba(22,163,74,0.08)", color: "#4ade80", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          ♻️ Восстановить
        </button>
      )}

      {/* Reset account data */}
      <button
        onClick={() => {
          if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 5000); return; }
          post("reset"); setConfirmReset(false);
        }}
        disabled={loading}
        style={{ padding: "9px 0", borderRadius: 8, border: `1px solid ${confirmReset ? "rgba(239,68,68,0.5)" : "rgba(30,58,143,0.2)"}`, background: confirmReset ? "rgba(220,38,38,0.15)" : "transparent", color: confirmReset ? "#fca5a5" : "#64748b", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
        {confirmReset ? "⚠️ ЕЩЁ РАЗ для сброса всех данных" : "🔄 Сбросить данные аккаунта"}
      </button>
    </div>
  );
}

/* ─── Tasks Admin Section ─── */
interface AdminTask {
  id: number; title: string; description: string | null; type: string; link: string | null;
  reward: number; rewardTon: number | null; maxCompletions: number | null; currentCompletions: number;
  isActive: boolean; createdAt: string;
}

function TasksAdminSection({ adminId }: { adminId: string }) {
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success"|"error"|"info" } | null>(null);
  const [form, setForm] = useState({ title: "", description: "", type: "visit", link: "", reward: "", rewardTon: "", maxCompletions: "" });
  const [showForm, setShowForm] = useState(false);

  const flash = (msg: string, type: "success"|"error"|"info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiCall("tasks-list", { adminId, method: "GET" });
      const d = await r.json();
      setTasks(d.tasks ?? []);
    } catch { flash("Ошибка загрузки заданий", "error"); }
    finally { setLoading(false); }
  }, [adminId]);

  useEffect(() => { load(); }, [load]);

  const createTask = async () => {
    if (!form.title.trim()) { flash("Введите название", "error"); return; }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(), description: form.description.trim() || null,
        type: form.type, link: form.link.trim() || null,
        reward: parseInt(form.reward) || 0,
        rewardTon: parseFloat(form.rewardTon) || null,
        maxCompletions: parseInt(form.maxCompletions) || null,
      };
      const r = await apiCall("tasks-create", { adminId, method: "POST", body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash("✅ Задание создано", "success"); setForm({ title: "", description: "", type: "visit", link: "", reward: "", rewardTon: "", maxCompletions: "" }); setShowForm(false); load(); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setLoading(false); }
  };

  const toggle = async (id: number, active: boolean) => {
    try {
      const r = await apiCall(`tasks/${id}/toggle`, { adminId, method: "POST", body: JSON.stringify({ active }) });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(d.message || "✅", "success"); load(); }
    } catch { flash("Ошибка сети", "error"); }
  };

  const deleteTask = async (id: number) => {
    try {
      const r = await apiCall(`tasks/${id}`, { adminId, method: "DELETE" });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash("🗑 Задание удалено", "success"); load(); }
    } catch { flash("Ошибка сети", "error"); }
  };

  return (
    <div style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 16, padding: 16, marginBottom: 14 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>📋</span>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#c7d2fe" }}>Задания (CPA)</div>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "rgba(99,102,241,0.2)", color: "#a5b4fc", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          {showForm ? "✕ Закрыть" : "+ Добавить"}
        </button>
      </div>

      {showForm && (
        <div style={{ background: "rgba(30,45,69,0.5)", borderRadius: 12, padding: 14, marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11, color: "#818cf8", fontWeight: 800, letterSpacing: "0.08em", marginBottom: 4 }}>НОВОЕ ЗАДАНИЕ</div>
          {[
            { key: "title", placeholder: "Название задания*", type: "text" },
            { key: "description", placeholder: "Описание (опционально)", type: "text" },
            { key: "link", placeholder: "Ссылка (URL или Telegram)", type: "text" },
            { key: "reward", placeholder: "Награда в TONYX (pts)", type: "number" },
            { key: "rewardTon", placeholder: "Награда в TON (напр. 0.05)", type: "number" },
            { key: "maxCompletions", placeholder: "Макс. выполнений (пусто = безлимит)", type: "number" },
          ].map(({ key, placeholder, type }) => (
            <input key={key} type={type} value={(form as Record<string, string>)[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
              style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 8, padding: "9px 12px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 12, outline: "none" }} />
          ))}
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 8, padding: "9px 12px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 12, outline: "none" }}>
            <option value="visit">visit (перейти по ссылке)</option>
            <option value="subscribe">subscribe (подписаться)</option>
            <option value="external">external (внешнее действие)</option>
          </select>
          <button onClick={createTask} disabled={loading}
            style={{ padding: "11px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#4338ca,#6366f1)", color: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
            {loading ? "Создание…" : "✅ Создать задание"}
          </button>
        </div>
      )}

      {loading && tasks.length === 0 ? (
        <div style={{ textAlign: "center", color: "#475569", padding: "16px 0", fontSize: 12 }}>⏳ Загрузка…</div>
      ) : tasks.length === 0 ? (
        <div style={{ textAlign: "center", color: "#475569", padding: "16px 0", fontSize: 12 }}>Нет заданий</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tasks.map(t => (
            <div key={t.id} style={{ background: t.isActive ? "rgba(30,45,69,0.5)" : "rgba(15,23,42,0.4)", border: `1px solid ${t.isActive ? "rgba(99,102,241,0.2)" : "rgba(30,58,143,0.1)"}`, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: t.isActive ? "#e2e8f0" : "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    {t.reward > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#60a5fa", background: "rgba(37,99,235,0.12)", borderRadius: 5, padding: "2px 6px" }}>+{t.reward.toLocaleString()} pts</span>}
                    {t.rewardTon && t.rewardTon > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24", background: "rgba(251,191,36,0.12)", borderRadius: 5, padding: "2px 6px" }}>+{t.rewardTon} TON</span>}
                    {t.maxCompletions && <span style={{ fontSize: 10, color: "#94a3b8", background: "rgba(30,45,69,0.5)", borderRadius: 5, padding: "2px 6px" }}>{t.currentCompletions}/{t.maxCompletions}</span>}
                    <span style={{ fontSize: 10, color: "#334155", background: "rgba(30,45,69,0.3)", borderRadius: 5, padding: "2px 6px" }}>{t.type}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => toggle(t.id, !t.isActive)}
                    style={{ padding: "5px 8px", borderRadius: 7, border: "none", background: t.isActive ? "rgba(234,179,8,0.12)" : "rgba(22,163,74,0.12)", color: t.isActive ? "#fbbf24" : "#4ade80", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    {t.isActive ? "⏸" : "▶️"}
                  </button>
                  <button onClick={() => deleteTask(t.id)}
                    style={{ padding: "5px 8px", borderRadius: 7, border: "none", background: "rgba(220,38,38,0.08)", color: "#f87171", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Queue Depth Section ─── */
function QueueDepthSection({ adminId }: { adminId: string }) {
  const [depth, setDepth]   = useState<number | null>(null);
  const [input, setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast]   = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);

  const flash = (msg: string, type: "success" | "error" | "info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    fetch(`/api/mini/admin/settings/queue-depth?adminId=${adminId}`)
      .then(r => r.json())
      .then(d => { setDepth(d.depth ?? 1); setInput(String(d.depth ?? 1)); })
      .catch(() => { setDepth(1); setInput("1"); });
  }, [adminId]);

  const save = async () => {
    const d = Math.max(1, parseInt(input) || 1);
    setLoading(true);
    try {
      const r = await fetch("/api/mini/admin/settings/queue-depth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId, depth: d }),
      });
      const data = await r.json();
      if (!r.ok) { flash(data.error || "Ошибка", "error"); }
      else { setDepth(d); flash(data.message || `✅ Глубина очереди: ${d}`, "success"); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ background: "rgba(15,25,55,0.7)", border: "1px solid rgba(30,58,143,0.35)", borderRadius: 16, padding: 16, marginBottom: 14 }}>
      {toast && <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", background: toast.type === "success" ? "#16a34a" : toast.type === "error" ? "#dc2626" : "#2563eb", color: "#fff", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 700, zIndex: 999, whiteSpace: "nowrap" }}>{toast.msg}</div>}
      <div style={{ fontSize: 12, fontWeight: 900, color: "#60a5fa", letterSpacing: "0.08em", marginBottom: 12 }}>⚙️ ОЧЕРЕДЬ ОРДЕРОВ</div>
      <div style={{ fontSize: 11, color: "#475569", marginBottom: 10 }}>
        Глубина очереди = сколько самых старых открытых ордеров можно купить одновременно.
        {depth !== null && <span style={{ color: "#fbbf24", fontWeight: 700 }}> Сейчас: {depth}</span>}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="number"
          min="1"
          max="100"
          value={input}
          onChange={e => setInput(e.target.value)}
          style={{ width: 80, background: "rgba(15,25,55,0.8)", border: "1px solid rgba(30,58,143,0.5)", borderRadius: 8, padding: "8px 10px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 14, outline: "none" }}
        />
        <button
          onClick={save}
          disabled={loading}
          style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", fontFamily: "inherit", fontSize: 12, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
        >
          {loading ? "..." : "Сохранить"}
        </button>
      </div>
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

/* ─── Withdrawal management ─── */
interface AdminWithdrawal {
  id: number; telegramId: string; tonAmount: string | null; amount: number;
  address: string; status: string; txHash: string | null; createdAt: string;
  userFirstName: string | null; userUsername: string | null;
  userLastIp: string | null; isTwin: boolean;
}

function WithdrawalsSection({ adminId }: { adminId: string }) {
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[]>([]);
  const [loading, setLoading]         = useState(false);
  const [filter, setFilter]           = useState<"pending"|"approved"|"rejected">("pending");
  const [toast, setToast]             = useState<{ msg: string; type: "success"|"error"|"info" } | null>(null);
  const [txInputs, setTxInputs]       = useState<Record<number, string>>({});
  const [busy, setBusy]               = useState<Record<number, boolean>>({});

  const flash = (msg: string, type: "success"|"error"|"info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async (f: string) => {
    setLoading(true);
    try {
      const r = await apiCall(`withdrawals?status=${f}`, { adminId, method: "GET" });
      const d = await r.json();
      setWithdrawals(d.withdrawals ?? []);
    } catch { flash("Ошибка загрузки", "error"); }
    finally { setLoading(false); }
  }, [adminId]);

  useEffect(() => { load(filter); }, [filter, load]);

  const approve = async (id: number) => {
    setBusy(prev => ({ ...prev, [id]: true }));
    try {
      const r = await apiCall(`withdrawals/${id}/approve`, {
        adminId, method: "POST",
        body: JSON.stringify({ txHash: txInputs[id] || null }),
      });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(d.message || "✅ Одобрено", "success"); load(filter); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setBusy(prev => ({ ...prev, [id]: false })); }
  };

  const reject = async (id: number) => {
    setBusy(prev => ({ ...prev, [id]: true }));
    try {
      const r = await apiCall(`withdrawals/${id}/reject`, { adminId, method: "POST" });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash("❌ Отклонено, баланс возвращён", "success"); load(filter); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setBusy(prev => ({ ...prev, [id]: false })); }
  };

  const pendingCount = filter === "pending" ? withdrawals.length : 0;

  return (
    <div style={{ marginBottom: 14 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#f1f5f9", display: "flex", alignItems: "center", gap: 8 }}>
          💸 Заявки на вывод
          {pendingCount > 0 && (
            <span style={{ background: "rgba(220,38,38,0.2)", color: "#f87171", borderRadius: 8, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
              {pendingCount}
            </span>
          )}
        </div>
        <button onClick={() => load(filter)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(30,58,143,0.3)", background: "rgba(30,45,69,0.5)", color: "#60a5fa", fontFamily: "inherit", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          🔄
        </button>
      </div>

      {/* Status filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["pending", "approved", "rejected"] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            flex: 1, padding: "7px 0", borderRadius: 8, border: "none",
            fontFamily: "inherit",
            background: filter === s
              ? (s === "pending" ? "rgba(220,38,38,0.22)" : s === "approved" ? "rgba(22,163,74,0.22)" : "rgba(100,116,139,0.22)")
              : "rgba(30,45,69,0.4)",
            color: filter === s
              ? (s === "pending" ? "#f87171" : s === "approved" ? "#4ade80" : "#94a3b8")
              : "#475569",
            fontSize: 11, fontWeight: 700, cursor: "pointer",
          }}>
            {s === "pending" ? "⏳ Ожидают" : s === "approved" ? "✅ Одобрены" : "❌ Отклонены"}
          </button>
        ))}
      </div>

      {loading && withdrawals.length === 0 ? (
        <div style={{ textAlign: "center", color: "#475569", padding: "20px 0" }}>⏳ Загрузка…</div>
      ) : withdrawals.length === 0 ? (
        <div style={{ textAlign: "center", color: "#475569", padding: "20px 0", fontSize: 13 }}>Заявок нет</div>
      ) : (
        withdrawals.map(w => {
          const tonAmt = w.tonAmount ? Number(w.tonAmount) : w.amount / 1000;
          const name   = w.userFirstName ?? (w.userUsername ? `@${w.userUsername}` : w.telegramId);
          const isbusy = busy[w.id] ?? false;
          return (
            <div key={w.id} style={{
              background: "rgba(15,23,42,0.95)",
              border: `1px solid ${w.isTwin ? "rgba(220,38,38,0.45)" : "rgba(30,58,143,0.25)"}`,
              borderRadius: 14, padding: 14, marginBottom: 10,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {name}
                    {w.isTwin && <span style={{ fontSize: 10, background: "rgba(220,38,38,0.2)", color: "#f87171", padding: "2px 7px", borderRadius: 6, fontWeight: 700 }}>⚠️ TWIN IP</span>}
                  </div>
                  <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>
                    ID: {w.telegramId} · {w.userLastIp ?? "IP неизвестен"}
                  </div>
                  <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>{new Date(w.createdAt).toLocaleString("ru")}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "#fbbf24", lineHeight: 1 }}>{tonAmt.toFixed(4)}</div>
                  <div style={{ fontSize: 10, color: "#fbbf24", fontWeight: 700 }}>TON</div>
                </div>
              </div>

              <div style={{ background: "rgba(30,45,69,0.5)", borderRadius: 8, padding: "7px 10px", marginBottom: 8, fontSize: 10, color: "#94a3b8", wordBreak: "break-all", fontFamily: "monospace" }}>
                → {w.address}
              </div>

              {w.txHash && (
                <div style={{ fontSize: 10, color: "#4ade80", fontFamily: "monospace", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  TX: {w.txHash}
                </div>
              )}

              {w.status === "pending" && (
                <>
                  <input
                    value={txInputs[w.id] ?? ""}
                    onChange={e => setTxInputs(prev => ({ ...prev, [w.id]: e.target.value }))}
                    placeholder="TxHash (если уже отправили вручную — необязательно)"
                    style={{ width: "100%", background: "rgba(30,45,69,0.6)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 8, padding: "8px 10px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 11, outline: "none", boxSizing: "border-box", marginBottom: 8 }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => approve(w.id)} disabled={isbusy} style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", fontFamily: "inherit", background: "linear-gradient(135deg,#15803d,#22c55e)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: isbusy ? 0.6 : 1 }}>
                      {isbusy ? "…" : "✅ ОДОБРИТЬ"}
                    </button>
                    <button onClick={() => reject(w.id)} disabled={isbusy} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none", fontFamily: "inherit", background: "rgba(220,38,38,0.14)", color: "#f87171", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: isbusy ? 0.6 : 1 }}>
                      {isbusy ? "…" : "❌"}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

/* ─── Topup management ─── */
interface AdminTopup {
  id: number; telegramId: string; tonAmount: string;
  memo: string | null; walletAddress: string | null;
  status: string; createdAt: string;
  userFirstName: string | null; userUsername: string | null;
}

function TopupsSection({ adminId }: { adminId: string }) {
  const [topups, setTopups]   = useState<AdminTopup[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState<"pending"|"approved"|"rejected">("pending");
  const [toast, setToast]     = useState<{ msg: string; type: "success"|"error"|"info" } | null>(null);
  const [busy, setBusy]       = useState<Record<number, boolean>>({});

  const flash = (msg: string, type: "success"|"error"|"info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async (f: string) => {
    setLoading(true);
    try {
      const r = await apiCall(`topups?status=${f}`, { adminId, method: "GET" });
      const d = await r.json();
      setTopups(d.topups ?? []);
    } catch { flash("Ошибка загрузки", "error"); }
    finally { setLoading(false); }
  }, [adminId]);

  useEffect(() => { load(filter); }, [filter, load]);

  const approve = async (id: number) => {
    setBusy(prev => ({ ...prev, [id]: true }));
    try {
      const r = await apiCall(`topups/${id}/approve`, { adminId, method: "POST" });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash(d.message || "✅ Зачислено", "success"); load(filter); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setBusy(prev => ({ ...prev, [id]: false })); }
  };

  const reject = async (id: number) => {
    setBusy(prev => ({ ...prev, [id]: true }));
    try {
      const r = await apiCall(`topups/${id}/reject`, { adminId, method: "POST" });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else { flash("❌ Топап отклонён", "success"); load(filter); }
    } catch { flash("Ошибка сети", "error"); }
    finally { setBusy(prev => ({ ...prev, [id]: false })); }
  };

  const pendingCount = filter === "pending" ? topups.length : 0;

  return (
    <div style={{ marginBottom: 14 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#f1f5f9", display: "flex", alignItems: "center", gap: 8 }}>
          💎 Заявки на пополнение
          {pendingCount > 0 && (
            <span style={{ background: "rgba(30,58,143,0.3)", color: "#60a5fa", borderRadius: 8, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
              {pendingCount}
            </span>
          )}
        </div>
        <button onClick={() => load(filter)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(30,58,143,0.3)", background: "rgba(30,45,69,0.5)", color: "#60a5fa", fontFamily: "inherit", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          🔄
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["pending", "approved", "rejected"] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            flex: 1, padding: "7px 0", borderRadius: 8, border: "none", fontFamily: "inherit",
            background: filter === s
              ? (s === "pending" ? "rgba(30,58,143,0.3)" : s === "approved" ? "rgba(22,163,74,0.22)" : "rgba(100,116,139,0.22)")
              : "rgba(30,45,69,0.4)",
            color: filter === s
              ? (s === "pending" ? "#60a5fa" : s === "approved" ? "#4ade80" : "#94a3b8")
              : "#475569",
            fontSize: 11, fontWeight: 700, cursor: "pointer",
          }}>
            {s === "pending" ? "⏳ Ожидают" : s === "approved" ? "✅ Одобрены" : "❌ Отклонены"}
          </button>
        ))}
      </div>

      {loading && topups.length === 0 ? (
        <div style={{ textAlign: "center", color: "#475569", padding: "20px 0" }}>⏳ Загрузка…</div>
      ) : topups.length === 0 ? (
        <div style={{ textAlign: "center", color: "#475569", padding: "20px 0", fontSize: 13 }}>Заявок нет</div>
      ) : (
        topups.map(t => {
          const name = t.userFirstName ?? (t.userUsername ? `@${t.userUsername}` : t.telegramId);
          const isbusy = busy[t.id] ?? false;
          return (
            <div key={t.id} style={{
              background: "rgba(15,23,42,0.95)",
              border: "1px solid rgba(30,58,143,0.3)",
              borderRadius: 14, padding: 14, marginBottom: 10,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>{name}</div>
                  <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>ID: {t.telegramId}</div>
                  <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>{new Date(t.createdAt).toLocaleString("ru")}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "#60a5fa", lineHeight: 1 }}>{Number(t.tonAmount).toFixed(4)}</div>
                  <div style={{ fontSize: 10, color: "#60a5fa", fontWeight: 700 }}>TON</div>
                </div>
              </div>

              {t.memo && (
                <div style={{ background: "rgba(30,45,69,0.5)", borderRadius: 8, padding: "5px 10px", marginBottom: 6, fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>
                  Memo: {t.memo}
                </div>
              )}
              {t.walletAddress && (
                <div style={{ background: "rgba(30,45,69,0.5)", borderRadius: 8, padding: "5px 10px", marginBottom: 8, fontSize: 10, color: "#94a3b8", wordBreak: "break-all", fontFamily: "monospace" }}>
                  From: {t.walletAddress}
                </div>
              )}

              {t.status === "pending" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => approve(t.id)} disabled={isbusy} style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", fontFamily: "inherit", background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: isbusy ? 0.6 : 1 }}>
                    {isbusy ? "…" : "✅ ЗАЧИСЛИТЬ"}
                  </button>
                  <button onClick={() => reject(t.id)} disabled={isbusy} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none", fontFamily: "inherit", background: "rgba(220,38,38,0.14)", color: "#f87171", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: isbusy ? 0.6 : 1 }}>
                    {isbusy ? "…" : "❌"}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
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
  const [onlineCount, setOnlineCount]     = useState<number | null>(null);

  const flash = (msg: string, type: "success" | "error" | "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  /* ── Fetch online count ── */
  const fetchOnlineCount = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/mini/admin/online-count`, { headers: { "X-Admin-Id": id } });
      if (r.ok) { const d = await r.json(); setOnlineCount(d.count ?? 0); }
    } catch { /* non-fatal */ }
  }, []);

  /* ── Fetch stats ── */
  const fetchStats = useCallback(async (id: string) => {
    setStatsError(null);
    // Always fetch online count — independent of stats success/failure
    fetchOnlineCount(id);
    try {
      const r = await apiCall("stats", { adminId: id });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setStatsError(d.error ?? `HTTP ${r.status}`);
        return;
      }
      setStats(d);
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : String(e));
    }
  }, [fetchOnlineCount]);

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
      <style>{`@keyframes pulse-green { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }`}</style>
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

      {/* Live online counter — always visible regardless of stats status */}
      <div style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 14, padding: "12px 16px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e", animation: "pulse-green 1.5s ease-in-out infinite" }} />
          <div>
            <div style={{ fontSize: 11, color: "#475569" }}>🟢 Онлайн прямо сейчас (5 мин)</div>
            <div style={{ fontSize: 8, color: "#334155", marginTop: 1 }}>
              {(() => { const now = new Date(Date.now() + 5 * 60 * 60 * 1000); return `${now.getUTCHours().toString().padStart(2,"0")}:${now.getUTCMinutes().toString().padStart(2,"0")} UZT`; })()}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#4ade80" }}>
            {onlineCount ?? "—"}
          </div>
          <button onClick={() => fetchOnlineCount(adminId)} style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "rgba(34,197,94,0.15)", color: "#4ade80", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>🔄</button>
        </div>
      </div>

      {/* Stats error — diagnostic strip with retry */}
      {statsError && (
        <div style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171", marginBottom: 4 }}>⚠️ Ошибка загрузки статистики</div>
              <div style={{ fontSize: 11, color: "#f87171", fontFamily: "monospace", wordBreak: "break-all" }}>{statsError}</div>
              <div style={{ fontSize: 10, color: "#475569", marginTop: 6 }}>Разделы Топапы, Выводы и Пользователи работают независимо ↓</div>
            </div>
            <button onClick={() => fetchStats(adminId)} style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 8, border: "none", background: "rgba(220,38,38,0.15)", color: "#f87171", fontFamily: "inherit", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              🔄 Retry
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            {[
              { label: "Пользователей", val: Number(stats.totalUsers ?? 0).toLocaleString(), color: "#60a5fa", icon: "👥" },
              { label: "TONYX продано", val: Number(stats.totalCoinsSold ?? 0).toLocaleString(), color: "#a78bfa", icon: "🪙" },
              { label: "TON оборот",   val: Number(stats.totalTonVolume ?? 0).toFixed(2), color: "#fbbf24", icon: "💰" },
              { label: "Активных P2P", val: Number(stats.activeOrders ?? 0).toLocaleString(), color: "#4ade80", icon: "📊" },
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
              <span>{Number(stats.totalCoinsSold ?? 0).toLocaleString()} / 1 000 000 TONYX</span>
              <span>TON: {Number(stats.totalTonVolume ?? 0).toFixed(2)}</span>
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

          {/* Queue depth control */}
          {isSuperAdmin && <QueueDepthSection adminId={adminId} />}

          {/* Team management */}
          {isSuperAdmin && (
            <TeamSection admins={stats.admins} adminId={adminId} onRefresh={() => fetchStats(adminId)} />
          )}
        </>
      )}

      {/* Tasks admin */}
      {isSuperAdmin && <TasksAdminSection adminId={adminId} />}

      {/* Topup requests section */}
      <TopupsSection adminId={adminId} />

      {/* Withdrawals section */}
      <WithdrawalsSection adminId={adminId} />

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
          <div style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171", marginBottom: 3 }}>⚠️ Ошибка загрузки пользователей</div>
                <div style={{ fontSize: 11, color: "#f87171", fontFamily: "monospace", wordBreak: "break-all" }}>{usersError}</div>
              </div>
              <button onClick={() => fetchUsers(adminId, search, 1)} style={{ flexShrink: 0, padding: "6px 10px", borderRadius: 8, border: "none", background: "rgba(220,38,38,0.15)", color: "#f87171", fontFamily: "inherit", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                🔄
              </button>
            </div>
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
