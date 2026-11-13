import { useState, useEffect } from "react";
import type React from "react";
import {
  apiCall, Toast, useToast, SectionCard, SectionTitle,
  type Stats,
} from "./admin-shared";

export const BOSS_DEFAULTS = [
  { level: 1, name: "Shadow Pup", hp: 25000, reviveTon: 0.1, reviveAds: 10 },
  { level: 2, name: "Rage Dogg", hp: 50000, reviveTon: 0.25, reviveAds: 25 },
  { level: 3, name: "Inferno Dogg", hp: 100000, reviveTon: 0.5, reviveAds: 50 },
  { level: 4, name: "Storm Dogg", hp: 250000, reviveTon: 1.0, reviveAds: 100 },
  { level: 5, name: "Boss Dogg Prime", hp: 500000, reviveTon: 2.5, reviveAds: null as number | null },
];
type BossRow = { hp: string; reviveTon: string; reviveAds: string };
const inp: React.CSSProperties = { background: "rgba(30,45,69,0.7)", border: "1px solid rgba(30,58,143,0.35)", borderRadius: 8, padding: "8px 10px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 12, outline: "none" };

export function GameConfigTab({ adminId }: { adminId: string }) {
  const { toast, flash } = useToast();
  const [bosses, setBosses] = useState<BossRow[]>(BOSS_DEFAULTS.map(b => ({ hp: String(b.hp), reviveTon: String(b.reviveTon), reviveAds: b.reviveAds == null ? "" : String(b.reviveAds) })));
  const [respawnHours, setRespawnHours] = useState("24");
  const [adBoostPct, setAdBoostPct] = useState("20");
  const [tonPct1, setTonPct1] = useState("50");
  const [tonPct2, setTonPct2] = useState("100");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    fetch("/api/mini/admin/settings/game-config").then(r => r.json()).then(d => {
      setBosses(BOSS_DEFAULTS.map((def, i) => {
        const s = d.bosses?.[i];
        return { hp: s?.hp != null ? String(s.hp) : String(def.hp), reviveTon: s?.reviveTon != null ? String(s.reviveTon) : String(def.reviveTon), reviveAds: s?.reviveAds != null ? String(s.reviveAds) : def.reviveAds == null ? "" : String(def.reviveAds) };
      }));
      if (d.respawnHours) setRespawnHours(String(d.respawnHours));
      if (d.adBoostPct) setAdBoostPct(String(d.adBoostPct));
      if (d.tonBoostPct1) setTonPct1(String(d.tonBoostPct1));
      if (d.tonBoostPct2) setTonPct2(String(d.tonBoostPct2));
    }).catch(() => {});
  }, []);
  const save = async () => {
    setLoading(true);
    try {
      const r = await apiCall("settings/game-config", { adminId, method: "POST", body: JSON.stringify({ bosses: bosses.map(b => ({ hp: parseFloat(b.hp) || null, reviveTon: parseFloat(b.reviveTon) || null, reviveAds: b.reviveAds === "" ? null : parseInt(b.reviveAds) })), respawnHours: parseFloat(respawnHours) || 24, adBoostPct: parseInt(adBoostPct) || 20, tonBoostPct1: parseInt(tonPct1) || 50, tonBoostPct2: parseInt(tonPct2) || 100 }) });
      const d = await r.json();
      flash(!r.ok ? (d.error || "Ошибка") : (d.message || "✅"), r.ok ? "success" : "error");
    } catch { flash("Ошибка сети", "error"); } finally { setLoading(false); }
  };
  const setField = (i: number, f: keyof BossRow, v: string) => setBosses(p => p.map((b, idx) => idx === i ? { ...b, [f]: v } : b));
  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <SectionCard color="#7c3aed">
        <SectionTitle icon="👹" label="Боссы" color="#a855f7" />
        {BOSS_DEFAULTS.map((def, i) => (
          <div key={def.level} style={{ display: "grid", gridTemplateColumns: "40px 1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#c084fc" }}>B{def.level}</div>
            <input type="number" value={bosses[i].hp} onChange={e => setField(i, "hp", e.target.value)} style={inp} />
            <input type="number" value={bosses[i].reviveTon} onChange={e => setField(i, "reviveTon", e.target.value)} step="0.01" style={inp} />
            <input type="number" value={bosses[i].reviveAds} onChange={e => setField(i, "reviveAds", e.target.value)} style={inp} />
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#818cf8" }}>Возрожд. (ч)</span>
          <input type="number" value={respawnHours} onChange={e => setRespawnHours(e.target.value)} style={{ ...inp, width: 70 }} />
        </div>
      </SectionCard>
      <SectionCard color="#059669">
        <SectionTitle icon="🚀" label="Бусты %" color="#34d399" />
        {[{ l: "Реклама", v: adBoostPct, s: setAdBoostPct }, { l: "TON I", v: tonPct1, s: setTonPct1 }, { l: "TON II", v: tonPct2, s: setTonPct2 }].map(({ l, v, s }) => (
          <div key={l} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "center" }}>
            <div style={{ flex: 1, fontSize: 12, color: "#94a3b8" }}>{l}</div>
            <input type="number" value={v} onChange={e => s(e.target.value)} style={{ ...inp, width: 70, textAlign: "center" }} />
          </div>
        ))}
      </SectionCard>
      <button type="button" onClick={save} disabled={loading} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>{loading ? "…" : "💾 Сохранить"}</button>
    </div>
  );
}

export function MarketTab({ adminId, stats, isSuperAdmin, onRefresh, activating, onMarketAction }: {
  adminId: string; stats: Stats | null; isSuperAdmin: boolean; onRefresh: () => void; activating: boolean;
  onMarketAction: (a: "activate" | "deactivate" | "force-activate") => void;
}) {
  return (
    <SectionCard color="#0369a1">
      <SectionTitle icon="🏪" label="Маркет" color="#38bdf8" />
      <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 12 }}>
        Статус: <b style={{ color: stats?.isMarketActive ? "#4ade80" : "#f87171" }}>{stats?.isMarketActive ? "Активен" : "Выключен"}</b>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {(["activate", "deactivate", "force-activate"] as const).map(a => (
          <button key={a} type="button" disabled={activating || !isSuperAdmin} onClick={() => onMarketAction(a)}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: "none", fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              background: a === "activate" ? "rgba(34,197,94,0.2)" : a === "deactivate" ? "rgba(239,68,68,0.2)" : "rgba(59,130,246,0.2)",
              color: a === "activate" ? "#4ade80" : a === "deactivate" ? "#f87171" : "#60a5fa" }}>
            {a === "activate" ? "Вкл" : a === "deactivate" ? "Выкл" : "Force"}
          </button>
        ))}
      </div>
      <button type="button" onClick={onRefresh} style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, border: "none", background: "rgba(30,45,69,0.6)", color: "#60a5fa", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>🔄</button>
    </SectionCard>
  );
}

export { GamesTab } from "./admin-games-tab";
export { TasksTab } from "./admin-tasks-tab";
export { BalanceAdjuster, UserCard } from "./admin-user-card";
