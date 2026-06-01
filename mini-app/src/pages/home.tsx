import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetUserProfile,
  getGetUserProfileQueryKey,
} from "@workspace/api-client-react";
import { useTelegram, haptic, hapticNotify } from "@/lib/telegram";

/* ─── Types ─── */
interface InvData {
  principal: number;
  totalClaimed: number;
  unclaimed: number;
  startedAt: string | null;
  ratePerDay: number;
  boostRate: number;
}

interface BoostPkg {
  id: number;
  boostPct: number;
  costTon: number;
  label: string;
  emoji: string;
}

/* ─── Toast ─── */
function Toast({ msg, type }: { msg: string; type: "success" | "error" | "info" }) {
  const bg = type === "success" ? "rgba(22,163,74,0.96)" : type === "error" ? "rgba(220,38,38,0.96)" : "rgba(30,64,175,0.96)";
  return (
    <div style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
      background: bg, color: "#fff", padding: "12px 20px", borderRadius: 12,
      fontSize: 14, fontWeight: 600, zIndex: 9999, maxWidth: "calc(100% - 32px)",
      boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
    }}>{msg}</div>
  );
}

/* ─── Stars ─── */
const STARS = Array.from({ length: 80 }, () => ({
  x: Math.random() * 100, y: Math.random() * 100,
  r: Math.random() * 1.5 + 0.5, o: Math.random() * 0.5 + 0.2,
}));

function Stars() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
      {STARS.map((s, i) => (
        <div key={i} style={{
          position: "absolute", left: `${s.x}%`, top: `${s.y}%`,
          width: s.r * 2, height: s.r * 2, borderRadius: "50%",
          background: "#fff", opacity: s.o,
        }} />
      ))}
    </div>
  );
}

/* ─── TON Logo SVG — official diamond crystal ─── */
function TonLogo({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      {/* Outer diamond */}
      <path d="M28 4L52 18V38L28 52L4 38V18L28 4Z" fill="white" opacity="0.95" />
      {/* Top face (lighter) */}
      <path d="M28 4L52 18L28 28L4 18L28 4Z" fill="white" opacity="0.3" />
      {/* Left face */}
      <path d="M4 18L28 28V52L4 38V18Z" fill="rgba(0,0,0,0.15)" />
      {/* Center line */}
      <line x1="28" y1="4" x2="28" y2="52" stroke="rgba(100,160,255,0.4)" strokeWidth="1.5" />
      <line x1="4" y1="18" x2="52" y2="18" stroke="rgba(100,160,255,0.3)" strokeWidth="1.5" />
      <line x1="4" y1="38" x2="52" y2="38" stroke="rgba(100,160,255,0.2)" strokeWidth="1" />
    </svg>
  );
}

