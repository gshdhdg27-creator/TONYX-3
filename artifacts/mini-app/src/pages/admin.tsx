import { useState, useEffect, useCallback, useRef } from "react";
import { useTelegram } from "@/lib/telegram";
import { CasesAdminTab } from "@/components/CasesAdminTab";
import { NftGiftsTab } from "@/components/NftGiftsTab";
import {
  OWNER_ID, apiCall, Toast, useToast, TabNav, normalizeId, type Stats,
} from "./admin-shared";
import { GameConfigTab, MarketTab, GamesTab, TasksTab } from "./admin-tabs-a";
import { GeneralTab, PlayersTab } from "./admin-tabs-b";

export default function AdminPage() {
  const { telegramId: tgId } = useTelegram();
  const [adminId, setAdminId] = useState("");
  const [manualId, setManualId] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activating, setActivating] = useState(false);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [tab, setTab] = useState(5);
  const { toast, flash } = useToast();

  const fetchOnlineCount = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/mini/admin/online-count`, { headers: { "X-Admin-Id": id } });
      if (r.ok) { const d = await r.json(); setOnlineCount(d.count ?? 0); }
    } catch { /* */ }
  }, []);

  const fetchStats = useCallback(async (id: string) => {
    fetchOnlineCount(id);
    try {
      const r = await apiCall("stats", { adminId: id });
      if (r.ok) { const d = await r.json(); setStats(d); }
    } catch { /* */ }
  }, [fetchOnlineCount]);

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

  const autoAuthRef = useRef(false);
  useEffect(() => {
    if (!tgId || autoAuthRef.current) return;
    autoAuthRef.current = true;
    doAuth(tgId);
  }, [tgId, doAuth]);

  useEffect(() => {
    if (!authed || !adminId) return;
    const t = setInterval(() => fetchStats(adminId), 20000);
    return () => clearInterval(t);
  }, [authed, adminId, fetchStats]);

  if (!authed) {
    return (
      <div style={{ padding: "24px 16px", minHeight: "80vh", display: "flex", flexDirection: "column" }}>
        {toast && <Toast msg={toast.msg} type={toast.type} />}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🔐</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#f1f5f9" }}>Панель управления</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>TONYX Admin</div>
        </div>
        {checking && <div style={{ textAlign: "center", padding: "16px 0", color: "#60a5fa", fontSize: 14 }}>⏳ Проверяем доступ…</div>}
        {tgId && !authed && !checking && (
          <div style={{ background: "rgba(30,45,69,0.5)", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#475569", textAlign: "center" }}>
            Ваш ID: <b style={{ color: "#60a5fa" }}>{tgId}</b>
          </div>
        )}
        {authError && (
          <div style={{ background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 12, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#f87171" }}>
            {authError}
          </div>
        )}
        <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#475569", marginBottom: 10 }}>Введите ваш Telegram ID вручную:</div>
          <input
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            type="text"
            placeholder="Telegram ID"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(30,45,69,0.7)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 10, padding: "12px 14px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 14, outline: "none", marginBottom: 10 }}
          />
          <button
            type="button"
            onClick={() => doAuth(manualId)}
            disabled={checking}
            style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}
          >
            Войти
          </button>
        </div>
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
          <button type="button" onClick={() => fetchStats(adminId)} style={{
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

      <TabNav active={tab} onChange={setTab} />

      {tab === 0 && <GameConfigTab adminId={adminId} />}
      {tab === 1 && (
        <MarketTab
          adminId={adminId}
          stats={stats}
          isSuperAdmin={isSuperAdmin}
          onRefresh={() => fetchStats(adminId)}
          activating={activating}
          onMarketAction={handleMarketAction}
        />
      )}
      {tab === 2 && <GamesTab adminId={adminId} />}
      {tab === 3 && <TasksTab adminId={adminId} isSuperAdmin={isSuperAdmin} />}
      {tab === 4 && <GeneralTab adminId={adminId} isSuperAdmin={isSuperAdmin} />}
      {tab === 5 && (
        <PlayersTab
          adminId={adminId}
          isSuperAdmin={isSuperAdmin}
          stats={stats}
          onRefresh={() => fetchStats(adminId)}
        />
      )}
      {tab === 6 && <CasesAdminTab adminId={adminId} />}
      {tab === 7 && <NftGiftsTab />}
    </div>
  );
}
