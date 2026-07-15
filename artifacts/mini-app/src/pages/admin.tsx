import { useState, useEffect, useCallback, useRef } from "react";
import { useTelegram } from "@/lib/telegram";

const OWNER_ID = "7257793582";

/* ══════════════════ TYPES ══════════════════ */
interface AdminTask {
  id: number; title: string; description: string | null; type: string; link: string | null;
  reward: number; rewardTon: number | null; maxCompletions: number | null; currentCompletions: number;
  isActive: boolean; createdAt: string;
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
interface Stats {
  totalUsers: number; totalCoinsSold: number; totalTonVolume: number;
  activeOrders: number; isMarketActive: boolean; canActivate: boolean; poolProgress: string;
  isSuperAdmin: boolean;
  admins: { telegramId: string; username: string | null }[];
}
interface AdminWithdrawal {
  id: number; telegramId: string; tonAmount: string | null; amount: number;
  address: string; status: string; txHash: string | null; createdAt: string;
  userFirstName: string | null; userUsername: string | null;
  userLastIp: string | null; isTwin: boolean;
}
interface AdminTopup {
  id: number; telegramId: string; tonAmount: string;
  memo: string | null; walletAddress: string | null;
  status: string; createdAt: string;
  userFirstName: string | null; userUsername: string | null;
}
type Currency = "points" | "ton" | "tonyx";
type Action = "add" | "deduct";

/* ══════════════════ HELPERS ══════════════════ */
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
  const uzt = new Date(new Date(iso).getTime() + 5 * 3600000);
  return `${String(uzt.getUTCDate()).padStart(2,"0")}.${String(uzt.getUTCMonth()+1).padStart(2,"0")} ${String(uzt.getUTCHours()).padStart(2,"0")}:${String(uzt.getUTCMinutes()).padStart(2,"0")} UZT`;
}
function timeAgo(iso: string | null) {
  if (!iso) return "никогда";
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)    return `${sec}с назад`;
  if (sec < 3600)  return `${Math.floor(sec/60)}м назад`;
  if (sec < 86400) return `${Math.floor(sec/3600)}ч назад`;
  return `${Math.floor(sec/86400)}д назад`;
}
void timeAgo;

/* ── API helper ── */
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

/* ══════════════════ SHARED COMPONENTS ══════════════════ */
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

function SectionCard({ children, color = "#1e3a8a" }: { children: React.ReactNode; color?: string }) {
  return <div style={{ background:"rgba(15,23,42,0.95)", border:`1px solid ${color}40`, borderRadius:16, padding:16, marginBottom:14 }}>{children}</div>;
}

function SectionTitle({ icon, label, color = "#60a5fa" }: { icon: string; label: string; color?: string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
      <span style={{ fontSize:18 }}>{icon}</span>
      <div style={{ fontSize:14, fontWeight:800, color }}>{label}</div>
    </div>
  );
}

function NumInput({ value, onChange, placeholder, min, max, step, style: s }: {
  value: string; onChange: (v: string)=>void; placeholder?: string; min?: number; max?: number; step?: number; style?: React.CSSProperties;
}) {
  return <input type="number" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} min={min} max={max} step={step}
    style={{ background:"rgba(30,45,69,0.7)", border:"1px solid rgba(30,58,143,0.4)", borderRadius:8, padding:"9px 12px", color:"#f1f5f9", fontFamily:"inherit", fontSize:13, outline:"none", ...s }} />;
}

/* ══════════════════ TAB NAV ══════════════════ */
const TABS = [
  { id:0, icon:"🎮", label:"Игра"     },
  { id:1, icon:"🏪", label:"Маркет"   },
  { id:2, icon:"🕹️", label:"Игры"     },
  { id:3, icon:"📋", label:"Задания"  },
  { id:4, icon:"👑", label:"Генерал"  },
  { id:5, icon:"🔍", label:"Игроки"   },
];