/* ─── Boost Modal ─── */
function BoostModal({ packages, userTon, boostRate, onClose, onBuy }: {
  packages: BoostPkg[];
  userTon: number;
  boostRate: number;
  onClose: () => void;
  onBuy: (pkgId: number) => Promise<void>;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const pkg = packages.find(p => p.id === selected);

  const handleBuy = async () => {
    if (!selected) return;
    setLoading(true);
    await onBuy(selected);
    setLoading(false);
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "flex-end", zIndex: 600 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "100%", background: "linear-gradient(180deg,#0f172a,#0a0f1e)",
        border: "1px solid rgba(139,92,246,0.3)", borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: "20px 16px 40px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#f1f5f9" }}>🚀 Бусты доходности</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#475569", fontSize: 24, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 16 }}>
          Текущий буст: <b style={{ color: "#4ade80" }}>+{(boostRate * 100).toFixed(1)}%</b>
          {" · "}Баланс: <b style={{ color: "#fbbf24" }}>{userTon.toFixed(4)} TON</b>
        </div>

        <div style={{ fontSize: 10, color: "#334155", fontWeight: 700, letterSpacing: "0.12em", marginBottom: 10 }}>⚡ ПОСТОЯННЫЕ БУСТЫ (НАВСЕГДА)</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
          {packages.map(p => {
            const isSelected = selected === p.id;
            const canAfford = userTon >= p.costTon;
            return (
              <button
                key={p.id}
                onClick={() => { haptic("light"); setSelected(p.id); }}
                disabled={!canAfford}
                style={{
                  background: isSelected
                    ? "linear-gradient(135deg,rgba(109,40,217,0.7),rgba(139,92,246,0.4))"
                    : "rgba(15,23,42,0.9)",
                  border: `1px solid ${isSelected ? "#8b5cf6" : "rgba(109,40,217,0.3)"}`,
                  borderRadius: 14, padding: "12px 6px", textAlign: "center",
                  cursor: canAfford ? "pointer" : "not-allowed", opacity: canAfford ? 1 : 0.4,
                  transition: "all 0.2s",
                  boxShadow: isSelected ? "0 0 20px rgba(139,92,246,0.4)" : "none",
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 4 }}>{p.emoji}</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#4ade80" }}>{p.label}/день</div>
                <div style={{ fontSize: 8, color: "#475569", fontWeight: 700, margin: "3px 0", letterSpacing: "0.08em" }}>НАВСЕГДА</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#fbbf24" }}>{p.costTon} TON</div>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => { haptic("medium"); handleBuy(); }}
          disabled={!selected || loading || (pkg ? userTon < pkg.costTon : true)}
          style={{
            width: "100%", padding: "16px 0", borderRadius: 16, border: "none",
            fontFamily: "inherit", fontSize: 16, fontWeight: 900,
            background: selected && pkg && userTon >= pkg.costTon
              ? "linear-gradient(135deg,#6d28d9,#8b5cf6)"
              : "rgba(109,40,217,0.2)",
            color: selected && pkg && userTon >= pkg.costTon ? "#fff" : "#334155",
            cursor: selected && pkg && userTon >= pkg.costTon ? "pointer" : "not-allowed",
            boxShadow: selected && pkg && userTon >= pkg.costTon ? "0 0 28px rgba(139,92,246,0.5)" : "none",
          }}
        >
          {loading ? "⏳ Активация…" : selected && pkg ? `💜 Купить за ${pkg.costTon} TON` : "Выберите буст"}
        </button>
      </div>
    </div>
  );
}

/* ─── Deposit Modal ─── */
function DepositModal({ userTon, onClose, onDeposit }: {
  userTon: number;
  onClose: () => void;
  onDeposit: (amount: number) => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const amt = parseFloat(input) || 0;

  const presets = [0.1, 0.5, 1, 5].filter(p => p <= userTon + 0.0001);
  if (userTon > 0 && !presets.includes(userTon)) {
    presets.push(parseFloat(userTon.toFixed(4)));
    presets.sort((a, b) => a - b);
  }

  const handleDeposit = async () => {
    if (amt <= 0 || amt > userTon) return;
    setLoading(true);
    await onDeposit(amt);
    setLoading(false);
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "flex-end", zIndex: 600 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "100%", background: "linear-gradient(180deg,#0f172a,#0a0f1e)",
        border: "1px solid rgba(34,197,94,0.25)", borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: "20px 16px 40px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#f1f5f9" }}>💰 Пополнить майнинг</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#475569", fontSize: 24, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 14 }}>
          Доступно: <b style={{ color: "#fbbf24" }}>{userTon.toFixed(4)} TON</b>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {presets.map(p => (
            <button key={p} onClick={() => setInput(String(p))} style={{
              padding: "6px 14px", borderRadius: 8, border: "none", fontFamily: "inherit",
              background: amt === p ? "linear-gradient(135deg,#065f46,#059669)" : "rgba(30,45,69,0.8)",
              color: amt === p ? "#fff" : "#64748b", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}>
              {p === userTon ? `ALL (${p})` : `${p} TON`}
            </button>
          ))}
        </div>

        <input
          value={input} onChange={e => setInput(e.target.value)} type="number" step="0.001"
          placeholder="Сумма TON"
          style={{ width: "100%", background: "rgba(30,45,69,0.6)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 10, padding: "12px 14px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 14 }}
        />

        <button
          onClick={() => { haptic("medium"); handleDeposit(); }}
          disabled={loading || amt <= 0 || amt > userTon}
          style={{
            width: "100%", padding: "16px 0", borderRadius: 16, border: "none",
            fontFamily: "inherit", fontSize: 16, fontWeight: 900,
            background: amt > 0 && amt <= userTon ? "linear-gradient(135deg,#065f46,#059669)" : "rgba(30,45,69,0.3)",
            color: amt > 0 && amt <= userTon ? "#fff" : "#334155",
            cursor: amt > 0 && amt <= userTon ? "pointer" : "not-allowed",
            boxShadow: amt > 0 && amt <= userTon ? "0 0 28px rgba(16,185,129,0.4)" : "none",
          }}
        >
          {loading ? "⏳ Пополнение…" : `Пополнить ${amt > 0 ? amt + " TON" : ""}`}
        </button>
        {amt > userTon && amt > 0 && (
          <div style={{ fontSize: 11, color: "#f87171", textAlign: "center", marginTop: 8 }}>Недостаточно TON на балансе</div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   MAIN HOME PAGE
══════════════════════════════════════ */
const BASE_RATE = 0.01;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export default function HomePage() {
  const { telegramId } = useTelegram();
  const qc = useQueryClient();
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);

  const [inv, setInv] = useState<InvData | null>(null);
  const [boostPkgs, setBoostPkgs] = useState<BoostPkg[]>([]);
  const [animMined, setAnimMined] = useState(0);
  const animRef = useRef<number>(0);

  const [showBoost, setShowBoost]     = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const showToast = useCallback((msg: string, type: "success" | "error" | "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const { data: profile, refetch: refetchProfile } = useGetUserProfile(telegramId ?? "", {
    query: { enabled: !!telegramId, refetchInterval: 8000 },
  });

  const fetchInv = useCallback(async () => {
    if (!telegramId) return;
    try {
      const r = await fetch(`/api/mini/investments/${encodeURIComponent(telegramId)}`);
      if (r.ok) setInv(await r.json());
    } catch {}
  }, [telegramId]);

  useEffect(() => {
    fetchInv();
    fetch("/api/mini/boosts/packages")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.packages) setBoostPkgs(d.packages); })
      .catch(() => {});
  }, [fetchInv]);

  /* Live animated counter */
  useEffect(() => {
    cancelAnimationFrame(animRef.current);
    if (!inv?.startedAt || inv.principal <= 0) {
      setAnimMined(Math.max(0, inv?.unclaimed ?? 0));
      return;
    }
    const startMs = new Date(inv.startedAt).getTime();
    const claimed = inv.totalClaimed;
    const principal = inv.principal;
    const ratePerMs = (BASE_RATE + (inv.boostRate ?? 0)) / MS_PER_DAY;
    const tick = () => {
      const elapsed = Date.now() - startMs;
      setAnimMined(Math.max(0, principal * ratePerMs * elapsed - claimed));
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [inv?.startedAt, inv?.principal, inv?.totalClaimed, inv?.boostRate]);

  const refreshAll = useCallback(async () => {
    await fetchInv();
    await refetchProfile();
    qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId ?? "") });
  }, [fetchInv, refetchProfile, telegramId, qc]);

  /* Buy boost */
  const handleBuyBoost = useCallback(async (pkgId: number) => {
    if (!telegramId) return;
    haptic("medium");
    try {
      const r = await fetch("/api/mini/boosts/buy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, packageId: pkgId }),
      });
      const d = await r.json();
      if (!r.ok) { showToast(d.error ?? "Ошибка", "error"); return; }
      hapticNotify("success");
      showToast(d.message ?? "Буст активирован!", "success");
      setShowBoost(false);
      await refreshAll();
    } catch { showToast("Ошибка сети", "error"); }
  }, [telegramId, showToast, refreshAll]);

  /* Deposit TON to mining */
  const handleDeposit = useCallback(async (amount: number) => {
    if (!telegramId) return;
    haptic("medium");
    try {
      const r = await fetch("/api/mini/investments/deposit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, amount }),
      });
      const d = await r.json();
      if (!r.ok) { showToast(d.error ?? "Ошибка", "error"); return; }
      hapticNotify("success");
      showToast(d.message ?? "Пополнено!", "success");
      setShowDeposit(false);
      await refreshAll();
    } catch { showToast("Ошибка сети", "error"); }
  }, [telegramId, showToast, refreshAll]);

  /* Withdraw from mining */
  const handleWithdraw = useCallback(async () => {
    if (!telegramId || withdrawing) return;
    if ((inv?.principal ?? 0) <= 0) { showToast("Нет активных вложений", "error"); return; }
    haptic("medium");
    setWithdrawing(true);
    try {
      const r = await fetch("/api/mini/investments/withdraw", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId }),
      });
      const d = await r.json();
      if (!r.ok) { showToast(d.error ?? "Ошибка", "error"); return; }
      hapticNotify("success");
      showToast(`Выведено ${d.returned?.toFixed(4) ?? "?"} TON`, "success");
      await refreshAll();
    } catch { showToast("Ошибка сети", "error"); }
    finally { setWithdrawing(false); }
  }, [telegramId, inv?.principal, withdrawing, showToast, refreshAll]);

  const userTon    = Number((profile as { ton?: string | number } | undefined)?.ton ?? 0);
  const userTonyx  = Number((profile as { tonyxCoins?: number } | undefined)?.tonyxCoins ?? 0);
  const boostRate  = inv?.boostRate ?? 0;
  const ratePerDay = (BASE_RATE + boostRate) * 100;
  const hasPrincipal = (inv?.principal ?? 0) > 0;
  const dailyEarn  = hasPrincipal ? inv!.principal * (BASE_RATE + boostRate) : 0;
  const onlineUsers = 1247 + (Math.floor(Date.now() / 60000) % 300);

  return (
    <div style={{
      minHeight: "100%", position: "relative",
      background: "linear-gradient(180deg,#020817 0%,#0a0f1e 40%,#0f172a 100%)",
      overflow: "hidden",
    }}>
      <Stars />

      {toast && <Toast msg={toast.msg} type={toast.type} />}
      {showBoost && (
        <BoostModal packages={boostPkgs} userTon={userTon} boostRate={boostRate}
          onClose={() => setShowBoost(false)} onBuy={handleBuyBoost} />
      )}
      {showDeposit && (
        <DepositModal userTon={userTon} onClose={() => setShowDeposit(false)} onDeposit={handleDeposit} />
      )}

      <div style={{ position: "relative", zIndex: 1, padding: "16px 16px 100px" }}>

        {/* ─── Top bar: Online + balances ─── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
            <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700 }}>{onlineUsers.toLocaleString()} онлайн</span>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fbbf24" }}>{userTon.toFixed(4)} TON</div>
            <div style={{ fontSize: 10, color: "#475569" }}>{userTonyx.toLocaleString()} TONYX</div>
          </div>
        </div>

        {/* ─── Rate bar with BOOST button ─── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(15,23,42,0.7)", border: "1px solid rgba(96,165,250,0.15)",
          borderRadius: 14, padding: "10px 14px", marginBottom: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
              {[4, 7, 10, 13, 10].map((h, i) => (
                <div key={i} style={{ width: 3, height: h, background: i < 3 ? "#60a5fa" : "rgba(96,165,250,0.3)", borderRadius: 1 }} />
              ))}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#4ade80" }}>+{ratePerDay.toFixed(1)}% в день</div>
              <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.1em" }}>ДОХОДНОСТЬ</div>
            </div>
          </div>
          {/* UPGRADE + BOOST — both open boost modal */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => { haptic("light"); setShowBoost(true); }}
              style={{
                padding: "7px 14px", borderRadius: 10,
                border: "1px solid rgba(139,92,246,0.5)",
                background: "linear-gradient(135deg,rgba(109,40,217,0.5),rgba(139,92,246,0.25))",
                color: "#c4b5fd", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 5,
              }}
            >
              🚀 БУСТ
            </button>
            <button
              onClick={() => { haptic("light"); setShowBoost(true); }}
              style={{
                padding: "7px 14px", borderRadius: 10,
                border: "1px solid rgba(96,165,250,0.4)",
                background: "linear-gradient(135deg,rgba(30,58,143,0.6),rgba(37,99,235,0.3))",
                color: "#60a5fa", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Upgrade ⬆
            </button>
          </div>
        </div>

        {/* ─── Mining status label ─── */}
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 10, color: hasPrincipal ? "#475569" : "#334155", letterSpacing: "0.15em", fontWeight: 700 }}>
            {hasPrincipal ? "ТЕКУЩИЙ ДОХОД" : "НЕТ АКТИВНОГО МАЙНИНГА"}
          </div>
        </div>

        {/* ─── Live counter ─── */}
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          <div style={{
            fontSize: 36, fontWeight: 900, color: "#f1f5f9",
            fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em",
            textShadow: hasPrincipal ? "0 0 40px rgba(96,165,250,0.4)" : "none",
            fontFamily: "monospace",
          }}>
            {animMined.toFixed(9)}
            <span style={{ fontSize: 16, color: "#60a5fa", marginLeft: 8, fontFamily: "inherit" }}>TON</span>
          </div>
          {hasPrincipal && (
            <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
              Вложено: <b style={{ color: "#a5f3fc" }}>{inv!.principal.toFixed(4)} TON</b>
              {" · +"}
              <b style={{ color: "#4ade80" }}>{dailyEarn.toFixed(6)}</b>/день
            </div>
          )}
        </div>

        {/* ─── Central TON coin ─── */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginBottom: 24, position: "relative", height: 160 }}>
          {/* Glow */}
          <div style={{
            position: "absolute", width: 220, height: 220, borderRadius: "50%",
            background: "radial-gradient(circle,rgba(37,99,235,0.25) 0%,transparent 70%)",
            pointerEvents: "none",
          }} />

          {/* TON Coin with official logo */}
          <div style={{
            width: 134, height: 134, borderRadius: "50%",
            background: "linear-gradient(145deg,#1e40af,#2563eb,#0ea5e9)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 70px rgba(37,99,235,0.55), 0 0 140px rgba(37,99,235,0.2), inset 0 2px 6px rgba(255,255,255,0.2)",
            position: "relative", zIndex: 1,
          }}>
            <TonLogo size={68} />
          </div>
        </div>

        {/* ─── Deposit / Withdraw ─── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <button
            onClick={() => { haptic("medium"); setShowDeposit(true); }}
            style={{
              padding: "18px 0", borderRadius: 18, border: "none", fontFamily: "inherit",
              background: "linear-gradient(135deg,#065f46,#059669)",
              color: "#fff", fontSize: 16, fontWeight: 900,
              cursor: "pointer", boxShadow: "0 0 28px rgba(16,185,129,0.4)",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            }}
          >
            <span style={{ fontSize: 24 }}>🔽</span>
            <span>Пополнить</span>
          </button>

          <button
            onClick={handleWithdraw}
            disabled={withdrawing || !hasPrincipal}
            style={{
              padding: "18px 0", borderRadius: 18, border: "none", fontFamily: "inherit",
              background: hasPrincipal ? "linear-gradient(135deg,#7f1d1d,#dc2626)" : "rgba(30,45,69,0.4)",
              color: hasPrincipal ? "#fff" : "#334155", fontSize: 16, fontWeight: 900,
              cursor: hasPrincipal ? "pointer" : "not-allowed",
              boxShadow: hasPrincipal ? "0 0 28px rgba(220,38,38,0.35)" : "none",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              opacity: withdrawing ? 0.7 : 1,
            }}
          >
            <span style={{ fontSize: 24 }}>🔼</span>
            <span>{withdrawing ? "…" : "Вывести"}</span>
          </button>
        </div>

        {/* ─── Start mining CTA if no investment but has TON ─── */}
        {!hasPrincipal && userTon > 0 && (
          <div style={{
            background: "linear-gradient(135deg,rgba(5,46,36,0.8),rgba(6,78,59,0.5))",
            border: "1px solid rgba(16,185,129,0.5)", borderRadius: 18, padding: "18px 16px",
            marginBottom: 16, textAlign: "center",
            boxShadow: "0 0 32px rgba(16,185,129,0.15)",
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🌱</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#4ade80", marginBottom: 6 }}>
              Запустите майнинг прямо сейчас!
            </div>
            <div style={{ fontSize: 12, color: "#6ee7b7", marginBottom: 14, lineHeight: 1.6 }}>
              У вас <b style={{ color: "#fbbf24" }}>{userTon.toFixed(4)} TON</b> на балансе.<br />
              Вложите их и получайте <b style={{ color: "#4ade80" }}>+{ratePerDay.toFixed(1)}% в день</b> автоматически.
            </div>
            <button
              onClick={() => { haptic("medium"); setShowDeposit(true); }}
              style={{
                padding: "14px 32px", borderRadius: 14, border: "none", fontFamily: "inherit",
                background: "linear-gradient(135deg,#065f46,#059669)",
                color: "#fff", fontSize: 15, fontWeight: 900, cursor: "pointer",
                boxShadow: "0 0 24px rgba(16,185,129,0.4)",
              }}
            >
              🚀 Начать майнинг
            </button>
          </div>
        )}

        {/* ─── Pool: Buy TONYX ─── */}
        <BuyTonyxPool telegramId={telegramId ?? ""} userTon={userTon} onRefresh={refreshAll} showToast={showToast} />
      </div>
    </div>
  );
}

