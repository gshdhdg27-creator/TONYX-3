import { useState, useEffect, useCallback } from "react";
import type React from "react";
import {
  OWNER_ID, apiCall, Toast, useToast, SectionCard, SectionTitle, NumInput,
  type Stats, type Currency, type Action, type UserInfo, type AdminTask,
  formatDate, normalizeId,
} from "./admin-shared";

export const BOSS_DEFAULTS = [
  { level: 1, name: "Shadow Pup", hp: 25000, reviveTon: 0.1, reviveAds: 10 },
  { level: 2, name: "Rage Dogg", hp: 50000, reviveTon: 0.25, reviveAds: 25 },
  { level: 3, name: "Inferno Dogg", hp: 100000, reviveTon: 0.5, reviveAds: 50 },
  { level: 4, name: "Storm Dogg", hp: 250000, reviveTon: 1.0, reviveAds: 100 },
  { level: 5, name: "Boss Dogg Prime", hp: 500000, reviveTon: 2.5, reviveAds: null as number | null },
];

type BossRow = { hp: string; reviveTon: string; reviveAds: string };

export function GameConfigTab({ adminId }: { adminId: string }) {
  const { toast, flash } = useToast();
  const [bosses, setBosses] = useState<BossRow[]>(
    BOSS_DEFAULTS.map((b) => ({
      hp: String(b.hp),
      reviveTon: String(b.reviveTon),
      reviveAds: b.reviveAds == null ? "" : String(b.reviveAds),
    }))
  );
  const [respawnHours, setRespawnHours] = useState("24");
  const [adBoostPct, setAdBoostPct] = useState("20");
  const [tonPct1, setTonPct1] = useState("50");
  const [tonPct2, setTonPct2] = useState("100");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/mini/admin/settings/game-config")
      .then((r) => r.json())
      .then((d) => {
        setBosses(
          BOSS_DEFAULTS.map((def, i) => {
            const srv = d.bosses?.[i];
            return {
              hp: srv?.hp != null ? String(srv.hp) : String(def.hp),
              reviveTon: srv?.reviveTon != null ? String(srv.reviveTon) : String(def.reviveTon),
              reviveAds: srv?.reviveAds != null ? String(srv.reviveAds) : def.reviveAds == null ? "" : String(def.reviveAds),
            };
          })
        );
        if (d.respawnHours) setRespawnHours(String(d.respawnHours));
        if (d.adBoostPct) setAdBoostPct(String(d.adBoostPct));
        if (d.tonBoostPct1) setTonPct1(String(d.tonBoostPct1));
        if (d.tonBoostPct2) setTonPct2(String(d.tonBoostPct2));
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setLoading(true);
    try {
      const r = await apiCall("settings/game-config", {
        adminId,
        method: "POST",
        body: JSON.stringify({
          bosses: bosses.map((b) => ({
            hp: parseFloat(b.hp) || null,
            reviveTon: parseFloat(b.reviveTon) || null,
            reviveAds: b.reviveAds === "" ? null : parseInt(b.reviveAds),
          })),
          respawnHours: parseFloat(respawnHours) || 24,
          adBoostPct: parseInt(adBoostPct) || 20,
          tonBoostPct1: parseInt(tonPct1) || 50,
          tonBoostPct2: parseInt(tonPct2) || 100,
        }),
      });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else flash(d.message || "✅ Сохранено", "success");
    } catch {
      flash("Ошибка сети", "error");
    } finally {
      setLoading(false);
    }
  };

  const setField = (i: number, field: keyof BossRow, val: string) =>
    setBosses((prev) => prev.map((b, idx) => (idx === i ? { ...b, [field]: val } : b)));

  const inputStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, background: "rgba(30,45,69,0.7)", border: "1px solid rgba(30,58,143,0.35)",
    borderRadius: 8, padding: "7px 8px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 12, outline: "none",
  };

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <SectionCard color="#7c3aed">
        <SectionTitle icon="👹" label="Боссы" color="#a855f7" />
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr", gap: 6, marginBottom: 8, fontSize: 9, color: "#475569", fontWeight: 700 }}>
          <span>BOSS</span><span>HP</span><span>TON ожив.</span><span>Реклам</span>
        </div>
        {BOSS_DEFAULTS.map((def, i) => (
          <div key={def.level} style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr", gap: 6, marginBottom: 8, alignItems: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#c084fc" }}>B{def.level}</div>
            <input type="number" value={bosses[i].hp} onChange={(e) => setField(i, "hp", e.target.value)} style={inputStyle} />
            <input type="number" value={bosses[i].reviveTon} onChange={(e) => setField(i, "reviveTon", e.target.value)} step="0.01" style={inputStyle} />
            <input type="number" value={bosses[i].reviveAds} onChange={(e) => setField(i, "reviveAds", e.target.value)} style={inputStyle} />
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(124,58,237,0.2)" }}>
          <div style={{ fontSize: 11, color: "#818cf8", fontWeight: 700 }}>⏱ Возрождение (ч):</div>
          <input type="number" value={respawnHours} onChange={(e) => setRespawnHours(e.target.value)} min={1} style={{ ...inputStyle, flex: "0 0 70px" }} />
        </div>
      </SectionCard>
      <SectionCard color="#059669">
        <SectionTitle icon="🚀" label="Бусты" color="#34d399" />
        {[
          { label: "📺 Реклама %", val: adBoostPct, set: setAdBoostPct },
          { label: "💎 TON Boost I %", val: tonPct1, set: setTonPct1 },
          { label: "💎 TON Boost II %", val: tonPct2, set: setTonPct2 },
        ].map(({ label, val, set }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ flex: 1, fontSize: 12, color: "#94a3b8" }}>{label}</div>
            <input type="number" value={val} onChange={(e) => set(e.target.value)} min={0} max={500}
              style={{ width: 70, background: "rgba(30,45,69,0.7)", border: "1px solid rgba(5,150,105,0.35)", borderRadius: 8, padding: "8px 10px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 13, outline: "none", textAlign: "center" }} />
          </div>
        ))}
      </SectionCard>
      <button type="button" onClick={save} disabled={loading} style={{
        width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
        background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: loading ? 0.7 : 1,
      }}>{loading ? "⏳…" : "💾 Сохранить настройки игры"}</button>
    </div>
  );
}