function TabNav({ active, onChange }: { active: number; onChange: (n: number)=>void }) {
  return (
    <div style={{ display:"flex", gap:4, marginBottom:16, overflowX:"auto", scrollbarWidth:"none", paddingBottom:2 }}>
      {TABS.map(t => (
        <button key={t.id} onClick={()=>onChange(t.id)} style={{
          flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", gap:2,
          padding:"8px 10px", borderRadius:12, border:"none", fontFamily:"inherit", cursor:"pointer",
          background: active===t.id ? "linear-gradient(135deg,#1d4ed8,#3b82f6)" : "rgba(30,45,69,0.6)",
          color: active===t.id ? "#fff" : "#475569",
          fontSize:9, fontWeight:800, letterSpacing:"0.04em",
          boxShadow: active===t.id ? "0 0 12px rgba(59,130,246,0.4)" : "none",
          transition:"all .15s",
        }}>
          <span style={{ fontSize:16 }}>{t.icon}</span>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ══════════════════ TAB 0: GAME CONFIG ══════════════════ */
const BOSS_DEFAULTS = [
  { level:1, name:"Shadow Pup",       hp:25000,  reviveTon:0.10, reviveAds:10   },
  { level:2, name:"Rage Dogg",        hp:50000,  reviveTon:0.25, reviveAds:25   },
  { level:3, name:"Inferno Dogg",     hp:100000, reviveTon:0.50, reviveAds:50   },
  { level:4, name:"Storm Dogg",       hp:250000, reviveTon:1.00, reviveAds:100  },
  { level:5, name:"Boss Dogg Prime",  hp:500000, reviveTon:2.50, reviveAds:null },
];

type BossRow = { hp: string; reviveTon: string; reviveAds: string };

function GameConfigTab({ adminId }: { adminId: string }) {
  const { toast, flash } = useToast();
  const [bosses, setBosses] = useState<BossRow[]>(
    BOSS_DEFAULTS.map(b => ({ hp: String(b.hp), reviveTon: String(b.reviveTon), reviveAds: b.reviveAds == null ? "" : String(b.reviveAds) }))
  );
  const [respawnHours, setRespawnHours] = useState("24");
  const [adBoostPct, setAdBoostPct]     = useState("20");
  const [tonPct1, setTonPct1]           = useState("50");
  const [tonPct2, setTonPct2]           = useState("100");
  const [loading, setLoading]           = useState(false);

  useEffect(() => {
    fetch("/api/mini/admin/settings/game-config")
      .then(r => r.json())
      .then(d => {
        setBosses(BOSS_DEFAULTS.map((def, i) => {
          const srv = d.bosses?.[i];
          return {
            hp:        srv?.hp        != null ? String(srv.hp)        : String(def.hp),
            reviveTon: srv?.reviveTon != null ? String(srv.reviveTon) : String(def.reviveTon),
            reviveAds: srv?.reviveAds != null ? String(srv.reviveAds) : (def.reviveAds == null ? "" : String(def.reviveAds)),
          };
        }));
        if (d.respawnHours) setRespawnHours(String(d.respawnHours));
        if (d.adBoostPct)   setAdBoostPct(String(d.adBoostPct));
        if (d.tonBoostPct1) setTonPct1(String(d.tonBoostPct1));
        if (d.tonBoostPct2) setTonPct2(String(d.tonBoostPct2));
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setLoading(true);
    try {
      const r = await apiCall("settings/game-config", {
        adminId, method:"POST",
        body: JSON.stringify({
          bosses: bosses.map(b => ({
            hp: parseFloat(b.hp) || null,
            reviveTon: parseFloat(b.reviveTon) || null,
            reviveAds: b.reviveAds === "" ? null : parseInt(b.reviveAds),
          })),
          respawnHours: parseFloat(respawnHours) || 24,
          adBoostPct:   parseInt(adBoostPct) || 20,
          tonBoostPct1: parseInt(tonPct1) || 50,
          tonBoostPct2: parseInt(tonPct2) || 100,
        }),
      });
      const d = await r.json();
      if (!r.ok) flash(d.error || "Ошибка", "error");
      else flash(d.message || "✅ Сохранено", "success");
    } catch { flash("Ошибка сети", "error"); }
    finally { setLoading(false); }
  };

  const setField = (i: number, field: keyof BossRow, val: string) =>
    setBosses(prev => prev.map((b, idx) => idx === i ? { ...b, [field]: val } : b));

  const inputStyle: React.CSSProperties = { flex:1, minWidth:0, background:"rgba(30,45,69,0.7)", border:"1px solid rgba(30,58,143,0.35)", borderRadius:8, padding:"7px 8px", color:"#f1f5f9", fontFamily:"inherit", fontSize:12, outline:"none" };

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Boss config */}
      <SectionCard color="#7c3aed">
        <SectionTitle icon="👹" label="Боссы" color="#a855f7" />
        <div style={{ display:"grid", gridTemplateColumns:"auto 1fr 1fr 1fr", gap:6, marginBottom:8, fontSize:9, color:"#475569", fontWeight:700, letterSpacing:"0.06em" }}>
          <span>BOSS</span><span>HP</span><span>TON ожив.</span><span>Реклам</span>
        </div>
        {BOSS_DEFAULTS.map((def, i) => (
          <div key={def.level} style={{ display:"grid", gridTemplateColumns:"auto 1fr 1fr 1fr", gap:6, marginBottom:8, alignItems:"center" }}>
            <div style={{ fontSize:11, fontWeight:800, color:"#c084fc", whiteSpace:"nowrap" }}>B{def.level}</div>
            <input type="number" value={bosses[i].hp}        onChange={e=>setField(i,"hp",e.target.value)}        placeholder={String(def.hp)}        style={inputStyle} />
            <input type="number" value={bosses[i].reviveTon} onChange={e=>setField(i,"reviveTon",e.target.value)} placeholder={String(def.reviveTon)} step="0.01" style={inputStyle} />
            <input type="number" value={bosses[i].reviveAds} onChange={e=>setField(i,"reviveAds",e.target.value)} placeholder={def.reviveAds==null?"TON only":String(def.reviveAds)} style={inputStyle} />
          </div>
        ))}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:8, paddingTop:8, borderTop:"1px solid rgba(124,58,237,0.2)" }}>
          <div style={{ fontSize:11, color:"#818cf8", fontWeight:700, flexShrink:0 }}>⏱ Возрождение (ч):</div>
          <input type="number" value={respawnHours} onChange={e=>setRespawnHours(e.target.value)} min={1} placeholder="24" style={{ ...inputStyle, flex:"0 0 70px" }} />
          <div style={{ fontSize:10, color:"#475569" }}>по умолчанию 24ч</div>
        </div>
      </SectionCard>

      {/* Boost config */}
      <SectionCard color="#059669">
        <SectionTitle icon="🚀" label="Бусты" color="#34d399" />
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {[
            { label:"📺 Реклама — бонус %", val:adBoostPct, set:setAdBoostPct, ph:"20" },
            { label:"💎 TON Boost I — бонус %", val:tonPct1, set:setTonPct1, ph:"50" },
            { label:"💎 TON Boost II — бонус %", val:tonPct2, set:setTonPct2, ph:"100" },
          ].map(({ label, val, set, ph }) => (
            <div key={label} style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ flex:1, fontSize:12, color:"#94a3b8" }}>{label}</div>
              <input type="number" value={val} onChange={e=>set(e.target.value)} placeholder={ph} min={0} max={500}
                style={{ width:70, background:"rgba(30,45,69,0.7)", border:"1px solid rgba(5,150,105,0.35)", borderRadius:8, padding:"8px 10px", color:"#f1f5f9", fontFamily:"inherit", fontSize:13, outline:"none", textAlign:"center" }} />
              <div style={{ fontSize:12, color:"#475569" }}>%</div>
            </div>
          ))}
        </div>
      </SectionCard>

      <button onClick={save} disabled={loading} style={{ width:"100%", padding:"14px 0", borderRadius:12, border:"none", background:"linear-gradient(135deg,#1d4ed8,#3b82f6)", color:"#fff", fontFamily:"inherit", fontSize:14, fontWeight:800, cursor:"pointer", opacity:loading?0.7:1 }}>
        {loading ? "⏳ Сохранение…" : "💾 Сохранить настройки игры"}
      </button>
      <div style={{ fontSize:10, color:"#334155", textAlign:"center", marginTop:8 }}>
        Изменения применятся при следующем запуске приложения игроками
      </div>
    </div>
  );
}

/* ══════════════════ TAB 1: MARKET ══════════════════ */
function MarketTab({ adminId, stats, isSuperAdmin, onRefresh, activating, onMarketAction }: {
  adminId: string; stats: Stats | null; isSuperAdmin: boolean;
  onRefresh: ()=>void; activating: boolean; onMarketAction: (a:"activate"|"deactivate"|"force-activate")=>void;
}) {
  const { toast, flash } = useToast();
  const [depth, setDepth]         = useState("1");
  const [feePct, setFeePct]       = useState("0");
  const [profitStart, setProfitStart] = useState("1.4");
  const [profitBase, setProfitBase]   = useState("1.7");
  const [profitPro, setProfitPro]     = useState("2");
  const [profitElite, setProfitElite] = useState("2.5");
  const [maxStart, setMaxStart]   = useState("3");
  const [maxPro, setMaxPro]       = useState("3");
  const [maxElite, setMaxElite]   = useState("3");
  const [loading, setLoading]     = useState(false);
  // Admin order form
  const [orderTier, setOrderTier]   = useState("start");
  const [orderAmt, setOrderAmt]     = useState("");
  const [orderPrice, setOrderPrice] = useState("");
  const [orderSeller, setOrderSeller] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/mini/admin/settings/queue-depth?adminId=${adminId}`).then(r=>r.json()),
      fetch(`/api/mini/admin/settings/market-config?adminId=${adminId}`).then(r=>r.json()),
    ]).then(([q, m]) => {
      if (q.depth)     setDepth(String(q.depth));
      if (m.feePct    != null) setFeePct(String(m.feePct));
      if (m.profitPctStart != null) setProfitStart(String(m.profitPctStart));
      if (m.profitPctBase  != null) setProfitBase(String(m.profitPctBase));
      if (m.profitPctPro   != null) setProfitPro(String(m.profitPctPro));
      if (m.profitPctElite != null) setProfitElite(String(m.profitPctElite));
      if (m.maxOrdersStart) setMaxStart(String(m.maxOrdersStart));
      if (m.maxOrdersPro)   setMaxPro(String(m.maxOrdersPro));
      if (m.maxOrdersElite) setMaxElite(String(m.maxOrdersElite));
    }).catch(()=>{});
  }, [adminId]);

  const saveMarket = async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        apiCall("settings/queue-depth", { adminId, method:"POST", body:JSON.stringify({ depth:parseInt(depth)||1 }) }),
        apiCall("settings/market-config", { adminId, method:"POST", body:JSON.stringify({
          feePct: parseFloat(feePct)||0,
          profitPctStart: parseFloat(profitStart)||0, profitPctBase: parseFloat(profitBase)||0,
          profitPctPro: parseFloat(profitPro)||0, profitPctElite: parseFloat(profitElite)||0,
          maxOrdersStart:parseInt(maxStart)||3, maxOrdersPro:parseInt(maxPro)||3, maxOrdersElite:parseInt(maxElite)||3,
        }) }),
      ]);
      if (!r1.ok || !r2.ok) flash("Ошибка сохранения", "error");
      else flash("✅ Настройки маркета сохранены", "success");
    } catch { flash("Ошибка сети","error"); }
    finally { setLoading(false); }
  };

  const createAdminOrder = async () => {
    if (!orderAmt || !orderPrice) { flash("Введите сумму и цену","error"); return; }
    setLoading(true);
    try {
      const r = await apiCall("market/admin-order", { adminId, method:"POST", body:JSON.stringify({
        sellerId: orderSeller || "0",
        tier: orderTier, amount:parseInt(orderAmt), priceTon:parseFloat(orderPrice),
      }) });
      const d = await r.json();
      if (!r.ok) flash(d.error||"Ошибка","error");
      else { flash(d.message||"✅ Ордер создан","success"); setOrderAmt(""); setOrderPrice(""); onRefresh(); }
    } catch { flash("Ошибка сети","error"); }
    finally { setLoading(false); }
  };

  const poolPct = Math.min(100, ((stats?.totalCoinsSold??0)/1_000_000)*100);
  const inp: React.CSSProperties = { background:"rgba(30,45,69,0.7)", border:"1px solid rgba(30,58,143,0.35)", borderRadius:8, padding:"8px 10px", color:"#f1f5f9", fontFamily:"inherit", fontSize:12, outline:"none" };

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Pool */}
      {stats && (
        <SectionCard>
          <SectionTitle icon="🏊" label="TONYX Пул" color="#a78bfa" />
          <div style={{ height:8, borderRadius:4, background:"rgba(30,45,69,0.8)", marginBottom:8, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${poolPct}%`, background:"linear-gradient(90deg,#1d4ed8,#a78bfa)", borderRadius:4 }} />
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#334155", marginBottom:12 }}>
            <span>{Number(stats.totalCoinsSold).toLocaleString()} / 1 000 000 TONYX</span>
            <span style={{ color:stats.isMarketActive?"#4ade80":"#fbbf24", fontWeight:700 }}>{stats.isMarketActive?"✅ P2P ОТКРЫТ":`${stats.poolProgress}%`}</span>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {!stats.isMarketActive && stats.canActivate && (
              <button onClick={()=>onMarketAction("activate")} disabled={activating} style={{ flex:1, padding:"10px 0", borderRadius:10, border:"none", fontFamily:"inherit", background:"linear-gradient(135deg,#15803d,#16a34a)", color:"#fff", fontSize:12, fontWeight:800, cursor:"pointer" }}>
                ✅ Активировать P2P
              </button>
            )}
            {isSuperAdmin && (
              <button onClick={()=>onMarketAction(stats.isMarketActive?"deactivate":"force-activate")} disabled={activating} style={{ flex:1, padding:"10px 0", borderRadius:10, border:"none", fontFamily:"inherit", background:stats.isMarketActive?"rgba(220,38,38,0.12)":"rgba(30,58,143,0.3)", color:stats.isMarketActive?"#f87171":"#60a5fa", fontSize:12, fontWeight:800, cursor:"pointer" }}>
                {activating?"...":(stats.isMarketActive?"🔒 Деактивировать":"⚡ Форс-активация")}
              </button>
            )}
          </div>
        </SectionCard>
      )}

      {/* Market settings */}
      <SectionCard color="#0369a1">
        <SectionTitle icon="⚙️" label="Настройки маркета" color="#38bdf8" />
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
          {[
            { label:"Комиссия %",         val:feePct,     set:setFeePct     },
            { label:"Доходность START %", val:profitStart,set:setProfitStart},
            { label:"Доходность BASE %",  val:profitBase, set:setProfitBase },
            { label:"Доходность PRO %",   val:profitPro,  set:setProfitPro  },
            { label:"Доходность ELITE %", val:profitElite,set:setProfitElite},
            { label:"Лимит START/д",      val:maxStart,   set:setMaxStart   },
            { label:"Лимит PRO/д",        val:maxPro,     set:setMaxPro     },
            { label:"Лимит ELITE/д",      val:maxElite,   set:setMaxElite   },
            { label:"Очередь выкупа",     val:depth,      set:setDepth      },
          ].map(({ label, val, set }) => (
            <div key={label}>
              <div style={{ fontSize:9, color:"#475569", fontWeight:700, marginBottom:4 }}>{label.toUpperCase()}</div>
              <input type="number" value={val} onChange={e=>set(e.target.value)} style={{ ...inp, width:"100%", boxSizing:"border-box" }} />
            </div>
          ))}
        </div>
        <button onClick={saveMarket} disabled={loading} style={{ width:"100%", padding:"12px 0", borderRadius:10, border:"none", fontFamily:"inherit", background:"linear-gradient(135deg,#0369a1,#0ea5e9)", color:"#fff", fontSize:13, fontWeight:800, cursor:"pointer" }}>
          {loading?"⏳...":"💾 Сохранить"}
        </button>
      </SectionCard>

      {/* Admin order */}
      {isSuperAdmin && (
        <SectionCard color="#7c3aed">
          <SectionTitle icon="📦" label="Создать ордер вручную" color="#c084fc" />
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <select value={orderTier} onChange={e=>setOrderTier(e.target.value)} style={{ ...inp, width:"100%", boxSizing:"border-box" }}>
              <option value="start">START</option>
              <option value="pro">PRO</option>
              <option value="elite">ELITE</option>
            </select>
            <div style={{ display:"flex", gap:8 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:9, color:"#475569", fontWeight:700, marginBottom:3 }}>TONYX (кол-во)</div>
                <input type="number" value={orderAmt} onChange={e=>setOrderAmt(e.target.value)} placeholder="1000" style={{ ...inp, width:"100%", boxSizing:"border-box" }} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:9, color:"#475569", fontWeight:700, marginBottom:3 }}>Цена TON</div>
                <input type="number" value={orderPrice} onChange={e=>setOrderPrice(e.target.value)} placeholder="0.05" step="0.001" style={{ ...inp, width:"100%", boxSizing:"border-box" }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize:9, color:"#475569", fontWeight:700, marginBottom:3 }}>Seller ID (опционально)</div>
              <input type="text" value={orderSeller} onChange={e=>setOrderSeller(e.target.value)} placeholder="Telegram ID продавца" style={{ ...inp, width:"100%", boxSizing:"border-box" }} />
            </div>
            <button onClick={createAdminOrder} disabled={loading} style={{ padding:"12px 0", borderRadius:10, border:"none", fontFamily:"inherit", background:"linear-gradient(135deg,#6d28d9,#7c3aed)", color:"#fff", fontSize:13, fontWeight:800, cursor:"pointer" }}>
              {loading?"⏳...":"📦 Создать ордер"}
            </button>
          </div>
        </SectionCard>
      )}

      <TopupsSection adminId={adminId} />
      <WithdrawalsSection adminId={adminId} />
    </div>
  );
}