/* ─── Buy TONYX from pool ─── */
function BuyTonyxPool({ telegramId, userTon, onRefresh, showToast }: {
  telegramId: string;
  userTon: number;
  onRefresh: () => void;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
}) {
  const [pool, setPool] = useState<{ sold: number; total: number; remaining: number; isMarketActive: boolean } | null>(null);
  const [buying, setBuying] = useState(false);
  const [tonInput, setTonInput] = useState("1");

  useEffect(() => {
    const load = () => fetch("/api/mini/market/pool")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPool(d); })
      .catch(() => {});
    load();
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, []);

  const handleBuy = async () => {
    const amt = parseFloat(tonInput) || 0;
    if (!telegramId || amt <= 0) return;
    haptic("medium");
    setBuying(true);
    try {
      const r = await fetch("/api/mini/market/reserve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, tonAmount: amt }),
      });
      const d = await r.json();
      if (!r.ok) { showToast(d.error ?? "Ошибка", "error"); return; }
      hapticNotify("success");
      showToast(d.message ?? `+${d.coins?.toLocaleString()} TONYX`, "success");
      onRefresh();
      const upd = await fetch("/api/mini/market/pool").then(x => x.ok ? x.json() : null);
      if (upd) setPool(upd);
    } catch { showToast("Ошибка сети", "error"); }
    finally { setBuying(false); }
  };

  if (!pool) return null;

  const pct = Math.min(100, (pool.sold / pool.total) * 100);
  const presets = [0.1, 0.5, 1, 5];
  const tonAmt = parseFloat(tonInput) || 0;

  return (
    <div style={{
      background: "rgba(15,23,42,0.85)", border: "1px solid rgba(30,58,143,0.35)",
      borderRadius: 20, padding: "16px 14px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#f1f5f9" }}>🪙 Купить TONYX</div>
        <div style={{ fontSize: 10, color: pool.isMarketActive ? "#4ade80" : "#fbbf24", fontWeight: 700 }}>
          {pool.isMarketActive ? "✅ P2P ОТКРЫТ" : `${pct.toFixed(1)}% до P2P рынка`}
        </div>
      </div>

      <div style={{ height: 6, borderRadius: 3, background: "rgba(30,45,69,0.8)", marginBottom: 8, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#1d4ed8,#22d3ee)", borderRadius: 3, transition: "width 0.6s" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#334155", marginBottom: 12 }}>
        <span>{pool.sold.toLocaleString()} продано</span>
        <span>{pool.remaining.toLocaleString()} осталось</span>
        <span>1000 TONYX/TON</span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {presets.map(p => (
          <button key={p} onClick={() => setTonInput(String(p))} style={{
            padding: "5px 10px", borderRadius: 8, border: "none", fontFamily: "inherit",
            background: tonAmt === p ? "rgba(37,99,235,0.6)" : "rgba(30,45,69,0.8)",
            color: tonAmt === p ? "#fff" : "#64748b", fontSize: 11, fontWeight: 700, cursor: "pointer",
          }}>{p} TON</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={tonInput} onChange={e => setTonInput(e.target.value)} type="number" step="0.01"
          placeholder="TON"
          style={{ flex: 1, background: "rgba(30,45,69,0.6)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 10, padding: "10px 12px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 13, outline: "none" }}
        />
        <button
          onClick={handleBuy}
          disabled={buying || tonAmt <= 0 || tonAmt > userTon}
          style={{
            padding: "10px 12px", borderRadius: 10, border: "none", fontFamily: "inherit",
            background: "linear-gradient(135deg,#1d4ed8,#2563eb)",
            color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
            opacity: (buying || tonAmt > userTon) ? 0.5 : 1,
          }}
        >
          {buying ? "…" : `→${Math.floor(tonAmt * 1000).toLocaleString()} TONYX`}
        </button>
      </div>
    </div>
  );
}
