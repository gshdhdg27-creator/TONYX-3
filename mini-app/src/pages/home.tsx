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

/* ─── Metallic 3-D "T" logo (photo, circular crop) ─── */
function MetallicT({ size = 80 }: { size?: number }) {
  return (
    <img
      src="/tonyx-logo.jpg"
      alt="TONYX"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        objectPosition: "center",
        display: "block",
      }}
    />
  );
}


/* ─── Boost Modal ─── */
function BoostModal({ packages, userTon, boostRate, purchasedPcts, onClose, onBuy }: {
  packages: BoostPkg[];
  userTon: number;
  boostRate: number;
  purchasedPcts: Set<number>;
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
        border: "1px solid rgba(0,162,255,0.25)", borderTopLeftRadius: 28, borderTopRightRadius: 28,
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
            const isPurchased = purchasedPcts.has(p.boostPct);
            const isSelected = selected === p.id;
            const canAfford = userTon >= p.costTon && !isPurchased;
            return (
              <button
                key={p.id}
                onClick={() => { if (!isPurchased && canAfford) { haptic("light"); setSelected(p.id); } }}
                disabled={isPurchased || !canAfford}
                style={{
                  background: isPurchased
                    ? "rgba(15,23,42,0.5)"
                    : isSelected
                      ? "linear-gradient(135deg,rgba(0,100,200,0.7),rgba(0,162,255,0.3))"
                      : "rgba(15,23,42,0.9)",
                  border: `1px solid ${isPurchased ? "rgba(100,116,139,0.3)" : isSelected ? "#00a2ff" : "rgba(0,162,255,0.25)"}`,
                  borderRadius: 14, padding: "12px 6px", textAlign: "center",
                  cursor: isPurchased ? "default" : canAfford ? "pointer" : "not-allowed",
                  opacity: isPurchased ? 0.55 : canAfford ? 1 : 0.4,
                  transition: "all 0.2s",
                  boxShadow: isSelected ? "0 0 16px rgba(0,162,255,0.35)" : "none",
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 4 }}>{isPurchased ? "✅" : p.emoji}</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: isPurchased ? "#4ade80" : "#e2e8f0" }}>{p.label}/день</div>
                <div style={{ fontSize: 8, color: "#475569", fontWeight: 700, margin: "3px 0", letterSpacing: "0.08em" }}>
                  {isPurchased ? "КУПЛЕНО" : "НАВСЕГДА"}
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: isPurchased ? "#475569" : "#fbbf24" }}>
                  {isPurchased ? "—" : `${p.costTon} TON`}
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => { haptic("medium"); handleBuy(); }}
          disabled={!selected || loading || (pkg ? userTon < pkg.costTon : true) || (pkg ? purchasedPcts.has(pkg.boostPct) : false)}
          style={{
            width: "100%", padding: "16px 0", borderRadius: 16, border: "none",
            fontFamily: "inherit", fontSize: 16, fontWeight: 900,
            background: selected && pkg && userTon >= pkg.costTon && !purchasedPcts.has(pkg.boostPct)
              ? "linear-gradient(135deg,#0064c8,#00a2ff)"
              : "rgba(0,100,200,0.15)",
            color: selected && pkg && userTon >= pkg.costTon && !purchasedPcts.has(pkg.boostPct) ? "#fff" : "#334155",
            cursor: selected && pkg && userTon >= pkg.costTon ? "pointer" : "not-allowed",
            boxShadow: selected && pkg && userTon >= pkg.costTon ? "0 0 24px rgba(0,162,255,0.4)" : "none",
          }}
        >
          {loading ? "⏳ Активация…" : selected && pkg
            ? purchasedPcts.has(pkg.boostPct) ? "✅ Уже куплено" : `💙 Купить за ${pkg.costTon} TON`
            : "Выберите буст"}
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
          onClick={() => { haptic("medium"); if (amt > 0 && amt <= userTon) { setLoading(true); onDeposit(amt).finally(() => setLoading(false)); } }}
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
          <div style={{ fontSize: 11, color: "#f87171", textAlign: "center", marginTop: 8 }}>Недостаточно TON</div>
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
  const [purchasedPcts, setPurchasedPcts] = useState<Set<number>>(new Set());
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

  const fetchPurchasedBoosts = useCallback(async () => {
    if (!telegramId) return;
    try {
      const r = await fetch(`/api/mini/boosts/${encodeURIComponent(telegramId)}`);
      if (r.ok) {
        const d = await r.json();
        const pcts = new Set<number>((d.boosts ?? []).map((b: { boostPct: number }) => b.boostPct));
        setPurchasedPcts(pcts);
      }
    } catch {}
  }, [telegramId]);

  useEffect(() => {
    fetchInv();
    fetchPurchasedBoosts();
    fetch("/api/mini/boosts/packages")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.packages) setBoostPkgs(d.packages); })
      .catch(() => {});
  }, [fetchInv, fetchPurchasedBoosts]);

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
    await Promise.all([fetchInv(), fetchPurchasedBoosts(), refetchProfile()]);
    qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId ?? "") });
  }, [fetchInv, fetchPurchasedBoosts, refetchProfile, telegramId, qc]);

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
  const [onlineUsers, setOnlineUsers] = useState(0);
  useEffect(() => {
    fetch("/api/mini/admin/online-count")
      .then(r => r.json())
      .then(d => { if (typeof d?.count === "number") setOnlineUsers(d.count); })
      .catch(() => {});
  }, []);

  return (
    <div style={{
      minHeight: "100%", position: "relative",
      background: "linear-gradient(180deg,#020817 0%,#0a0f1e 40%,#0f172a 100%)",
      overflow: "hidden",
    }}>
      <Stars />

      {toast && <Toast msg={toast.msg} type={toast.type} />}
      {showBoost && (
        <BoostModal
          packages={boostPkgs} userTon={userTon} boostRate={boostRate}
          purchasedPcts={purchasedPcts}
          onClose={() => setShowBoost(false)} onBuy={handleBuyBoost}
        />
      )}
      {showDeposit && (
        <DepositModal userTon={userTon} onClose={() => setShowDeposit(false)} onDeposit={handleDeposit} />
      )}

      <div style={{ position: "relative", zIndex: 1, padding: "16px 16px 100px" }}>

        {/* ─── Top bar ─── */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
            <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700 }}>{onlineUsers.toLocaleString()} онлайн</span>
          </div>
        </div>

        {/* ─── Rate bar + BOOST ─── */}
        <div data-tour="home-mining" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(15,23,42,0.7)", border: "1px solid rgba(0,162,255,0.12)",
          borderRadius: 14, padding: "10px 14px", marginBottom: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
              {[4, 7, 10, 13, 10].map((h, i) => (
                <div key={i} style={{ width: 3, height: h, background: i < 3 ? "#00a2ff" : "rgba(0,162,255,0.25)", borderRadius: 1 }} />
              ))}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#4ade80" }}>+{ratePerDay.toFixed(1)}% в день</div>
              <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.1em" }}>ДОХОДНОСТЬ</div>
            </div>
          </div>
          <button
            onClick={() => { haptic("light"); setShowBoost(true); }}
            style={{
              padding: "8px 18px", borderRadius: 10,
              border: "1px solid rgba(0,162,255,0.5)",
              background: "linear-gradient(135deg,rgba(0,80,160,0.6),rgba(0,162,255,0.2))",
              color: "#7dd3fc", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 6,
              boxShadow: "0 0 12px rgba(0,162,255,0.2)",
            }}
          >
            🚀 БУСТ
          </button>
        </div>

        {/* ─── Mining status ─── */}
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.15em", fontWeight: 700 }}>
            {hasPrincipal ? "ТЕКУЩИЙ ДОХОД" : "МАЙНИНГ АКТИВЕН"}
          </div>
        </div>

        {/* ─── Live counter ─── */}
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <div style={{
            fontSize: 34, fontWeight: 900, color: "#f1f5f9",
            fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em",
            textShadow: "0 0 32px rgba(0,162,255,0.5)",
            fontFamily: "monospace",
          }}>
            {animMined.toFixed(9)}
            <span style={{ fontSize: 15, color: "#00a2ff", marginLeft: 8, fontFamily: "inherit" }}>TON</span>
          </div>
          {hasPrincipal && (
            <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
              Вложено: <b style={{ color: "#a5f3fc" }}>{inv!.principal.toFixed(4)} TON</b>{" · +"}<b style={{ color: "#4ade80" }}>{dailyEarn.toFixed(6)}</b>/день
            </div>
          )}
        </div>

        {/* ─── Central logo photo ─── */}
        <div style={{
          display: "flex", justifyContent: "center", alignItems: "center",
          marginBottom: 32, position: "relative", height: 260,
        }}>
          {/* outer ambient glow matching the photo's neon ring */}
          <div style={{
            position: "absolute", width: 380, height: 380, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(0,162,255,0.13) 0%, transparent 62%)",
            pointerEvents: "none",
          }} />

          {/* outer neon ring wrapper — box-shadow здесь, чтобы webkit-mask не срезал свечение */}
          <div style={{
            borderRadius: "50%",
            position: "relative", zIndex: 1,
            flexShrink: 0,
            border: "2.5px solid rgba(0,162,255,0.9)",
            boxShadow: [
              "0 0 10px #00a2ff",
              "0 0 28px rgba(0,162,255,0.75)",
              "0 0 55px rgba(0,162,255,0.40)",
              "0 0 90px rgba(0,162,255,0.18)",
            ].join(", "),
          }}>
            {/* inner clip container */}
            <div style={{
              width: 250, height: 250,
              borderRadius: "50%",
              overflow: "hidden",
              transform: "translateZ(0)",
              WebkitMaskImage: "-webkit-radial-gradient(white, black)",
            }}>
              <img
                src="/tonyx-logo.jpg"
                alt="TONYX"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center 85%",
                  display: "block",
                  transform: "scale(1.52)",
                  transformOrigin: "center center",
                }}
              />
            </div>
          </div>
        </div>

        {/* ─── Deposit / Withdraw ─── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <button
            onClick={() => { haptic("medium"); setShowDeposit(true); }}
            style={{
              padding: "12px 0", borderRadius: 14, border: "none", fontFamily: "inherit",
              background: "linear-gradient(135deg,#065f46,#059669)",
              color: "#fff", fontSize: 14, fontWeight: 800,
              cursor: "pointer", boxShadow: "0 0 18px rgba(16,185,129,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 56 56" fill="none">
              <circle cx="28" cy="28" r="28" fill="#0098EA"/>
              <path d="M36.8 15H19.2c-3.3 0-5.3 3.7-3.4 6.4l10 14.8c1.4 2 4.2 2 5.6 0l10-14.8c1.9-2.7-.1-6.4-3.6-6.4z" fill="white"/>
            </svg>
            <span>Пополнить</span>
          </button>

          <button
            onClick={handleWithdraw}
            disabled={withdrawing || !hasPrincipal}
            style={{
              padding: "12px 0", borderRadius: 14, border: "none", fontFamily: "inherit",
              background: hasPrincipal ? "linear-gradient(135deg,#7f1d1d,#dc2626)" : "rgba(30,45,69,0.4)",
              color: hasPrincipal ? "#fff" : "#334155", fontSize: 14, fontWeight: 800,
              cursor: hasPrincipal ? "pointer" : "not-allowed",
              boxShadow: hasPrincipal ? "0 0 18px rgba(220,38,38,0.3)" : "none",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              opacity: withdrawing ? 0.7 : 1,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 56 56" fill="none" style={{ transform: "rotate(180deg)" }}>
              <circle cx="28" cy="28" r="28" fill={hasPrincipal ? "#fff" : "#475569"}/>
              <path d="M36.8 15H19.2c-3.3 0-5.3 3.7-3.4 6.4l10 14.8c1.4 2 4.2 2 5.6 0l10-14.8c1.9-2.7-.1-6.4-3.6-6.4z" fill={hasPrincipal ? "#dc2626" : "#1e293b"}/>
            </svg>
            <span>{withdrawing ? "…" : "Вывести"}</span>
          </button>
        </div>


      </div>
    </div>
  );
}