/* ══════════════════ TAB 2: GAMES ══════════════════ */
const GAMES_META = [
  { id:"spin",  label:"Колесо фортуны", icon:"🎡", desc:"Spin — дать шанс выиграть TON или монеты" },
  { id:"mines", label:"Мины",           icon:"💣", desc:"Mines — классическая игра на удачу" },
  { id:"arena", label:"Арена",          icon:"⚔️", desc:"Arena — PvP батлы между игроками" },
  { id:"igro",  label:"Игромания",      icon:"🃏", desc:"Igro — карточная игра" },
];

function GamesTab({ adminId }: { adminId: string }) {
  const { toast, flash } = useToast();
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ spin:true, mines:true, arena:true, igro:true });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/mini/admin/settings/games-enabled")
      .then(r=>r.json()).then(d=>setEnabled(d)).catch(()=>{});
  }, []);

  const toggle = async (id: string) => {
    const newVal = !enabled[id];
    const next = { ...enabled, [id]: newVal };
    setEnabled(next);
    setLoading(true);
    try {
      const r = await apiCall("settings/games-enabled", { adminId, method:"POST", body:JSON.stringify({ [id]:newVal }) });
      const d = await r.json();
      if (!r.ok) { flash(d.error||"Ошибка","error"); setEnabled(enabled); }
      else flash(`${newVal?"✅":"⏸"} ${GAMES_META.find(g=>g.id===id)?.label} ${newVal?"включена":"отключена"}`, "success");
    } catch { flash("Ошибка сети","error"); setEnabled(enabled); }
    finally { setLoading(false); }
  };

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <SectionCard>
        <SectionTitle icon="🕹️" label="Управление играми" color="#f59e0b" />
        <div style={{ fontSize:11, color:"#475569", marginBottom:14 }}>
          Отключённые игры показывают игрокам надпись «Игра временно недоступна»
        </div>
        {GAMES_META.map(g => (
          <div key={g.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:enabled[g.id]?"rgba(30,45,69,0.5)":"rgba(15,23,42,0.4)", border:`1px solid ${enabled[g.id]?"rgba(30,58,143,0.25)":"rgba(100,116,139,0.15)"}`, borderRadius:12, padding:"12px 14px", marginBottom:10, opacity:loading?0.7:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize:24, filter:enabled[g.id]?"none":"grayscale(1)", transition:"filter .3s" }}>{g.icon}</span>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:enabled[g.id]?"#f1f5f9":"#475569" }}>{g.label}</div>
                <div style={{ fontSize:10, color:"#334155", marginTop:2 }}>{g.desc}</div>
              </div>
            </div>
            <button onClick={()=>toggle(g.id)} disabled={loading} style={{ flexShrink:0, padding:"8px 16px", borderRadius:10, border:"none", fontFamily:"inherit", background:enabled[g.id]?"linear-gradient(135deg,#15803d,#22c55e)":"rgba(100,116,139,0.2)", color:enabled[g.id]?"#fff":"#475569", fontSize:12, fontWeight:800, cursor:loading?"not-allowed":"pointer", transition:"all .2s" }}>
              {enabled[g.id] ? "ВКЛ ✅" : "ВЫКЛ ⏸"}
            </button>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

/* ══════════════════ TAB 3: TASKS ══════════════════ */
function AdConfigSection({ adminId }: { adminId: string }) {
  const { toast, flash } = useToast();
  const [rewardTon, setRewardTon]     = useState("0.0001");
  const [rewardTonyx, setRewardTonyx] = useState("0");
  const [dailyLimit, setDailyLimit]   = useState("100");
  const [resetHours, setResetHours]   = useState("24");
  const [loading, setLoading]         = useState(false);

  useEffect(() => {
    apiCall("settings/ad-config", { adminId }).then(r=>r.json()).then(d=>{
      if (d.rewardTon   != null) setRewardTon(String(d.rewardTon));
      if (d.rewardTonyx != null) setRewardTonyx(String(d.rewardTonyx));
      if (d.dailyLimit)          setDailyLimit(String(d.dailyLimit));
      if (d.resetHours)          setResetHours(String(d.resetHours));
    }).catch(()=>{});
  }, [adminId]);

  const save = async () => {
    setLoading(true);
    try {
      const r = await apiCall("settings/ad-config", { adminId, method:"POST", body:JSON.stringify({
        rewardTon: parseFloat(rewardTon)||0, rewardTonyx: parseFloat(rewardTonyx)||0,
        dailyLimit: parseInt(dailyLimit)||100, resetHours: parseFloat(resetHours)||24,
      }) });
      const d = await r.json();
      if (!r.ok) flash(d.error||"Ошибка","error");
      else flash(d.message||"✅ Сохранено","success");
    } catch { flash("Ошибка сети","error"); }
    finally { setLoading(false); }
  };

  return (
    <SectionCard color="#d97706">
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <SectionTitle icon="📺" label="Настройки рекламы" color="#fbbf24" />
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
        <div>
          <div style={{ fontSize:9, color:"#475569", fontWeight:700, marginBottom:4 }}>НАГРАДА (TON)</div>
          <NumInput value={rewardTon} onChange={setRewardTon} placeholder="0.0001" min={0} step={0.0001} style={{ width:"100%", boxSizing:"border-box" as const }} />
        </div>
        <div>
          <div style={{ fontSize:9, color:"#475569", fontWeight:700, marginBottom:4 }}>НАГРАДА (TONYX)</div>
          <NumInput value={rewardTonyx} onChange={setRewardTonyx} placeholder="0" min={0} style={{ width:"100%", boxSizing:"border-box" as const }} />
        </div>
        <div>
          <div style={{ fontSize:9, color:"#475569", fontWeight:700, marginBottom:4 }}>ПРОСМОТРОВ ДО СБРОСА</div>
          <NumInput value={dailyLimit} onChange={setDailyLimit} placeholder="100" min={1} style={{ width:"100%", boxSizing:"border-box" as const }} />
        </div>
        <div>
          <div style={{ fontSize:9, color:"#475569", fontWeight:700, marginBottom:4 }}>СБРОС ЧЕРЕЗ (ЧАСОВ)</div>
          <NumInput value={resetHours} onChange={setResetHours} placeholder="24" min={0.1} step={0.5} style={{ width:"100%", boxSizing:"border-box" as const }} />
        </div>
      </div>
      <div style={{ fontSize:10, color:"#64748b", marginBottom:12, lineHeight:1.5 }}>
        Пример: 10 просмотров, сброс через 2ч → игрок смотрит 10 роликов, затем ждёт 2 часа и может снова. Награда 0 в TON или TONYX означает, что эта валюта не выдаётся.
      </div>
      <button onClick={save} disabled={loading} style={{ width:"100%", padding:"11px 0", borderRadius:10, border:"none", fontFamily:"inherit", background:"linear-gradient(135deg,#b45309,#d97706)", color:"#fff", fontSize:13, fontWeight:800, cursor:"pointer" }}>
        {loading?"⏳...":"💾 Сохранить"}
      </button>
    </SectionCard>
  );
}