export function MarketTab({ adminId, stats, isSuperAdmin, onRefresh, activating, onMarketAction }: {
  adminId: string; stats: Stats | null; isSuperAdmin: boolean;
  onRefresh: () => void; activating: boolean;
  onMarketAction: (a: "activate" | "deactivate" | "force-activate") => void;
}) {
  return (
    <SectionCard color="#0369a1">
      <SectionTitle icon="🏪" label="Маркет" color="#38bdf8" />
      <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 12 }}>
        Статус: <b style={{ color: stats?.isMarketActive ? "#4ade80" : "#f87171" }}>{stats?.isMarketActive ? "Активен" : "Выключен"}</b>
        {stats?.poolProgress != null && <span> · пул {stats.poolProgress}</span>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" disabled={activating || !isSuperAdmin} onClick={() => onMarketAction("activate")} style={{
          flex: 1, minWidth: 100, padding: 12, borderRadius: 10, border: "none", background: "rgba(34,197,94,0.2)", color: "#4ade80", fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
        }}>Включить</button>
        <button type="button" disabled={activating || !isSuperAdmin} onClick={() => onMarketAction("deactivate")} style={{
          flex: 1, minWidth: 100, padding: 12, borderRadius: 10, border: "none", background: "rgba(239,68,68,0.2)", color: "#f87171", fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
        }}>Выключить</button>
        <button type="button" disabled={activating || !isSuperAdmin} onClick={() => onMarketAction("force-activate")} style={{
          flex: 1, minWidth: 100, padding: 12, borderRadius: 10, border: "none", background: "rgba(59,130,246,0.2)", color: "#60a5fa", fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
        }}>Force</button>
      </div>
      <button type="button" onClick={onRefresh} style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, border: "none", background: "rgba(30,45,69,0.6)", color: "#60a5fa", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>🔄</button>
    </SectionCard>
  );
}

export function GamesTab({ adminId }: { adminId: string }) {
  const { toast, flash } = useToast();
  return (
    <SectionCard>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <SectionTitle icon="🕹️" label="Игры" />
      <div style={{ fontSize: 13, color: "#64748b" }}>Настройки игр (админ ID {adminId}). Основные параметры — во вкладке Игра.</div>
    </SectionCard>
  );
}

export function TasksTab({ adminId, isSuperAdmin }: { adminId: string; isSuperAdmin: boolean }) {
  const { toast, flash } = useToast();
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiCall("tasks", { adminId });
      const d = await r.json();
      if (r.ok) setTasks(d.tasks ?? d ?? []);
    } catch { flash("Ошибка", "error"); }
    finally { setLoading(false); }
  }, [adminId, flash]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <SectionCard color="#7c3aed">
        <SectionTitle icon="📋" label="Задания" color="#c084fc" />
        <button type="button" onClick={load} style={{ marginBottom: 10, padding: "6px 12px", borderRadius: 8, border: "none", background: "rgba(30,45,69,0.6)", color: "#60a5fa", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
          {loading ? "…" : "🔄"}
        </button>
        {tasks.map((t) => (
          <div key={t.id} style={{ background: "rgba(30,45,69,0.4)", borderRadius: 10, padding: 10, marginBottom: 8, fontSize: 12 }}>
            <div style={{ fontWeight: 700 }}>{t.title}</div>
            <div style={{ color: "#64748b" }}>{t.type} · reward {t.reward}{t.rewardTon ? ` / ${t.rewardTon} TON` : ""}</div>
            <div style={{ color: t.isActive ? "#4ade80" : "#f87171" }}>{t.isActive ? "active" : "off"}</div>
          </div>
        ))}
        {tasks.length === 0 && <div style={{ color: "#64748b" }}>Нет заданий</div>}
      </SectionCard>
    </div>
  );
}

export function BalanceAdjuster({ userId, adminId, onDone }: { userId: string; adminId: string; onDone: () => void }) {
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

export function UserCard({ user, adminId, isSuperAdmin, onRefresh }: {
  user: UserInfo; adminId: string; isSuperAdmin?: boolean; onRefresh: () => void;
}) {
  const { toast, flash } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const name = user.firstName ?? user.username ?? user.telegramId ?? "?";
  const isOwnerUser = user.telegramId === OWNER_ID;

  const post = async (action: string, body?: object) => {
    setLoading(true);
    try {
      const r = await apiCall(`users/${user.telegramId}/${action}`, {
        adminId, method: "POST", body: body ? JSON.stringify(body) : undefined,
      });
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
          width: 44, height: 44, borderRadius: "50%",
          background: isOwnerUser ? "linear-gradient(135deg,#92400e,#b45309)" : "#1d4ed8",
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