function TasksTab({ adminId, isSuperAdmin }: { adminId: string; isSuperAdmin: boolean }) {
  const { toast, flash } = useToast();
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title:"", description:"", type:"visit", link:"", reward:"", rewardTon:"", maxCompletions:"" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiCall("tasks-list", { adminId });
      const d = await r.json();
      setTasks(d.tasks ?? []);
    } catch { flash("Ошибка загрузки","error"); }
    finally { setLoading(false); }
  }, [adminId, flash]);

  useEffect(() => { load(); }, [load]);

  const createTask = async () => {
    if (!form.title.trim()) { flash("Введите название","error"); return; }
    setLoading(true);
    try {
      const r = await apiCall("tasks-create", { adminId, method:"POST", body:JSON.stringify({
        title:form.title.trim(), description:form.description.trim()||null,
        type:form.type, link:form.link.trim()||null,
        reward:parseInt(form.reward)||0, rewardTon:parseFloat(form.rewardTon)||null,
        maxCompletions:parseInt(form.maxCompletions)||null,
      }) });
      const d = await r.json();
      if (!r.ok) flash(d.error||"Ошибка","error");
      else { flash("✅ Задание создано","success"); setForm({ title:"",description:"",type:"visit",link:"",reward:"",rewardTon:"",maxCompletions:"" }); setShowForm(false); load(); }
    } catch { flash("Ошибка сети","error"); }
    finally { setLoading(false); }
  };

  const toggle = async (id: number, active: boolean) => {
    const r = await apiCall(`tasks/${id}/toggle`, { adminId, method:"POST", body:JSON.stringify({ active }) });
    const d = await r.json();
    if (!r.ok) flash(d.error||"Ошибка","error");
    else { flash(d.message||"✅","success"); load(); }
  };

  const del = async (id: number) => {
    const r = await apiCall(`tasks/${id}`, { adminId, method:"DELETE" });
    const d = await r.json();
    if (!r.ok) flash(d.error||"Ошибка","error");
    else { flash("🗑 Удалено","success"); load(); }
  };

  const inp: React.CSSProperties = { background:"rgba(15,23,42,0.8)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:8, padding:"9px 12px", color:"#f1f5f9", fontFamily:"inherit", fontSize:12, outline:"none", width:"100%", boxSizing:"border-box" };

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <AdConfigSection adminId={adminId} />
      <SectionCard color="#4338ca">
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <SectionTitle icon="📋" label="Задания" color="#c7d2fe" />
          <button onClick={()=>setShowForm(v=>!v)} style={{ padding:"6px 12px", borderRadius:8, border:"none", background:"rgba(99,102,241,0.2)", color:"#a5b4fc", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            {showForm?"✕ Закрыть":"+ Добавить"}
          </button>
        </div>

        {showForm && (
          <div style={{ background:"rgba(30,45,69,0.5)", borderRadius:12, padding:14, marginBottom:14, display:"flex", flexDirection:"column", gap:8 }}>
            <div style={{ fontSize:10, color:"#818cf8", fontWeight:800, letterSpacing:"0.08em", marginBottom:4 }}>НОВОЕ ЗАДАНИЕ</div>
            {(["title","description","link","reward","rewardTon","maxCompletions"] as const).map(k => (
              <input key={k} type={["reward","rewardTon","maxCompletions"].includes(k)?"number":"text"}
                value={(form as Record<string, string>)[k]}
                onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                placeholder={{ title:"Название*", description:"Описание", link:"Ссылка (URL / Telegram)", reward:"Награда TONYX", rewardTon:"Награда TON (0.05)", maxCompletions:"Макс. выполнений (пусто=∞)" }[k]}
                style={inp} />
            ))}
            <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={{ ...inp }}>
              <option value="visit">visit — перейти по ссылке</option>
              <option value="subscribe">subscribe — подписаться на канал</option>
              <option value="bot">bot — перейти в бота</option>
              <option value="achievement">achievement — достижение в игре</option>
              <option value="external">external — внешнее действие</option>
            </select>
            <button onClick={createTask} disabled={loading} style={{ padding:"11px 0", borderRadius:10, border:"none", background:"linear-gradient(135deg,#4338ca,#6366f1)", color:"#fff", fontFamily:"inherit", fontSize:13, fontWeight:800, cursor:"pointer" }}>
              {loading?"Создание…":"✅ Создать задание"}
            </button>
          </div>
        )}

        {loading && tasks.length===0 ? (
          <div style={{ textAlign:"center", color:"#475569", padding:"16px 0", fontSize:12 }}>⏳ Загрузка…</div>
        ) : tasks.length===0 ? (
          <div style={{ textAlign:"center", color:"#475569", padding:"16px 0", fontSize:12 }}>Нет заданий</div>
        ) : (
          tasks.map(t => (
            <div key={t.id} style={{ background:t.isActive?"rgba(30,45,69,0.5)":"rgba(15,23,42,0.4)", border:`1px solid ${t.isActive?"rgba(99,102,241,0.2)":"rgba(30,58,143,0.1)"}`, borderRadius:12, padding:"10px 12px", marginBottom:8 }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:t.isActive?"#e2e8f0":"#475569", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.title}</div>
                  <div style={{ display:"flex", gap:5, marginTop:4, flexWrap:"wrap" }}>
                    {t.reward>0 && <span style={{ fontSize:10, fontWeight:700, color:"#60a5fa", background:"rgba(37,99,235,0.12)", borderRadius:5, padding:"1px 5px" }}>+{t.reward.toLocaleString()} TONYX</span>}
                    {!!t.rewardTon && <span style={{ fontSize:10, fontWeight:700, color:"#fbbf24", background:"rgba(251,191,36,0.12)", borderRadius:5, padding:"1px 5px" }}>+{t.rewardTon} TON</span>}
                    {t.maxCompletions && <span style={{ fontSize:10, color:"#94a3b8", background:"rgba(30,45,69,0.5)", borderRadius:5, padding:"1px 5px" }}>{t.currentCompletions}/{t.maxCompletions}</span>}
                    <span style={{ fontSize:10, color:"#334155", background:"rgba(30,45,69,0.3)", borderRadius:5, padding:"1px 5px" }}>{t.type}</span>
                  </div>
                </div>
                <div style={{ display:"flex", gap:5, flexShrink:0 }}>
                  <button onClick={()=>toggle(t.id,!t.isActive)} style={{ padding:"5px 8px", borderRadius:7, border:"none", background:t.isActive?"rgba(234,179,8,0.12)":"rgba(22,163,74,0.12)", color:t.isActive?"#fbbf24":"#4ade80", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>{t.isActive?"⏸":"▶"}</button>
                  {isSuperAdmin && <button onClick={()=>del(t.id)} style={{ padding:"5px 8px", borderRadius:7, border:"none", background:"rgba(220,38,38,0.08)", color:"#f87171", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>🗑</button>}
                </div>
              </div>
            </div>
          ))
        )}
      </SectionCard>
    </div>
  );
}

/* ══════════════════ TAB 4: GENERAL (USERS) ══════════════════ */
function BalanceAdjuster({ userId, adminId, onDone }: { userId: string; adminId: string; onDone: ()=>void }) {
  const { toast, flash } = useToast();
  const [currency, setCurrency] = useState<Currency>("ton");
  const [action, setAction]     = useState<Action>("add");
  const [amount, setAmount]     = useState("");
  const [loading, setLoading]   = useState(false);

  const submit = async () => {
    const num = parseFloat(amount);
    if (!num||num<=0) { flash("Введите сумму > 0","error"); return; }
    setLoading(true);
    try {
      const r = await apiCall(`users/${userId}/adjust-balance`, { adminId, method:"POST", body:JSON.stringify({ currency, amount:num, action }) });
      const d = await r.json();
      if (!r.ok) flash(d.error||"Ошибка","error");
      else { flash(`✅ ${action==="add"?"Начислено":"Списано"}: ${num} ${currency.toUpperCase()}`, "success"); setAmount(""); onDone(); }
    } catch { flash("Ошибка сети","error"); }
    finally { setLoading(false); }
  };

  const CURRENCIES = [{ key:"ton" as Currency, label:"TON", color:"#fbbf24" }, { key:"tonyx" as Currency, label:"TONYX", color:"#a78bfa" }, { key:"points" as Currency, label:"Points", color:"#60a5fa" }];
  return (
    <div style={{ background:"rgba(15,23,42,0.8)", border:"1px solid rgba(30,58,143,0.3)", borderRadius:12, padding:14, marginTop:10 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ fontSize:10, color:"#475569", fontWeight:700, marginBottom:10, letterSpacing:"0.1em" }}>УПРАВЛЕНИЕ БАЛАНСОМ</div>
      <div style={{ display:"flex", gap:5, marginBottom:8 }}>
        {CURRENCIES.map(({ key, label, color }) => (
          <button key={key} onClick={()=>setCurrency(key)} style={{ flex:1, padding:"8px 0", borderRadius:8, border:`1px solid ${currency===key?color:color+"30"}`, background:currency===key?color+"20":"transparent", color:currency===key?color:"#475569", fontFamily:"inherit", fontSize:12, fontWeight:700, cursor:"pointer" }}>{label}</button>
        ))}
      </div>
      <div style={{ display:"flex", background:"rgba(30,45,69,0.6)", borderRadius:10, padding:3, gap:3, marginBottom:8 }}>
        {(["add","deduct"] as const).map(a => (
          <button key={a} onClick={()=>setAction(a)} style={{ flex:1, padding:"9px 0", borderRadius:8, border:"none", fontFamily:"inherit", background:action===a?(a==="add"?"linear-gradient(135deg,#15803d,#16a34a)":"linear-gradient(135deg,#b91c1c,#dc2626)"):"transparent", color:action===a?"#fff":"#475569", fontSize:12, fontWeight:800, cursor:"pointer" }}>
            {a==="add"?"✅ Начислить":"➖ Списать"}
          </button>
        ))}
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <input value={amount} onChange={e=>setAmount(e.target.value)} type="number" step="any" placeholder="Сумма" style={{ flex:1, background:"rgba(30,45,69,0.7)", border:"1px solid rgba(30,58,143,0.4)", borderRadius:8, padding:"10px 12px", color:"#f1f5f9", fontFamily:"inherit", fontSize:13, outline:"none" }} />
        <button onClick={submit} disabled={loading} style={{ padding:"10px 18px", borderRadius:8, border:"none", background:action==="add"?"linear-gradient(135deg,#15803d,#16a34a)":"linear-gradient(135deg,#b91c1c,#dc2626)", color:"#fff", fontFamily:"inherit", fontSize:13, fontWeight:700, cursor:"pointer" }}>
          {loading?"...":action==="add"?"+":"−"}
        </button>
      </div>
    </div>
  );
}

function WinRateRow({ telegramId, adminId, current, onDone }: { telegramId: string; adminId: string; current: number | null; onDone: ()=>void }) {
  const { toast, flash } = useToast();
  const [val, setVal]   = useState(current!=null?String(current):"");
  const [loading, setLoading] = useState(false);

  const save = async () => {
    setLoading(true);
    try {
      const r = await apiCall(`users/${telegramId}/win-rate`, { adminId, method:"POST", body:JSON.stringify({ modifier:val===""?null:Number(val) }) });
      const d = await r.json();
      if (!r.ok) flash(d.error||"Ошибка","error");
      else { flash(d.message||"✅ Сохранено","success"); onDone(); }
    } catch { flash("Ошибка сети","error"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ background:"rgba(99,102,241,0.06)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:10, padding:"10px 12px" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ fontSize:10, color:"#818cf8", fontWeight:800, letterSpacing:"0.08em", marginBottom:6 }}>
        ⚙️ WIN RATE {current!=null?<span style={{ color:"#c7d2fe" }}>({current}%)</span>:<span style={{ color:"#334155" }}>(честная игра)</span>}
      </div>
      <div style={{ display:"flex", gap:6 }}>
        <input type="number" min={0} max={100} value={val} onChange={e=>setVal(e.target.value)} placeholder="0–100 или пусто"
          style={{ flex:1, background:"rgba(30,45,69,0.7)", border:"1px solid rgba(99,102,241,0.3)", borderRadius:8, padding:"8px 10px", color:"#f1f5f9", fontFamily:"inherit", fontSize:12, outline:"none" }} />
        <button onClick={save} disabled={loading} style={{ padding:"8px 14px", borderRadius:8, border:"none", background:"rgba(99,102,241,0.3)", color:"#c7d2fe", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
          {loading?"…":"Применить"}
        </button>
      </div>
      <div style={{ fontSize:9, color:"#334155", marginTop:4 }}>0%=всегда проигрыш · 100%=всегда выигрыш · пусто=честная игра</div>
    </div>
  );
}

function ModerationRow({ telegramId, adminId, status, bannedReason, onDone }: {
  telegramId: string; adminId: string; status: string; bannedReason: string | null; onDone: ()=>void;
}) {
  const { toast, flash } = useToast();
  const [loading, setLoading]         = useState(false);
  const [banReason, setBanReason]     = useState("");
  const [showBanInput, setShowBanInput] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const post = async (action: string, body?: object) => {
    setLoading(true);
    try {
      const r = await apiCall(`users/${telegramId}/${action}`, { adminId, method:"POST", body:body?JSON.stringify(body):undefined });
      const d = await r.json();
      if (!r.ok) flash(d.error||"Ошибка","error");
      else { flash(d.message||"✅ Готово","success"); onDone(); }
    } catch { flash("Ошибка сети","error"); }
    finally { setLoading(false); }
  };

  const btnStyle = (col: string, bg: string): React.CSSProperties => ({ padding:"9px 0", borderRadius:8, border:"none", background:bg, color:col, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", width:"100%" });

  return (
    <div style={{ background:"rgba(30,45,69,0.4)", border:"1px solid rgba(30,58,143,0.2)", borderRadius:10, padding:"10px 12px", display:"flex", flexDirection:"column", gap:7 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ fontSize:10, color:"#475569", fontWeight:800, letterSpacing:"0.08em" }}>
        🛡 МОДЕРАЦИЯ — <span style={{ color:status==="banned"?"#f87171":status==="soft_deleted"?"#fbbf24":"#4ade80" }}>{status}</span>
        {bannedReason && <span style={{ color:"#64748b", fontWeight:500 }}> · {bannedReason}</span>}
      </div>
      {status!=="banned" && (showBanInput ? (
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          <input value={banReason} onChange={e=>setBanReason(e.target.value)} placeholder="Причина бана…" style={{ background:"rgba(30,45,69,0.7)", border:"1px solid rgba(220,38,38,0.4)", borderRadius:8, padding:"8px 10px", color:"#f1f5f9", fontFamily:"inherit", fontSize:12, outline:"none" }} />
          <div style={{ display:"flex", gap:6 }}>
            <button onClick={()=>{ post("ban",{ reason:banReason }); setShowBanInput(false); }} disabled={loading} style={{ ...btnStyle("#f87171","rgba(220,38,38,0.2)"), flex:1 }}>🔴 Подтвердить бан</button>
            <button onClick={()=>setShowBanInput(false)} style={{ ...btnStyle("#94a3b8","rgba(30,45,69,0.5)"), flex:"0 0 80px" }}>Отмена</button>
          </div>
        </div>
      ) : <button onClick={()=>setShowBanInput(true)} disabled={loading} style={btnStyle("#f87171","rgba(220,38,38,0.1)")}>🔴 Заблокировать (ban)</button>)}
      {status==="banned" && <button onClick={()=>post("unban")} disabled={loading} style={btnStyle("#4ade80","rgba(22,163,74,0.12)")}>✅ Разблокировать</button>}
      {status!=="soft_deleted" && <button onClick={()=>post("soft-delete")} disabled={loading} style={btnStyle("#fbbf24","rgba(234,179,8,0.08)")}>🗑 Мягкое удаление</button>}
      {status==="soft_deleted" && <button onClick={()=>post("restore")} disabled={loading} style={btnStyle("#4ade80","rgba(22,163,74,0.08)")}>♻️ Восстановить</button>}
      <button onClick={()=>{ if(!confirmReset){ setConfirmReset(true); setTimeout(()=>setConfirmReset(false),5000); return; } post("reset"); setConfirmReset(false); }} disabled={loading}
        style={{ ...btnStyle(confirmReset?"#fca5a5":"#64748b",confirmReset?"rgba(220,38,38,0.15)":"transparent"), border:`1px solid ${confirmReset?"rgba(239,68,68,0.5)":"rgba(30,58,143,0.2)"}` }}>
        {confirmReset?"⚠️ ЕЩЁ РАЗ для сброса":"🔄 Сбросить данные аккаунта"}
      </button>
    </div>
  );
}

function UserCard({ user, adminId, isSuperAdmin, onRefresh }: { user: UserInfo; adminId: string; isSuperAdmin: boolean; onRefresh: ()=>void }) {
  const { toast, flash } = useToast();
  const [expanded, setExpanded]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const callApi = async (path: string, body: Record<string, unknown> = {}) => {
    setLoading(true);
    try {
      const r = await apiCall(path, { adminId, method:"POST", body:JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) flash(d.error||"Ошибка","error");
      else { flash(d.message||"Готово","success"); onRefresh(); }
    } catch { flash("Ошибка сети","error"); }
    finally { setLoading(false); }
  };

  const name       = user.firstName ?? user.username ?? user.telegramId ?? "?";
  const isOwnerUser = user.telegramId === OWNER_ID;
  const hasTwins   = (user.twinCount ?? 0) > 0;

  return (
    <div style={{ background:"rgba(15,23,42,0.95)", border:`1px solid ${hasTwins?"rgba(251,191,36,0.35)":"rgba(30,58,143,0.25)"}`, borderRadius:16, padding:14, marginBottom:10 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }} onClick={()=>setExpanded(!expanded)}>
        <div style={{ width:44, height:44, borderRadius:"50%", background:isOwnerUser?"linear-gradient(135deg,#92400e,#b45309)":"#1d4ed8", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:800, color:"#fff", flexShrink:0, position:"relative" }}>
          {name.slice(0,1).toUpperCase()}
          {user.isOnline && <div style={{ position:"absolute", bottom:1, right:1, width:10, height:10, borderRadius:"50%", background:"#22c55e", border:"2px solid #0f172a" }} />}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
            <span style={{ fontSize:13, fontWeight:700, color:"#f1f5f9" }}>{name}</span>
            {user.username && <span style={{ fontSize:11, color:"#475569" }}>@{user.username}</span>}
            {isOwnerUser && <span style={{ fontSize:9, background:"rgba(251,191,36,0.2)", color:"#fbbf24", padding:"2px 6px", borderRadius:6, fontWeight:700 }}>👑 OWNER</span>}
            {user.isOnline ? <span style={{ fontSize:9, background:"rgba(22,163,74,0.2)", color:"#4ade80", padding:"2px 6px", borderRadius:6, fontWeight:700 }}>В СЕТИ</span>
              : <span style={{ fontSize:9, background:"rgba(30,45,69,0.5)", color:"#475569", padding:"2px 6px", borderRadius:6 }}>ОФЛАЙН</span>}
            {user.isAdmin && !isOwnerUser && <span style={{ fontSize:9, background:"rgba(251,191,36,0.15)", color:"#fbbf24", padding:"2px 6px", borderRadius:6, fontWeight:700 }}>АДМИН</span>}
            {user.isBlocked && <span style={{ fontSize:9, background:"rgba(220,38,38,0.15)", color:"#f87171", padding:"2px 6px", borderRadius:6, fontWeight:700 }}>ЗАБЛОК</span>}
            {user.forceWin && <span style={{ fontSize:9, background:"rgba(250,204,21,0.2)", color:"#facc15", padding:"2px 6px", borderRadius:6, fontWeight:700 }}>⚡ БОГ</span>}
            {hasTwins && <span style={{ fontSize:9, background:"rgba(251,191,36,0.15)", color:"#fbbf24", padding:"2px 6px", borderRadius:6, fontWeight:700 }}>{user.isMainAccount?"ГЛАВНЫЙ":"ТВИНК"}×{user.twinCount}</span>}
          </div>
          <div style={{ fontSize:10, color:"#334155", marginTop:2 }}>ID: {user.telegramId} · {toUZT(user.lastLoginAt)}</div>
        </div>
        <div style={{ fontSize:16, color:"#475569" }}>{expanded?"▲":"▼"}</div>
      </div>

      <div style={{ display:"flex", gap:5, marginTop:10, flexWrap:"wrap" }}>
        {[{ label:"TON", val:Number(user.ton??0).toFixed(4), color:"#fbbf24" }, { label:"TONYX", val:Number(user.tonyxCoins??0).toLocaleString(), color:"#a78bfa" }, { label:"Pts", val:Number(user.coins??0).toLocaleString(), color:"#60a5fa" }].map(({ label, val, color }) => (
          <div key={label} style={{ flex:1, minWidth:55, background:"rgba(30,45,69,0.5)", borderRadius:10, padding:"5px 8px", textAlign:"center" }}>
            <div style={{ fontSize:8, color:"#334155", marginBottom:2 }}>{label}</div>
            <div style={{ fontSize:11, fontWeight:800, color }}>{val}</div>
          </div>
        ))}
      </div>

      {expanded && (
        <div style={{ marginTop:12, borderTop:"1px solid rgba(30,58,143,0.2)", paddingTop:12 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:12 }}>
            {[{ label:"Реклам", val:user.totalAdsWatched }, { label:"Игр", val:user.totalGamesPlayed }, { label:"Побед", val:user.wins }, { label:"Поражений", val:user.losses }, { label:"P2P ордеров", val:user.totalOrders }, { label:"Рефералов", val:user.referrals }].map(({ label, val }) => (
              <div key={label} style={{ background:"rgba(30,45,69,0.4)", borderRadius:8, padding:"8px 10px" }}>
                <div style={{ fontSize:9, color:"#334155", marginBottom:2 }}>{label}</div>
                <div style={{ fontSize:12, fontWeight:700, color:"#f1f5f9" }}>{val}</div>
              </div>
            ))}
          </div>
          <BalanceAdjuster userId={user.telegramId} adminId={adminId} onDone={onRefresh} />
          <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:8 }}>
            {!isOwnerUser && (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:user.forceWin?"rgba(250,204,21,0.1)":"rgba(30,45,69,0.5)", border:`1px solid ${user.forceWin?"rgba(250,204,21,0.4)":"rgba(30,58,143,0.25)"}`, borderRadius:10, padding:"10px 14px" }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:user.forceWin?"#facc15":"#94a3b8" }}>⚡ Режим Бога (100% выигрыш)</div>
                  <div style={{ fontSize:9, color:"#475569", marginTop:2 }}>{user.forceWin?"АКТИВЕН":"ВЫКЛЮЧЕН"}</div>
                </div>
                <button onClick={()=>callApi(`users/${user.telegramId}/force-win`,{ enable:!user.forceWin })} disabled={loading}
                  style={{ padding:"8px 16px", borderRadius:8, border:"none", fontFamily:"inherit", background:user.forceWin?"rgba(250,204,21,0.2)":"rgba(30,58,143,0.4)", color:user.forceWin?"#facc15":"#60a5fa", fontSize:12, fontWeight:800, cursor:"pointer" }}>
                  {user.forceWin?"ВЫКЛ":"ВКЛ"}
                </button>
              </div>
            )}
            {!isOwnerUser && <WinRateRow telegramId={user.telegramId} adminId={adminId} current={user.winRateModifier??null} onDone={onRefresh} />}
            {!isOwnerUser && <ModerationRow telegramId={user.telegramId} adminId={adminId} status={user.userStatus??"active"} bannedReason={user.bannedReason??null} onDone={onRefresh} />}
            {isSuperAdmin && !isOwnerUser && (
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>callApi("team/grant",{ targetId:user.telegramId })} disabled={loading||user.isAdmin}
                  style={{ flex:1, padding:"11px 0", borderRadius:10, border:"none", fontFamily:"inherit", background:user.isAdmin?"rgba(30,45,69,0.3)":"rgba(251,191,36,0.12)", color:user.isAdmin?"#334155":"#fbbf24", fontSize:12, fontWeight:700, cursor:user.isAdmin?"not-allowed":"pointer", opacity:user.isAdmin?0.5:1 }}>
                  ⭐ Назначить админом
                </button>
                <button onClick={()=>callApi("team/revoke",{ targetId:user.telegramId })} disabled={loading||!user.isAdmin}
                  style={{ flex:1, padding:"11px 0", borderRadius:10, border:"none", fontFamily:"inherit", background:!user.isAdmin?"rgba(30,45,69,0.3)":"rgba(220,38,38,0.1)", color:!user.isAdmin?"#334155":"#f87171", fontSize:12, fontWeight:700, cursor:!user.isAdmin?"not-allowed":"pointer", opacity:!user.isAdmin?0.5:1 }}>
                  🔻 Снять с должности
                </button>
              </div>
            )}
            {isSuperAdmin && !isOwnerUser && (
              <button onClick={()=>{ if(!confirmDelete){ setConfirmDelete(true); setTimeout(()=>setConfirmDelete(false),4000); return; } callApi(`users/${user.telegramId}/delete-data`); setConfirmDelete(false); }} disabled={loading}
                style={{ padding:"11px 0", borderRadius:10, border:`1px solid ${confirmDelete?"rgba(239,68,68,0.7)":"rgba(239,68,68,0.25)"}`, fontFamily:"inherit", background:confirmDelete?"rgba(220,38,38,0.25)":"rgba(220,38,38,0.06)", color:confirmDelete?"#fca5a5":"#f87171", fontSize:13, fontWeight:700, cursor:"pointer", transition:"all .2s" }}>
                {confirmDelete?"⚠️ НАЖМИТЕ ЕЩЁ РАЗ для удаления":"🗑️ УДАЛИТЬ ДАННЫЕ профиля"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GeneralTab({ adminId, isSuperAdmin }: { adminId: string; isSuperAdmin: boolean }) {
  const { toast, flash } = useToast();
  const [users, setUsers]     = useState<UserInfo[]>([]);
  const [search, setSearch]   = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage]       = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchUsers = useCallback(async (q="", pg=1) => {
    setLoading(true);
    try {
      const qs = [`adminId=${adminId}`, `page=${pg}`];
      if (q) qs.push(`search=${encodeURIComponent(q)}`);
      const r = await fetch(`/api/mini/admin/users?${qs.join("&")}`, { headers:{ "X-Admin-Id":adminId } });
      const d = await r.json();
      if (pg===1) setUsers(d.users??[]);
      else setUsers(prev=>[...prev,...(d.users??[])]);
      setHasMore(d.hasMore??false); setPage(pg);
    } catch { flash("Ошибка загрузки","error"); }
    finally { setLoading(false); }
  }, [adminId, flash]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") fetchUsers(search,1); }}
          placeholder="Поиск по ID или @username"
          style={{ flex:1, background:"rgba(30,45,69,0.7)", border:"1px solid rgba(30,58,143,0.4)", borderRadius:10, padding:"10px 14px", color:"#f1f5f9", fontFamily:"inherit", fontSize:13, outline:"none" }} />
        <button onClick={()=>fetchUsers(search,1)} style={{ padding:"10px 16px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#1d4ed8,#2563eb)", color:"#fff", fontFamily:"inherit", fontSize:13, fontWeight:700, cursor:"pointer" }}>🔍</button>
      </div>
      {loading&&users.length===0 ? <div style={{ textAlign:"center", color:"#475569", padding:"32px 0" }}>⏳ Загрузка…</div>
        : users.length===0 ? <div style={{ textAlign:"center", color:"#475569", padding:"32px 0" }}>Нет пользователей</div>
        : <>
          {users.map(u=><UserCard key={u.telegramId} user={u} adminId={adminId} isSuperAdmin={isSuperAdmin} onRefresh={()=>fetchUsers(search,1)} />)}
          {hasMore && <button onClick={()=>fetchUsers(search,page+1)} disabled={loading} style={{ width:"100%", padding:"12px 0", borderRadius:12, border:"1px solid rgba(30,58,143,0.3)", background:"rgba(30,45,69,0.5)", color:"#60a5fa", fontFamily:"inherit", fontSize:13, fontWeight:700, cursor:"pointer", marginTop:8 }}>{loading?"⏳ Загрузка…":"Загрузить ещё"}</button>}
        </>}
    </div>
  );
}

/* ══════════════════ TAB 5: PLAYERS (TWINS) ══════════════════ */
interface TwinGroup { ip: string; matchedBy: "ip" | "device" | "ip+device"; count: number; accounts: { telegramId: string; username: string | null; firstName: string | null; createdAt: string | null; warningCount: number; isMain: boolean }[]; }

function TeamSection({ admins, adminId, onRefresh }: { admins: { telegramId: string; username: string | null }[]; adminId: string; onRefresh: ()=>void }) {
  const { toast, flash } = useToast();
  const [targetId, setTargetId] = useState(""); const [loading, setLoading] = useState(false);
  const change = async (action: "grant"|"revoke") => {
    if (!targetId.trim()) { flash("Введите Telegram ID","error"); return; }
    setLoading(true);
    try {
      const r = await apiCall(`team/${action}`, { adminId, method:"POST", body:JSON.stringify({ targetId:targetId.trim() }) });
      const d = await r.json();
      if (!r.ok) flash(d.error||"Ошибка","error"); else { flash(d.message||"Готово","success"); setTargetId(""); onRefresh(); }
    } catch { flash("Ошибка сети","error"); } finally { setLoading(false); }
  };
  return (
    <SectionCard color="#b45309">
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <SectionTitle icon="⭐" label="Команда администраторов" color="#fbbf24" />
      <div style={{ marginBottom:12 }}>
        {[{ telegramId:OWNER_ID, username:null, isOwner:true }, ...admins.filter(a=>a.telegramId!==OWNER_ID).map(a=>({...a,isOwner:false}))].map(a => (
          <div key={a.telegramId} style={{ display:"flex", justifyContent:"space-between", background:"rgba(30,45,69,0.5)", borderRadius:10, padding:"8px 12px", marginBottom:6 }}>
            <span style={{ fontSize:12, fontWeight:700, color:(a as typeof a & { isOwner?: boolean }).isOwner?"#fbbf24":"#f1f5f9" }}>
              {(a as typeof a & { isOwner?: boolean }).isOwner?"👑 Суперадмин":(a.username?`@${a.username}`:a.telegramId)}
            </span>
            <span style={{ fontSize:10, color:"#334155" }}>{a.telegramId}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize:10, color:"#475569", fontWeight:700, marginBottom:8, letterSpacing:"0.1em" }}>ВЫДАТЬ / ЗАБРАТЬ ДОСТУП</div>
      <input value={targetId} onChange={e=>setTargetId(e.target.value)} placeholder="Telegram ID пользователя"
        style={{ width:"100%", background:"rgba(30,45,69,0.6)", border:"1px solid rgba(30,58,143,0.4)", borderRadius:10, padding:"11px 14px", color:"#f1f5f9", fontFamily:"inherit", fontSize:13, outline:"none", boxSizing:"border-box", marginBottom:10 }} />
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={()=>change("grant")} disabled={loading} style={{ flex:1, padding:"12px 0", borderRadius:10, border:"none", fontFamily:"inherit", background:"linear-gradient(135deg,#92400e,#b45309)", color:"#fbbf24", fontSize:13, fontWeight:800, cursor:"pointer" }}>✅ Дать доступ</button>
        <button onClick={()=>change("revoke")} disabled={loading} style={{ flex:1, padding:"12px 0", borderRadius:10, border:"none", fontFamily:"inherit", background:"rgba(220,38,38,0.1)", color:"#f87171", fontSize:13, fontWeight:700, cursor:"pointer" }}>❌ Забрать</button>
      </div>
    </SectionCard>
  );
}

function PlayersTab({ adminId, isSuperAdmin, stats, onRefresh }: { adminId: string; isSuperAdmin: boolean; stats: Stats | null; onRefresh: ()=>void }) {
  const { toast, flash } = useToast();
  const [groups, setGroups]   = useState<TwinGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [banningIp, setBanningIp] = useState<string | null>(null);

  const loadTwins = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiCall("twins", { adminId });
      const d = await r.json();
      setGroups(d.groups ?? []);
    } catch { flash("Ошибка загрузки","error"); }
    finally { setLoading(false); }
  }, [adminId, flash]);

  useEffect(() => { loadTwins(); }, [loadTwins]);

  const banGroup = async (group: TwinGroup, keepMain: boolean) => {
    setBanningIp(group.ip);
    try {
      const body = group.matchedBy === "device"
        ? { deviceId: group.ip, keepMain, reason:"Твинк-аккаунт (мульти-аккаунт)" }
        : { ip: group.ip, keepMain, reason:"Твинк-аккаунт (мульти-аккаунт)" };
      const r = await apiCall("twins/ban-group", { adminId, method:"POST", body:JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) flash(d.error||"Ошибка","error");
      else { flash(d.message||"✅ Заблокировано","success"); loadTwins(); }
    } catch { flash("Ошибка сети","error"); }
    finally { setBanningIp(null); }
  };

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {isSuperAdmin && stats && (
        <TeamSection admins={stats.admins} adminId={adminId} onRefresh={onRefresh} />
      )}

      <SectionCard color="#dc2626">
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <SectionTitle icon="🔍" label="Твинк-аккаунты (по IP и устройству)" color="#f87171" />
          <button onClick={loadTwins} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid rgba(220,38,38,0.3)", background:"rgba(30,45,69,0.5)", color:"#f87171", fontFamily:"inherit", fontSize:11, fontWeight:700, cursor:"pointer" }}>🔄</button>
        </div>
        <div style={{ fontSize:11, color:"#475569", marginBottom:12 }}>
          Пользователи, совпавшие по IP-адресу и/или устройству. Первый (по дате регистрации) аккаунт считается главным. При регистрации новый твинк-аккаунт блокируется автоматически, а главный получает предупреждение (после 3-х — блокируется тоже).
        </div>

        {loading ? (
          <div style={{ textAlign:"center", color:"#475569", padding:"20px 0" }}>⏳ Загрузка…</div>
        ) : groups.length===0 ? (
          <div style={{ textAlign:"center", color:"#475569", padding:"20px 0" }}>✅ Твинков не обнаружено</div>
        ) : groups.map(g => (
          <div key={g.ip} style={{ background:"rgba(30,15,15,0.6)", border:"1px solid rgba(220,38,38,0.3)", borderRadius:14, padding:14, marginBottom:12 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <div>
                <div style={{ fontFamily:"monospace", fontSize:12, color:"#fca5a5", fontWeight:700 }}>{g.ip}</div>
                <div style={{ fontSize:10, color:"#475569", marginTop:2 }}>
                  {g.count} аккаунтов · совпадение: {g.matchedBy==="ip"?"IP":g.matchedBy==="device"?"устройство":"IP + устройство"}
                </div>
              </div>
              <span style={{ fontSize:11, fontWeight:900, color:"#f87171", background:"rgba(220,38,38,0.2)", padding:"3px 10px", borderRadius:8 }}>×{g.count} ТВИНКОВ</span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:12 }}>
              {g.accounts.map((acc, i) => (
                <div key={acc.telegramId} style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(15,23,42,0.6)", borderRadius:10, padding:"8px 10px" }}>
                  <span style={{ fontSize:16 }}>{acc.isMain?"👑":"👤"}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:acc.isMain?"#fbbf24":"#f1f5f9", display:"flex", alignItems:"center", gap:6 }}>
                      {acc.firstName||acc.username||acc.telegramId}
                      {acc.username && <span style={{ fontSize:10, color:"#475569" }}>@{acc.username}</span>}
                    </div>
                    <div style={{ fontSize:9, color:"#334155" }}>ID: {acc.telegramId}</div>
                  </div>
                  {acc.isMain && acc.warningCount > 0 && (
                    <span style={{ flexShrink:0, fontSize:9, fontWeight:900, padding:"2px 7px", borderRadius:6, background:"rgba(251,191,36,0.15)", color:"#fbbf24" }}>
                      ⚠️ {acc.warningCount}/3
                    </span>
                  )}
                  <span style={{ flexShrink:0, fontSize:9, fontWeight:900, padding:"2px 7px", borderRadius:6, background:acc.isMain?"rgba(34,197,94,0.15)":"rgba(220,38,38,0.15)", color:acc.isMain?"#4ade80":"#f87171" }}>
                    {acc.isMain?"ГЛАВНЫЙ":`ТВИНК #${i}`}
                  </span>
                </div>
              ))}
            </div>
            {isSuperAdmin && (
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>banGroup(g, true)} disabled={banningIp===g.ip}
                  style={{ flex:2, padding:"10px 0", borderRadius:10, border:"none", fontFamily:"inherit", background:"rgba(220,38,38,0.15)", color:"#f87171", fontSize:12, fontWeight:800, cursor:"pointer" }}>
                  {banningIp===g.ip?"⏳...":"🔴 Бан твинков (главный остаётся)"}
                </button>
                <button onClick={()=>banGroup(g, false)} disabled={banningIp===g.ip}
                  style={{ flex:1, padding:"10px 0", borderRadius:10, border:"none", fontFamily:"inherit", background:"rgba(127,29,29,0.3)", color:"#fca5a5", fontSize:12, fontWeight:800, cursor:"pointer" }}>
                  {banningIp===g.ip?"⏳...":"💀 Всех"}
                </button>
              </div>
            )}
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

/* ══════════════════ WITHDRAWALS / TOPUPS ══════════════════ */
function WithdrawalsSection({ adminId }: { adminId: string }) {
  const { toast, flash } = useToast();
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[]>([]);
  const [loading, setLoading]         = useState(false);
  const [filter, setFilter]           = useState<"pending"|"approved"|"rejected">("pending");
  const [txInputs, setTxInputs]       = useState<Record<number,string>>({});
  const [busy, setBusy]               = useState<Record<number,boolean>>({});

  const load = useCallback(async (f: string) => {
    setLoading(true);
    try { const r = await apiCall(`withdrawals?status=${f}`,{ adminId }); const d = await r.json(); setWithdrawals(d.withdrawals??[]); }
    catch { flash("Ошибка загрузки","error"); } finally { setLoading(false); }
  }, [adminId, flash]);

  useEffect(() => { load(filter); }, [filter, load]);

  const approve = async (id: number) => {
    setBusy(p=>({...p,[id]:true}));
    try { const r = await apiCall(`withdrawals/${id}/approve`,{ adminId, method:"POST", body:JSON.stringify({ txHash:txInputs[id]||null }) }); const d = await r.json(); if (!r.ok) flash(d.error||"Ошибка","error"); else { flash(d.message||"✅ Одобрено","success"); load(filter); } }
    catch { flash("Ошибка сети","error"); } finally { setBusy(p=>({...p,[id]:false})); }
  };
  const reject = async (id: number) => {
    setBusy(p=>({...p,[id]:true}));
    try { const r = await apiCall(`withdrawals/${id}/reject`,{ adminId, method:"POST" }); const d = await r.json(); if (!r.ok) flash(d.error||"Ошибка","error"); else { flash("❌ Отклонено","success"); load(filter); } }
    catch { flash("Ошибка сети","error"); } finally { setBusy(p=>({...p,[id]:false})); }
  };

  const pendingCount = filter==="pending" ? withdrawals.length : 0;
  return (
    <div style={{ marginBottom:14 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <div style={{ fontSize:13, fontWeight:800, color:"#f1f5f9", display:"flex", alignItems:"center", gap:8 }}>
          💸 Заявки на вывод
          {pendingCount>0 && <span style={{ background:"rgba(220,38,38,0.2)", color:"#f87171", borderRadius:8, padding:"2px 8px", fontSize:11, fontWeight:700 }}>{pendingCount}</span>}
        </div>
        <button onClick={()=>load(filter)} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid rgba(30,58,143,0.3)", background:"rgba(30,45,69,0.5)", color:"#60a5fa", fontFamily:"inherit", fontSize:11, fontWeight:700, cursor:"pointer" }}>🔄</button>
      </div>
      <div style={{ display:"flex", gap:6, marginBottom:12 }}>
        {(["pending","approved","rejected"] as const).map(s => (
          <button key={s} onClick={()=>setFilter(s)} style={{ flex:1, padding:"7px 0", borderRadius:8, border:"none", fontFamily:"inherit",
            background:filter===s?(s==="pending"?"rgba(220,38,38,0.22)":s==="approved"?"rgba(22,163,74,0.22)":"rgba(100,116,139,0.22)"):"rgba(30,45,69,0.4)",
            color:filter===s?(s==="pending"?"#f87171":s==="approved"?"#4ade80":"#94a3b8"):"#475569", fontSize:11, fontWeight:700, cursor:"pointer" }}>
            {s==="pending"?"⏳ Ожидают":s==="approved"?"✅ Одобрены":"❌ Отклонены"}
          </button>
        ))}
      </div>
      {loading&&withdrawals.length===0 ? <div style={{ textAlign:"center", color:"#475569", padding:"20px 0" }}>⏳ Загрузка…</div>
        : withdrawals.length===0 ? <div style={{ textAlign:"center", color:"#475569", padding:"20px 0", fontSize:13 }}>Заявок нет</div>
        : withdrawals.map(w => {
          const tonAmt = w.tonAmount?Number(w.tonAmount):w.amount/1000;
          const name   = w.userFirstName??(w.userUsername?`@${w.userUsername}`:w.telegramId);
          const isbusy = busy[w.id]??false;
          return (
            <div key={w.id} style={{ background:"rgba(15,23,42,0.95)", border:`1px solid ${w.isTwin?"rgba(220,38,38,0.45)":"rgba(30,58,143,0.25)"}`, borderRadius:14, padding:14, marginBottom:10 }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:"#f1f5f9", display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                    {name}{w.isTwin&&<span style={{ fontSize:10, background:"rgba(220,38,38,0.2)", color:"#f87171", padding:"2px 7px", borderRadius:6, fontWeight:700 }}>⚠️ TWIN IP</span>}
                  </div>
                  <div style={{ fontSize:10, color:"#475569", marginTop:2 }}>ID: {w.telegramId} · {w.userLastIp??"—"}</div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0, marginLeft:8 }}>
                  <div style={{ fontSize:20, fontWeight:900, color:"#fbbf24", lineHeight:1 }}>{tonAmt.toFixed(4)}</div>
                  <div style={{ fontSize:10, color:"#fbbf24", fontWeight:700 }}>TON</div>
                </div>
              </div>
              <div style={{ background:"rgba(30,45,69,0.5)", borderRadius:8, padding:"7px 10px", marginBottom:8, fontSize:10, color:"#94a3b8", wordBreak:"break-all", fontFamily:"monospace" }}>→ {w.address}</div>
              {w.txHash&&<div style={{ fontSize:10, color:"#4ade80", fontFamily:"monospace", marginBottom:8, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>TX: {w.txHash}</div>}
              {w.status==="pending"&&<>
                <input value={txInputs[w.id]??""} onChange={e=>setTxInputs(p=>({...p,[w.id]:e.target.value}))} placeholder="TxHash (необязательно)" style={{ width:"100%", background:"rgba(30,45,69,0.6)", border:"1px solid rgba(30,58,143,0.3)", borderRadius:8, padding:"8px 10px", color:"#f1f5f9", fontFamily:"inherit", fontSize:11, outline:"none", boxSizing:"border-box", marginBottom:8 }} />
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={()=>approve(w.id)} disabled={isbusy} style={{ flex:2, padding:"11px 0", borderRadius:10, border:"none", fontFamily:"inherit", background:"linear-gradient(135deg,#15803d,#22c55e)", color:"#fff", fontSize:13, fontWeight:800, cursor:"pointer", opacity:isbusy?0.6:1 }}>{isbusy?"…":"✅ ОДОБРИТЬ"}</button>
                  <button onClick={()=>reject(w.id)} disabled={isbusy} style={{ flex:1, padding:"11px 0", borderRadius:10, border:"none", fontFamily:"inherit", background:"rgba(220,38,38,0.14)", color:"#f87171", fontSize:13, fontWeight:800, cursor:"pointer", opacity:isbusy?0.6:1 }}>{isbusy?"…":"❌"}</button>
                </div>
              </>}
            </div>
          );
        })}
    </div>
  );
}

function TopupsSection({ adminId }: { adminId: string }) {
  const { toast, flash } = useToast();
  const [topups, setTopups]   = useState<AdminTopup[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState<"pending"|"approved"|"rejected">("pending");
  const [busy, setBusy]       = useState<Record<number,boolean>>({});

  const load = useCallback(async (f: string) => {
    setLoading(true);
    try { const r = await apiCall(`topups?status=${f}`,{ adminId }); const d = await r.json(); setTopups(d.topups??[]); }
    catch { flash("Ошибка","error"); } finally { setLoading(false); }
  }, [adminId, flash]);

  useEffect(() => { load(filter); }, [filter, load]);

  const approve = async (id: number) => {
    setBusy(p=>({...p,[id]:true}));
    try { const r = await apiCall(`topups/${id}/approve`,{ adminId, method:"POST" }); const d = await r.json(); if(!r.ok) flash(d.error||"Ошибка","error"); else { flash(d.message||"✅ Зачислено","success"); load(filter); } }
    catch { flash("Ошибка сети","error"); } finally { setBusy(p=>({...p,[id]:false})); }
  };
  const reject = async (id: number) => {
    setBusy(p=>({...p,[id]:true}));
    try { const r = await apiCall(`topups/${id}/reject`,{ adminId, method:"POST" }); const d = await r.json(); if(!r.ok) flash(d.error||"Ошибка","error"); else { flash("❌ Топап отклонён","success"); load(filter); } }
    catch { flash("Ошибка сети","error"); } finally { setBusy(p=>({...p,[id]:false})); }
  };

  const pendingCount = filter==="pending"?topups.length:0;
  return (
    <div style={{ marginBottom:14 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <div style={{ fontSize:13, fontWeight:800, color:"#f1f5f9", display:"flex", alignItems:"center", gap:8 }}>
          💎 Пополнения{pendingCount>0&&<span style={{ background:"rgba(30,58,143,0.3)", color:"#60a5fa", borderRadius:8, padding:"2px 8px", fontSize:11, fontWeight:700 }}>{pendingCount}</span>}
        </div>
        <button onClick={()=>load(filter)} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid rgba(30,58,143,0.3)", background:"rgba(30,45,69,0.5)", color:"#60a5fa", fontFamily:"inherit", fontSize:11, fontWeight:700, cursor:"pointer" }}>🔄</button>
      </div>
      <div style={{ display:"flex", gap:6, marginBottom:12 }}>
        {(["pending","approved","rejected"] as const).map(s=>(
          <button key={s} onClick={()=>setFilter(s)} style={{ flex:1, padding:"7px 0", borderRadius:8, border:"none", fontFamily:"inherit",
            background:filter===s?(s==="pending"?"rgba(30,58,143,0.3)":s==="approved"?"rgba(22,163,74,0.22)":"rgba(100,116,139,0.22)"):"rgba(30,45,69,0.4)",
            color:filter===s?(s==="pending"?"#60a5fa":s==="approved"?"#4ade80":"#94a3b8"):"#475569", fontSize:11, fontWeight:700, cursor:"pointer" }}>
            {s==="pending"?"⏳ Ожидают":s==="approved"?"✅ Одобрены":"❌ Отклонены"}
          </button>
        ))}
      </div>
      {loading&&topups.length===0?<div style={{ textAlign:"center", color:"#475569", padding:"20px 0" }}>⏳ Загрузка…</div>
        :topups.length===0?<div style={{ textAlign:"center", color:"#475569", padding:"20px 0", fontSize:13 }}>Заявок нет</div>
        :topups.map(t=>{
          const name=t.userFirstName??(t.userUsername?`@${t.userUsername}`:t.telegramId);
          const isbusy=busy[t.id]??false;
          return (
            <div key={t.id} style={{ background:"rgba(15,23,42,0.95)", border:"1px solid rgba(30,58,143,0.3)", borderRadius:14, padding:14, marginBottom:10 }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:8 }}>
                <div><div style={{ fontSize:13, fontWeight:700, color:"#f1f5f9" }}>{name}</div><div style={{ fontSize:10, color:"#475569", marginTop:2 }}>ID: {t.telegramId}</div></div>
                <div style={{ textAlign:"right" }}><div style={{ fontSize:20, fontWeight:900, color:"#60a5fa", lineHeight:1 }}>{Number(t.tonAmount).toFixed(4)}</div><div style={{ fontSize:10, color:"#60a5fa", fontWeight:700 }}>TON</div></div>
              </div>
              {t.memo&&<div style={{ background:"rgba(30,45,69,0.5)", borderRadius:8, padding:"5px 10px", marginBottom:6, fontSize:10, color:"#94a3b8", fontFamily:"monospace" }}>Memo: {t.memo}</div>}
              {t.status==="pending"&&<div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>approve(t.id)} disabled={isbusy} style={{ flex:2, padding:"11px 0", borderRadius:10, border:"none", fontFamily:"inherit", background:"linear-gradient(135deg,#1d4ed8,#2563eb)", color:"#fff", fontSize:13, fontWeight:800, cursor:"pointer", opacity:isbusy?0.6:1 }}>{isbusy?"…":"✅ ЗАЧИСЛИТЬ"}</button>
                <button onClick={()=>reject(t.id)} disabled={isbusy} style={{ flex:1, padding:"11px 0", borderRadius:10, border:"none", fontFamily:"inherit", background:"rgba(220,38,38,0.14)", color:"#f87171", fontSize:13, fontWeight:800, cursor:"pointer", opacity:isbusy?0.6:1 }}>{isbusy?"…":"❌"}</button>
              </div>}
            </div>
          );
        })}
    </div>
  );
}

/* ══════════════════ MAIN ADMIN PAGE ══════════════════ */
export default function AdminPage() {
  const { telegramId: tgId } = useTelegram();
  const [adminId, setAdminId]       = useState("");
  const [manualId, setManualId]     = useState("");
  const [authed, setAuthed]         = useState(false);
  const [authError, setAuthError]   = useState<string | null>(null);
  const [checking, setChecking]     = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [stats, setStats]           = useState<Stats | null>(null);
  const [activating, setActivating] = useState(false);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [tab, setTab]               = useState(4); // default: General
  const { toast, flash }            = useToast();

  const fetchOnlineCount = useCallback(async (id: string) => {
    try { const r = await fetch(`/api/mini/admin/online-count`,{ headers:{ "X-Admin-Id":id } }); if (r.ok) { const d = await r.json(); setOnlineCount(d.count??0); } } catch { /**/ }
  }, []);

  const fetchStats = useCallback(async (id: string) => {
    fetchOnlineCount(id);
    try { const r = await apiCall("stats",{ adminId:id }); if (r.ok) { const d = await r.json(); setStats(d); } } catch { /**/ }
  }, [fetchOnlineCount]);

  const handleMarketAction = async (action: "activate"|"deactivate"|"force-activate") => {
    setActivating(true);
    try {
      const r = await apiCall(`market/${action}`,{ adminId, method:"POST" });
      const d = await r.json();
      if (!r.ok) flash(d.error||"Ошибка","error"); else { flash(d.message||"Готово","success"); fetchStats(adminId); }
    } catch { flash("Ошибка сети","error"); } finally { setActivating(false); }
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
    autoAuthRef.current = true; doAuth(tgId);
  }, [tgId, doAuth]);

  useEffect(() => {
    if (!authed||!adminId) return;
    const t = setInterval(()=>fetchStats(adminId), 20000);
    return ()=>clearInterval(t);
  }, [authed, adminId, fetchStats]);

  /* ── Not authed ── */
  if (!authed) {
    return (
      <div style={{ padding:"24px 16px", minHeight:"80vh", display:"flex", flexDirection:"column" }}>
        {toast && <Toast msg={toast.msg} type={toast.type} />}
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontSize:48, marginBottom:8 }}>🔐</div>
          <div style={{ fontSize:20, fontWeight:900, color:"#f1f5f9" }}>Панель управления</div>
          <div style={{ fontSize:12, color:"#475569", marginTop:4 }}>TONYX Admin</div>
        </div>
        {checking && <div style={{ textAlign:"center", padding:"16px 0", color:"#60a5fa", fontSize:14 }}>⏳ Проверяем доступ…</div>}
        {tgId && !authed && !checking && <div style={{ background:"rgba(30,45,69,0.5)", borderRadius:12, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#475569", textAlign:"center" }}>Ваш ID: <b style={{ color:"#60a5fa" }}>{tgId}</b></div>}
        {authError && <div style={{ background:"rgba(220,38,38,0.12)", border:"1px solid rgba(220,38,38,0.3)", borderRadius:12, padding:"12px 16px", marginBottom:16, fontSize:13, color:"#f87171" }}>{authError}</div>}
        <div style={{ background:"rgba(15,23,42,0.9)", border:"1px solid rgba(30,58,143,0.3)", borderRadius:16, padding:16 }}>
          <div style={{ fontSize:12, color:"#475569", marginBottom:10 }}>Введите ваш Telegram ID вручную:</div>
          <input value={manualId} onChange={e=>setManualId(e.target.value)} type="text" placeholder="Telegram ID (например: 7257793582)"
            style={{ width:"100%", background:"rgba(30,45,69,0.7)", border:"1px solid rgba(30,58,143,0.4)", borderRadius:10, padding:"12px 14px", color:"#f1f5f9", fontFamily:"inherit", fontSize:14, outline:"none", boxSizing:"border-box", marginBottom:10 }} />
          <button onClick={()=>doAuth(manualId||tgId||"")} disabled={checking}
            style={{ width:"100%", padding:"14px 0", borderRadius:12, border:"none", background:"linear-gradient(135deg,#1d4ed8,#2563eb)", color:"#fff", fontSize:15, fontWeight:800, fontFamily:"inherit", cursor:"pointer" }}>
            {checking?"⏳ Проверка…":"Войти в панель"}
          </button>
        </div>
      </div>
    );
  }

  /* ── Main panel ── */
  return (
    <div style={{ padding:"12px 14px 100px" }}>
      <style>{`@keyframes pulse-green{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)}}`}</style>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:900, color:"#f1f5f9" }}>⚙️ Панель управления</div>
          <div style={{ fontSize:10, color:"#334155", marginTop:1 }}>
            {isSuperAdmin?"👑 Суперадмин":"🔧 Администратор"} · {adminId}
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(15,23,42,0.8)", border:"1px solid rgba(34,197,94,0.3)", borderRadius:10, padding:"6px 10px" }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:"#22c55e", boxShadow:"0 0 6px #22c55e", animation:"pulse-green 1.5s ease-in-out infinite" }} />
            <span style={{ fontSize:16, fontWeight:900, color:"#4ade80" }}>{onlineCount??"-"}</span>
          </div>
          <button onClick={()=>fetchStats(adminId)} style={{ padding:"7px 12px", borderRadius:10, border:"1px solid rgba(30,58,143,0.3)", background:"rgba(30,45,69,0.5)", color:"#60a5fa", fontSize:11, fontWeight:700, fontFamily:"inherit", cursor:"pointer" }}>🔄</button>
        </div>
      </div>

      {/* Stats pills */}
      {stats && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, marginBottom:14 }}>
          {[{ label:"Игроков", val:Number(stats.totalUsers).toLocaleString(), color:"#60a5fa" }, { label:"TONYX", val:Number(stats.totalCoinsSold).toLocaleString(), color:"#a78bfa" }, { label:"TON", val:Number(stats.totalTonVolume).toFixed(2), color:"#fbbf24" }, { label:"P2P орд.", val:Number(stats.activeOrders).toLocaleString(), color:"#4ade80" }].map(({ label, val, color }) => (
            <div key={label} style={{ background:"rgba(15,23,42,0.9)", border:"1px solid rgba(30,58,143,0.2)", borderRadius:12, padding:"10px 8px", textAlign:"center" }}>
              <div style={{ fontSize:9, color:"#334155", marginBottom:3 }}>{label}</div>
              <div style={{ fontSize:13, fontWeight:900, color }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      <TabNav active={tab} onChange={setTab} />

      {tab===0 && <GameConfigTab adminId={adminId} />}
      {tab===1 && <MarketTab adminId={adminId} stats={stats} isSuperAdmin={isSuperAdmin} onRefresh={()=>fetchStats(adminId)} activating={activating} onMarketAction={handleMarketAction} />}
      {tab===2 && <GamesTab adminId={adminId} />}
      {tab===3 && <TasksTab adminId={adminId} isSuperAdmin={isSuperAdmin} />}
      {tab===4 && <GeneralTab adminId={adminId} isSuperAdmin={isSuperAdmin} />}
      {tab===5 && <PlayersTab adminId={adminId} isSuperAdmin={isSuperAdmin} stats={stats} onRefresh={()=>fetchStats(adminId)} />}
    </div>
  );
}
