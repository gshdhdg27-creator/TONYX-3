import { useState, useEffect, useCallback, useRef } from "react";
import { useGetUserProfile } from "@workspace/api-client-react";
import { useTelegram, haptic, hapticNotify } from "@/lib/telegram";
import { useLang } from "@/lib/LanguageContext";

/* ══════════════════════════════════════════════
   CONSTANTS & TYPES
══════════════════════════════════════════════ */
const RATE = 1000;      // 1 TON = 1000 TONYX

type Tier = "start" | "base" | "pro" | "elite";
type MainTab = "market" | "mine";
type TierFilter = "all" | Tier;

const TIER_CFG = {
  start: { label: "START", range: "3–10 TON",   min: 3,   max: 10,       bonusPct: 1.4, bonusLabel: "+1.4%", minPartialBuy: 1,  color: "#22d3ee", bg: "rgba(6,182,212,0.12)",  border: "rgba(6,182,212,0.3)"   },
  base:  { label: "BASE",  range: "10–50 TON",  min: 10,  max: 50,       bonusPct: 1.7, bonusLabel: "+1.7%", minPartialBuy: 10, color: "#60a5fa", bg: "rgba(37,99,235,0.12)",  border: "rgba(96,165,250,0.3)"  },
  pro:   { label: "PRO",   range: "50–100 TON", min: 50,  max: 100,      bonusPct: 2,   bonusLabel: "+2%",   minPartialBuy: 25, color: "#a78bfa", bg: "rgba(109,40,217,0.12)", border: "rgba(167,139,250,0.3)" },
  elite: { label: "ELITE", range: "100+ TON",   min: 100, max: Infinity, bonusPct: 2.5, bonusLabel: "+2.5%", minPartialBuy: 50, color: "#fbbf24", bg: "rgba(180,83,9,0.15)",   border: "rgba(251,191,36,0.35)" },
} as const;

function detectTier(ton: number): Tier | null {
  if (ton >= 3   && ton <= 10)  return "start";
  if (ton > 10   && ton <= 50)  return "base";
  if (ton > 50   && ton <= 100) return "pro";
  if (ton > 100)                return "elite";
  return null;
}

interface Order {
  id: number;
  sellerId: string;
  sellerUsername: string | null;
  amount: number;
  pricePerCoin: number;
  totalTon: number;
  category: Tier;
  bonusPct: number;
  bonusCoins: number;
  returnTon: number;
  minPartialBuy: number;
  status: string;
  buyerId: string | null;
  createdAt: string;
}

interface MarketStats {
  inOrdersTon: number;
  volume24h: number;
  avgProfit: number;
  openCount: number;
}

/* ══════════════════════════════════════════════
   LIVE TICKER EVENTS
══════════════════════════════════════════════ */
const LIVE_EVENTS_RU = [
  "Alex купил 500 TONYX · 10 TON · START",
  "Maria выкупила ордер BASE · 1500 TONYX · 30 TON",
  "Dmitry получил +3% бонус · ELITE · 100 TON",
  "Ivan создал ордер PRO · 2500 TONYX · 50 TON",
  "Olga купила 250 TONYX · 5 TON · START",
  "Sergey выкупил ордер BASE · 3000 TONYX · 60 TON",
  "Anna получила +1% бонус · BASE · 25 TON",
];
const LIVE_EVENTS_EN = [
  "Alex bought 500 TONYX · 10 TON · START",
  "Maria filled BASE order · 1500 TONYX · 30 TON",
  "Dmitry earned +3% bonus · ELITE · 100 TON",
  "Ivan created PRO offer · 2500 TONYX · 50 TON",
  "Olga bought 250 TONYX · 5 TON · START",
  "Sergey filled BASE order · 3000 TONYX · 60 TON",
  "Anna earned +1% bonus · BASE · 25 TON",
];

/* ══════════════════════════════════════════════
   SMALL REUSABLE COMPONENTS
══════════════════════════════════════════════ */
function Toast({ msg, type }: { msg: string; type: "success" | "error" | "info" }) {
  const bg = type === "success" ? "rgba(22,163,74,0.97)" : type === "error" ? "rgba(220,38,38,0.97)" : "rgba(30,64,175,0.97)";
  return (
    <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: bg, color: "#fff", padding: "12px 20px", borderRadius: 14, fontSize: 14, fontWeight: 700, zIndex: 9999, maxWidth: "calc(100% - 32px)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", whiteSpace: "nowrap" }}>
      {msg}
    </div>
  );
}

function Avatar({ name, size = 42 }: { name: string; size?: number }) {
  const initials = (name ?? "?").slice(0, 2).toUpperCase();
  const palette = ["#1d4ed8","#dc2626","#15803d","#b45309","#6d28d9","#0e7490","#be185d","#0369a1"];
  const idx = (name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % palette.length;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `radial-gradient(circle at 30% 30%, ${palette[idx]}cc, ${palette[idx]})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.36, fontWeight: 800, color: "#fff", flexShrink: 0, border: "2px solid rgba(255,255,255,0.12)", boxShadow: `0 2px 8px ${palette[idx]}60` }}>
      {initials}
    </div>
  );
}

function TierBadge({ tier }: { tier: Tier }) {
  const c = TIER_CFG[tier];
  return (
    <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 6, background: c.bg, color: c.color, fontSize: 9, fontWeight: 900, letterSpacing: "0.12em", border: `1px solid ${c.border}` }}>
      {c.label}
    </span>
  );
}

function InfoCell({ label, value, unit, color = "#e2e8f0", highlight = false }: { label: string; value: string; unit: string; color?: string; highlight?: boolean }) {
  return (
    <div style={{ background: highlight ? "rgba(30,58,143,0.2)" : "rgba(15,28,55,0.7)", border: highlight ? "1px solid rgba(96,165,250,0.2)" : "1px solid rgba(30,45,80,0.6)", borderRadius: 11, padding: "9px 10px" }}>
      <div style={{ fontSize: 8, color: "#475569", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 900, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 9, color: "#4a5568", marginTop: 1 }}>{unit}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   ORDER CARD
══════════════════════════════════════════════ */
function OrderCard({ order, isMine, onBuy, onCancel, buying, cancelling, t }: {
  order: Order; isMine: boolean;
  onBuy: (o: Order) => void; onCancel: (id: number) => void;
  buying: boolean; cancelling: boolean;
  t: ReturnType<typeof useLang>["t"]["market"];
}) {
  const tier = TIER_CFG[order.category] ?? TIER_CFG.start;
  const profit = Math.max(0, order.returnTon - order.totalTon);
  const sellerName = order.sellerUsername ?? `user_${order.sellerId.slice(-5)}`;

  return (
    <div style={{ background: "linear-gradient(160deg, rgba(10,18,40,0.99) 0%, rgba(15,25,52,0.97) 100%)", border: `1px solid ${tier.border}`, borderRadius: 20, padding: "15px 14px 14px", marginBottom: 12, boxShadow: `0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)` }}>

      {/* Row 1: Avatar + name + tier + LIVE badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Avatar name={sellerName} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>@{sellerName}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
            <TierBadge tier={order.category} />
            <span style={{ fontSize: 9, color: "#64748b" }}>{tier.range}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, padding: "3px 8px" }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 5px #22c55e" }} />
          <span style={{ fontSize: 9, color: "#22c55e", fontWeight: 800, letterSpacing: "0.08em" }}>LIVE</span>
        </div>
      </div>

      {/* Row 2: Green profit block + partial buy badge */}
      <div style={{ background: "linear-gradient(135deg, rgba(22,163,74,0.13), rgba(34,197,94,0.06))", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 14, padding: "10px 14px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 9, color: "#16a34a", fontWeight: 800, letterSpacing: "0.12em", marginBottom: 3 }}>{t.cardNetProfit}</div>
          <div style={{ fontSize: 19, fontWeight: 900, color: "#4ade80", lineHeight: 1 }}>+{profit.toFixed(3)} TON</div>
        </div>
        <div style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8, padding: "4px 10px", textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#fbbf24", whiteSpace: "nowrap" }}>{t.cardPartialBuy(tier.minPartialBuy)}</div>
        </div>
      </div>

      {/* Row 3: 3 info cells */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
        <InfoCell label={t.cardPay}     value={order.totalTon.toFixed(2)} unit="TON" />
        <InfoCell label={t.cardReceive} value={order.bonusCoins.toLocaleString()} unit="TONYX" color="#60a5fa" highlight />
        <InfoCell label={t.cardReturn}  value={order.returnTon.toFixed(3)} unit="TON" color="#22d3ee" />
      </div>

      {/* Row 4: Action button */}
      {order.status === "open" && (
        isMine ? (
          <button onClick={() => onCancel(order.id)} disabled={cancelling} style={{ width: "100%", padding: "11px 0", borderRadius: 11, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(220,38,38,0.08)", color: "#f87171", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: cancelling ? "not-allowed" : "pointer", opacity: cancelling ? 0.7 : 1 }}>
            {cancelling ? t.cardCancelling : t.cardCancelBtn}
          </button>
        ) : (
          <button onClick={() => { haptic("medium"); onBuy(order); }} disabled={buying} style={{ width: "100%", padding: "13px 0", borderRadius: 11, border: "none", background: buying ? "rgba(37,99,235,0.4)" : "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", fontSize: 14, fontWeight: 800, fontFamily: "inherit", cursor: buying ? "not-allowed" : "pointer", boxShadow: buying ? "none" : "0 0 24px rgba(59,130,246,0.4)", transition: "all 0.2s" }}>
            {buying ? t.cardProcessing : `${t.cardBuyBtn} · ${order.totalTon.toFixed(2)} TON`}
          </button>
        )
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════
   CREATE ORDER MODAL
══════════════════════════════════════════════ */
function CreateOrderModal({ onClose, telegramId, tonyxBalance, onCreated, t }: {
  onClose: () => void; telegramId: string; tonyxBalance: number; onCreated: () => void;
  t: ReturnType<typeof useLang>["t"]["market"];
}) {
  const [tonInput, setTonInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);

  const flash = (msg: string, type: "success" | "error" | "info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); };

  const tonNum    = parseFloat(tonInput) || 0;
  const tier      = detectTier(tonNum);
  const escrow    = Math.floor(tonNum * RATE);    // TONYX locked
  const bonusPct  = tier ? TIER_CFG[tier].bonusPct : 0;
  const buyerGets = tier ? Math.floor(escrow * (1 + bonusPct / 100)) : 0;
  const profit    = tier ? parseFloat(((buyerGets / RATE) - tonNum).toFixed(4)) : 0;
  const tierCfg   = tier ? TIER_CFG[tier] : null;
  const hasEnough = escrow <= tonyxBalance;
  const canCreate = !!tier && tonNum >= 3 && hasEnough && !loading;

  const QUICK_AMOUNTS = [3, 10, 50, 100];

  const submit = async () => {
    if (!canCreate) return;
    haptic("medium");
    setLoading(true);
    try {
      const r = await fetch("/api/mini/market/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, tonAmount: tonNum }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error || "Ошибка", "error"); }
      else { hapticNotify("success"); onCreated(); onClose(); }
    } catch { flash(t.errNetwork, "error"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "flex-end", zIndex: 500 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ width: "100%", background: "linear-gradient(180deg,#0d1526 0%,#0a1020 100%)", border: "1px solid rgba(30,58,143,0.4)", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "20px 16px 36px", maxHeight: "90dvh", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#f1f5f9" }}>{t.createTitle}</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#94a3b8", fontSize: 18, width: 32, height: 32, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>×</button>
        </div>

        {/* Rate badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8, padding: "4px 12px", marginBottom: 16 }}>
          <span style={{ fontSize: 10, color: "#fbbf24", fontWeight: 800, letterSpacing: "0.1em" }}>{t.createRateLabel}:</span>
          <span style={{ fontSize: 12, color: "#fde68a", fontWeight: 900 }}>{t.createRate}</span>
        </div>

        {/* Balance row */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, background: "rgba(30,45,80,0.5)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 10, padding: "8px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 2 }}>TONYX</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#60a5fa" }}>{tonyxBalance.toLocaleString()}</div>
          </div>
          <div style={{ flex: 1, background: "rgba(30,45,80,0.5)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 10, padding: "8px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 2 }}>{t.createEscrow}</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: escrow > tonyxBalance ? "#f87171" : "#e2e8f0" }}>{escrow.toLocaleString()}</div>
          </div>
        </div>

        {/* TON Amount input */}
        <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>{t.createTonLabel}</div>
        <div style={{ display: "flex", gap: 5, marginBottom: 8, flexWrap: "wrap" }}>
          {QUICK_AMOUNTS.map(v => {
            const qtier = detectTier(v);
            const qcfg = qtier ? TIER_CFG[qtier] : null;
            const active = tonNum === v;
            return (
              <button key={v} onClick={() => setTonInput(String(v))} style={{ flex: "none", padding: "6px 12px", borderRadius: 8, border: active ? `1px solid ${qcfg?.color ?? "#60a5fa"}` : "1px solid rgba(30,58,143,0.35)", background: active ? (qcfg?.bg ?? "rgba(37,99,235,0.2)") : "rgba(15,25,50,0.6)", color: active ? (qcfg?.color ?? "#60a5fa") : "#475569", fontSize: 12, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>
                {v} TON
              </button>
            );
          })}
        </div>
        <input
          value={tonInput}
          onChange={e => setTonInput(e.target.value)}
          type="number"
          min="3"
          placeholder={t.createTonPlaceholder}
          style={{ width: "100%", background: "rgba(15,25,55,0.7)", border: `1px solid ${tier ? TIER_CFG[tier].border : "rgba(30,58,143,0.4)"}`, borderRadius: 12, padding: "12px 14px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 16, outline: "none", boxSizing: "border-box", marginBottom: 14, transition: "border-color 0.2s" }}
        />

        {/* Tier auto-detect */}
        {tonNum > 0 && (
          <div style={{ marginBottom: 14 }}>
            {tier ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: TIER_CFG[tier].bg, border: `1px solid ${TIER_CFG[tier].border}`, borderRadius: 12, padding: "10px 14px" }}>
                <div>
                  <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 2 }}>{t.createTierDetect}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <TierBadge tier={tier} />
                    <span style={{ fontSize: 12, color: TIER_CFG[tier].color, fontWeight: 800 }}>{TIER_CFG[tier].bonusLabel} бонус</span>
                    <span style={{ fontSize: 11, color: "#64748b" }}>{TIER_CFG[tier].range}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "#f87171" }}>
                ⚠️ {t.createNoTier}
              </div>
            )}
          </div>
        )}

        {/* Preview grid */}
        {tier && tonNum >= 3 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {[
              { label: t.createEscrow,  val: `${escrow.toLocaleString()} TONYX`, color: escrow > tonyxBalance ? "#f87171" : "#e2e8f0" },
              { label: t.createReceive, val: `${buyerGets.toLocaleString()} TONYX`, color: "#4ade80" },
              { label: t.createBonus,   val: TIER_CFG[tier].bonusLabel, color: TIER_CFG[tier].color },
              { label: t.createBuyerProfit, val: `+${profit} TON`, color: "#4ade80" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: "rgba(10,20,45,0.8)", border: "1px solid rgba(30,45,80,0.6)", borderRadius: 10, padding: "9px 11px" }}>
                <div style={{ fontSize: 8, color: "#334155", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 900, color }}>{val}</div>
              </div>
            ))}
          </div>
        )}

        {/* Insufficient warning */}
        {tier && !hasEnough && (
          <div style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#f87171" }}>
            {t.createInsufficient}: нужно {escrow.toLocaleString()}, есть {tonyxBalance.toLocaleString()}
          </div>
        )}

        {/* Submit */}
        <button onClick={submit} disabled={!canCreate} style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", fontFamily: "inherit", background: canCreate ? `linear-gradient(135deg, ${tierCfg?.color ?? "#3b82f6"}60, #1d4ed8)` : "rgba(30,45,80,0.3)", color: canCreate ? "#fff" : "#334155", fontSize: 16, fontWeight: 900, cursor: canCreate ? "pointer" : "not-allowed", boxShadow: canCreate ? `0 0 28px ${tierCfg?.color ?? "#3b82f6"}40` : "none", transition: "all 0.2s" }}>
          {loading ? t.createCreating : t.createConfirm}
        </button>

        <div style={{ fontSize: 10, color: "#1e3a8a", textAlign: "center", marginTop: 10 }}>{t.createLimitNote}</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   BUY ORDER MODAL
══════════════════════════════════════════════ */
function BuyOrderModal({ order, onClose, telegramId, tonBalance, onBought, t }: {
  order: Order; onClose: () => void; telegramId: string; tonBalance: number; onBought: () => void;
  t: ReturnType<typeof useLang>["t"]["market"];
}) {
  const tier        = TIER_CFG[order.category] ?? TIER_CFG.start;
  const minBuy      = tier.minPartialBuy;
  const totalTon    = order.totalTon;
  // Max amount for a valid partial buy — remainder must stay ≥ minBuy
  const maxPartial  = parseFloat((totalTon - minBuy).toFixed(8));
  // Partial buy is only possible when there is a valid range: minBuy ≤ X ≤ maxPartial
  const canPartial  = maxPartial >= minBuy;

  // Unique key per modal instance — reused on retry, new key on next open (prevents double-spend)
  const idemKeyRef = useRef<string>(crypto.randomUUID());

  const [rawInput, setRawInput] = useState(String(totalTon));
  const [loading, setLoading]   = useState(false);
  const [toast, setToast]       = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const flash = (msg: string, type: "success" | "error" | "info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); };

  // Derive valid buy amount from raw input (always safe)
  const parsed    = parseFloat(rawInput) || 0;
  const buyAmount = (() => {
    if (!canPartial || parsed >= totalTon) return totalTon;
    if (parsed <= minBuy)                  return minBuy;
    if (parsed > maxPartial)               return maxPartial; // forbidden zone → snap
    return parsed;
  })();

  const isFullBuy      = buyAmount >= totalTon;
  const RATE           = 1000;
  const escrowTonyx    = Math.floor(buyAmount * RATE);
  const estimatedTonyx = Math.floor(escrowTonyx * (1 + tier.bonusPct / 100));
  const estimatedReturn= parseFloat((estimatedTonyx / RATE).toFixed(4));
  const estimatedProfit= parseFloat(Math.max(0, estimatedReturn - buyAmount).toFixed(4));
  const remaining      = isFullBuy ? 0 : parseFloat((totalTon - buyAmount).toFixed(4));
  const hasEnough      = tonBalance >= buyAmount;
  const canConfirm     = hasEnough && !loading && buyAmount > 0;
  const sellerName     = order.sellerUsername ?? `user_${order.sellerId.slice(-5)}`;

  // Auto-correction rules applied on every keystroke
  const handleInput = (val: string) => {
    const num = parseFloat(val);
    if (val === "" || isNaN(num)) { setRawInput(val); return; }
    if (!canPartial || num >= totalTon)  { setRawInput(String(totalTon)); return; }
    if (num < minBuy)                    { setRawInput(String(minBuy)); return; }
    if (num > maxPartial)                { setRawInput(String(maxPartial)); return; } // forbidden → snap to maxPartial
    setRawInput(val);
  };

  const confirm = async () => {
    if (!canConfirm) return;
    haptic("medium");
    setLoading(true);
    try {
      const r = await fetch(`/api/mini/market/orders/${order.id}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, tonAmount: buyAmount, idempotencyKey: idemKeyRef.current }),
      });
      const d = await r.json();
      if (!r.ok) { flash(d.error || "Ошибка", "error"); }
      else {
        hapticNotify("success");
        flash(t.toastBought(d.bonusCoins ?? estimatedTonyx, tier.bonusPct), "success");
        setTimeout(() => { onBought(); onClose(); }, 1200);
      }
    } catch { flash(t.errNetwork, "error"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", display: "flex", alignItems: "flex-end", zIndex: 500 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ width: "100%", background: "linear-gradient(180deg,#0d1526 0%,#0a1020 100%)", border: "1px solid rgba(30,58,143,0.4)", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "20px 16px 36px", maxHeight: "92dvh", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#f1f5f9" }}>{t.buyTitle}</div>
            <div style={{ padding: "3px 10px", borderRadius: 6, fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", background: isFullBuy ? "rgba(37,99,235,0.2)" : "rgba(251,191,36,0.13)", color: isFullBuy ? "#60a5fa" : "#fbbf24", border: `1px solid ${isFullBuy ? "rgba(96,165,250,0.3)" : "rgba(251,191,36,0.3)"}` }}>
              {isFullBuy ? t.buyModeFull : t.buyModePartial}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#94a3b8", fontSize: 18, width: 32, height: 32, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>×</button>
        </div>

        {/* Seller row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(15,28,55,0.7)", border: "1px solid rgba(30,45,80,0.6)", borderRadius: 14, padding: "10px 14px", marginBottom: 14 }}>
          <Avatar name={sellerName} size={36} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 2 }}>{t.buyFrom}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0" }}>@{sellerName}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 3 }}>{t.buyTier}</div>
            <TierBadge tier={order.category} />
          </div>
        </div>

        {/* Amount input */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, letterSpacing: "0.1em" }}>{t.buyAmountLabel}</div>
            <div style={{ fontSize: 9, color: "#334155" }}>
              {t.buyMinHint(minBuy)}{canPartial ? ` · ${t.buyMaxPartialHint(maxPartial)}` : ` · ${t.buyFullOnly}`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              value={rawInput}
              onChange={e => handleInput(e.target.value)}
              onBlur={e => { const n = parseFloat(e.target.value); if (!n || n <= 0) setRawInput(String(minBuy)); }}
              min={minBuy}
              max={totalTon}
              step="any"
              style={{ flex: 1, background: "rgba(15,25,55,0.8)", border: `1px solid ${hasEnough ? tier.border : "rgba(248,113,113,0.5)"}`, borderRadius: 12, padding: "12px 14px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 16, fontWeight: 800, outline: "none", boxSizing: "border-box" as const }}
            />
            <button
              onClick={() => { haptic("light"); setRawInput(String(totalTon)); }}
              style={{ padding: "0 18px", borderRadius: 12, border: "1px solid rgba(96,165,250,0.4)", background: "rgba(37,99,235,0.18)", color: "#60a5fa", fontSize: 13, fontWeight: 900, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap" as const }}
            >
              MAX
            </button>
          </div>
          {/* Quick-select buttons — only when partial buy is meaningful */}
          {canPartial && (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button onClick={() => { haptic("light"); setRawInput(String(minBuy)); }} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid rgba(30,45,80,0.5)", background: !isFullBuy && Math.abs(buyAmount - minBuy) < 0.001 ? "rgba(37,99,235,0.2)" : "rgba(10,18,40,0.8)", color: !isFullBuy && Math.abs(buyAmount - minBuy) < 0.001 ? "#60a5fa" : "#475569", fontSize: 10, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>
                {t.buyMinBtn(minBuy)} TON
              </button>
              {maxPartial > minBuy && (
                <button onClick={() => { haptic("light"); setRawInput(String(maxPartial)); }} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid rgba(30,45,80,0.5)", background: !isFullBuy && Math.abs(buyAmount - maxPartial) < 0.001 ? "rgba(251,191,36,0.15)" : "rgba(10,18,40,0.8)", color: !isFullBuy && Math.abs(buyAmount - maxPartial) < 0.001 ? "#fbbf24" : "#475569", fontSize: 10, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>
                  {t.buyMaxPartialBtn(maxPartial)} TON
                </button>
              )}
            </div>
          )}
        </div>

        {/* Deal preview grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          <div style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 12, padding: "11px 12px" }}>
            <div style={{ fontSize: 9, color: "#f87171", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>{t.buyPayLabel}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fca5a5" }}>{buyAmount.toFixed(2)}</div>
            <div style={{ fontSize: 10, color: "#f87171" }}>TON</div>
          </div>
          <div style={{ background: tier.bg, border: `1px solid ${tier.border}`, borderRadius: 12, padding: "11px 12px" }}>
            <div style={{ fontSize: 9, color: tier.color, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>{t.buyReceiveLabel}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#f1f5f9" }}>{estimatedTonyx.toLocaleString()}</div>
            <div style={{ fontSize: 10, color: tier.color }}>TONYX {tier.bonusLabel}</div>
          </div>
        </div>

        {/* Profit + Return + Remaining */}
        <div style={{ background: "linear-gradient(135deg, rgba(22,163,74,0.12), rgba(34,197,94,0.06))", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: "#16a34a", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 3 }}>{t.buyProfitLabel}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#4ade80" }}>+{estimatedProfit.toFixed(4)} TON</div>
          </div>
          <div style={{ paddingTop: 8, borderTop: "1px solid rgba(34,197,94,0.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "#475569", fontWeight: 700, letterSpacing: "0.08em" }}>{t.buyReturnLabel}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#22d3ee" }}>{estimatedReturn.toFixed(4)} TON</span>
          </div>
          {!isFullBuy && (
            <div style={{ paddingTop: 8, marginTop: 8, borderTop: "1px solid rgba(34,197,94,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "#475569", fontWeight: 700, letterSpacing: "0.08em" }}>{t.buyRemainingLabel}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#fbbf24" }}>{remaining.toFixed(4)} TON</span>
            </div>
          )}
        </div>

        {/* Balance warning */}
        {!hasEnough && (
          <div style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#f87171" }}>
            {t.buyInsufficient(tonBalance, buyAmount)}
          </div>
        )}

        {/* Confirm button */}
        <button
          onClick={confirm}
          disabled={!canConfirm}
          style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", fontFamily: "inherit", background: !canConfirm ? "rgba(30,45,80,0.3)" : isFullBuy ? "linear-gradient(135deg,#1d4ed8,#3b82f6)" : "linear-gradient(135deg,#92400e,#d97706)", color: !canConfirm ? "#334155" : "#fff", fontSize: 16, fontWeight: 900, cursor: !canConfirm ? "not-allowed" : "pointer", boxShadow: canConfirm ? (isFullBuy ? "0 0 28px rgba(59,130,246,0.4)" : "0 0 20px rgba(217,119,6,0.4)") : "none" }}
        >
          {loading ? t.buyProcessing : (isFullBuy ? t.buyConfirm : t.buyConfirmPartial(buyAmount))}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   TICKER
══════════════════════════════════════════════ */
function LiveTicker({ lang }: { lang: string }) {
  const events = lang === "en" ? LIVE_EVENTS_EN : LIVE_EVENTS_RU;
  const tickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = tickerRef.current;
    if (!el) return;
    let pos = 0;
    const speed = 0.5;
    const step = () => {
      pos -= speed;
      if (Math.abs(pos) >= el.scrollWidth / 2) pos = 0;
      el.style.transform = `translateX(${pos}px)`;
      requestAnimationFrame(step);
    };
    const raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const text = [...events, ...events].join("  ·  ");

  return (
    <div style={{ background: "rgba(22,163,74,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10, padding: "6px 0", marginBottom: 12, overflow: "hidden", display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4, padding: "0 10px", borderRight: "1px solid rgba(34,197,94,0.2)" }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 5px #22c55e" }} />
        <span style={{ fontSize: 9, color: "#22c55e", fontWeight: 800, letterSpacing: "0.12em" }}>LIVE</span>
      </div>
      <div style={{ overflow: "hidden", flex: 1 }}>
        <div ref={tickerRef} style={{ display: "inline-block", whiteSpace: "nowrap", fontSize: 10, color: "#4ade80", fontWeight: 600 }}>
          {text}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════ */
export default function MarketPage() {
  const { telegramId } = useTelegram();
  const { t, lang } = useLang();
  const m = t.market;

  const [tab, setTab]                 = useState<MainTab>("market");
  const [tierFilter, setTierFilter]   = useState<TierFilter>("all");
  const [showCreate, setShowCreate]   = useState(false);
  const [buyOrder, setBuyOrder]       = useState<Order | null>(null);
  const [toast, setToast]             = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [allOrders, setAllOrders]     = useState<Order[]>([]);
  const [myOrders, setMyOrders]       = useState<Order[]>([]);
  const [stats, setStats]             = useState<MarketStats>({ inOrdersTon: 0, volume24h: 0, avgProfit: 1.5, openCount: 0 });
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [buyingId, setBuyingId]       = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const flash = (msg: string, type: "success" | "error" | "info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const { data: profile, refetch: refetchProfile } = useGetUserProfile(telegramId ?? "", (
    { query: { enabled: !!telegramId, refetchInterval: 8000 } } as Parameters<typeof useGetUserProfile>[1]
  ));

  const tonyxBalance = (profile as { tonyxCoins?: number } | undefined)?.tonyxCoins ?? 0;
  const tonBalance   = Number((profile as { ton?: string | number } | undefined)?.ton ?? 0);

  const fetchOrders = useCallback(async (filter: TierFilter) => {
    setOrdersLoading(true);
    try {
      const url = filter === "all" ? "/api/mini/market/orders" : `/api/mini/market/orders?category=${filter}`;
      const r = await fetch(url);
      if (r.ok) { const d = await r.json(); setAllOrders(d.orders ?? []); }
    } catch { /* silent */ }
    finally { setOrdersLoading(false); }
  }, []);

  const fetchMyOrders = useCallback(async () => {
    if (!telegramId) return;
    try {
      const r = await fetch(`/api/mini/market/orders/mine?telegramId=${telegramId}`);
      if (r.ok) { const d = await r.json(); setMyOrders(d.orders ?? []); }
    } catch { /* silent */ }
  }, [telegramId]);

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch("/api/mini/market/stats");
      if (r.ok) { const d = await r.json(); setStats(d); }
    } catch { /* silent */ }
  }, []);

  const refreshAll = useCallback(() => {
    fetchOrders(tierFilter); fetchMyOrders(); fetchStats(); refetchProfile();
  }, [fetchOrders, fetchMyOrders, fetchStats, refetchProfile, tierFilter]);

  useEffect(() => { fetchOrders(tierFilter); fetchStats(); }, [tierFilter]);
  useEffect(() => { fetchMyOrders(); }, [telegramId]);
  useEffect(() => {
    const iv = setInterval(() => { fetchOrders(tierFilter); fetchStats(); }, 8000);
    return () => clearInterval(iv);
  }, [tierFilter]);

  const handleBuy = (order: Order) => { setBuyOrder(order); };
  const handleBuyConfirmed = () => { refreshAll(); setBuyOrder(null); };

  const handleCancel = async (id: number) => {
    if (!telegramId) return;
    haptic("medium"); setCancellingId(id);
    try {
      const r = await fetch(`/api/mini/market/orders/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ telegramId }) });
      const d = await r.json();
      if (!r.ok) { flash(d.error || "Ошибка", "error"); }
      else { hapticNotify("success"); flash(m.toastCancelled, "info"); refreshAll(); }
    } catch { flash(m.errNetwork, "error"); }
    finally { setCancellingId(null); }
  };

  const displayOrders = tab === "mine"
    ? myOrders
    : allOrders.filter(o => o.status === "open");

  const TIERS: { key: TierFilter; label: string }[] = [
    { key: "all",   label: m.filterAll  },
    { key: "start", label: m.tierStart  },
    { key: "base",  label: m.tierBase   },
    { key: "pro",   label: m.tierPro    },
    { key: "elite", label: m.tierElite  },
  ];

  return (
    <div style={{ padding: "0 0 90px", minHeight: "100%" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Modals */}
      {showCreate && telegramId && (
        <CreateOrderModal telegramId={telegramId} tonyxBalance={tonyxBalance} onClose={() => setShowCreate(false)} onCreated={() => { flash(m.toastCreated, "success"); refreshAll(); }} t={m} />
      )}
      {buyOrder && telegramId && (
        <BuyOrderModal order={buyOrder} telegramId={telegramId} tonBalance={tonBalance} onClose={() => setBuyOrder(null)} onBought={handleBuyConfirmed} t={m} />
      )}

      {/* ── HEADER ── */}
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#f1f5f9", letterSpacing: "-0.01em" }}>🏪 {m.title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
            <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 800, letterSpacing: "0.1em" }}>{m.liveStatus}</span>
          </div>
        </div>

        {/* ── TAB SWITCHER ── */}
        <div style={{ display: "flex", background: "rgba(10,18,40,0.9)", border: "1px solid rgba(30,58,143,0.35)", borderRadius: 14, padding: 4, marginBottom: 12 }}>
          {(["market", "mine"] as MainTab[]).map(tabKey => {
            const active = tab === tabKey;
            const label = tabKey === "market" ? m.tabMarket : m.tabMine;
            return (
              <button key={tabKey} onClick={() => { haptic("light"); setTab(tabKey); }} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", fontFamily: "inherit", background: active ? "linear-gradient(135deg,#1e3a8a,#2563eb)" : "transparent", color: active ? "#fff" : "#475569", fontSize: 13, fontWeight: 800, cursor: "pointer", transition: "all 0.2s" }}>
                {label}
                {tabKey === "mine" && myOrders.filter(o => o.status === "open").length > 0 && (
                  <span style={{ marginLeft: 6, background: "#2563eb", borderRadius: 10, padding: "1px 6px", fontSize: 10, color: active ? "#93c5fd" : "#3b82f6" }}>
                    {myOrders.filter(o => o.status === "open").length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── LIVE TICKER ── */}
        <LiveTicker lang={lang} />

        {/* ── STATS ROW ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
          {[
            { label: m.statsInOrders, val: stats.inOrdersTon.toFixed(1), unit: "TON",  color: "#60a5fa" },
            { label: m.statsVolume,   val: stats.volume24h.toFixed(1),   unit: "TON",  color: "#a78bfa" },
            { label: m.statsProfit,   val: `${stats.avgProfit}%`,         unit: "avg",  color: "#4ade80" },
          ].map(({ label, val, unit, color }) => (
            <div key={label} style={{ background: "rgba(10,18,42,0.9)", border: "1px solid rgba(30,45,80,0.6)", borderRadius: 13, padding: "9px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 7, color: "#334155", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4, lineHeight: 1.3 }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color }}>{val}</div>
              <div style={{ fontSize: 8, color: "#3b4a63", marginTop: 1 }}>{unit}</div>
            </div>
          ))}
        </div>

        {/* ── LEADERBOARD CARD ── */}
        <div style={{ background: "linear-gradient(135deg, rgba(180,83,9,0.18) 0%, rgba(251,191,36,0.08) 100%)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 16, padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 28 }}>🏆</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#fbbf24" }}>{m.leaderTitle}</div>
              <div style={{ fontSize: 11, color: "#92400e", marginTop: 2 }}>{m.leaderSub}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: -8 }}>
            {["A","M","D"].map((l, i) => (
              <div key={i} style={{ width: 28, height: 28, borderRadius: "50%", background: ["#1d4ed8","#dc2626","#15803d"][i], border: "2px solid #0a1020", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", marginLeft: i > 0 ? -8 : 0 }}>{l}</div>
            ))}
          </div>
        </div>

        {/* ── TIER FILTERS (only on market tab) ── */}
        {tab === "market" && (
          <div style={{ display: "flex", gap: 5, marginBottom: 14, overflowX: "auto", padding: "0 0 2px" }}>
            {TIERS.map(({ key, label }) => {
              const active = tierFilter === key;
              const cfg = key !== "all" ? TIER_CFG[key as Tier] : null;
              return (
                <button key={key} onClick={() => { haptic("light"); setTierFilter(key); }} style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 22, border: active ? `1.5px solid ${cfg?.color ?? "#3b82f6"}` : "1.5px solid rgba(30,45,80,0.5)", background: active ? (cfg?.bg ?? "rgba(37,99,235,0.18)") : "rgba(10,18,40,0.8)", color: active ? (cfg?.color ?? "#60a5fa") : "#4a5568", fontSize: 12, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", transition: "all 0.18s", letterSpacing: "0.04em" }}>
                  {label}
                  {key !== "all" && <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>{cfg?.bonusLabel}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── ORDERS LIST ── */}
      <div style={{ padding: "0 16px" }}>
        {ordersLoading && tab === "market" ? (
          <div style={{ textAlign: "center", color: "#334155", padding: "40px 0", fontSize: 13 }}>{m.loading}</div>
        ) : displayOrders.length === 0 ? (
          <div style={{ background: "rgba(10,18,40,0.9)", border: "1px solid rgba(30,45,80,0.4)", borderRadius: 16, padding: "40px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>{tab === "mine" ? "📦" : "📋"}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#475569" }}>{tab === "mine" ? m.emptyMine : m.emptyOrders}</div>
            <div style={{ fontSize: 12, color: "#334155", marginTop: 5 }}>{tab === "mine" ? m.emptyMineSub : m.emptyOrdersSub}</div>
          </div>
        ) : (
          displayOrders.map(order => (
            <OrderCard key={order.id} order={order} isMine={order.sellerId === telegramId}
              onBuy={handleBuy} onCancel={handleCancel}
              buying={buyingId === order.id} cancelling={cancellingId === order.id}
              t={m} />
          ))
        )}
      </div>

      {/* ── FIXED BOTTOM BUTTON ── */}
      {telegramId && (
        <div style={{ position: "fixed", bottom: 66, left: 0, right: 0, padding: "0 16px", zIndex: 50, maxWidth: 480, margin: "0 auto" }}>
          <button onClick={() => { haptic("medium"); setShowCreate(true); }} style={{ width: "100%", padding: "15px 0", borderRadius: 16, border: "none", fontFamily: "inherit", background: "linear-gradient(135deg,#1d4ed8 0%,#3b82f6 50%,#1d4ed8 100%)", backgroundSize: "200% 100%", color: "#fff", fontSize: 15, fontWeight: 900, cursor: "pointer", boxShadow: "0 0 32px rgba(59,130,246,0.5), 0 4px 12px rgba(0,0,0,0.4)", letterSpacing: "0.02em" }}>
            {m.createBtn}
          </button>
        </div>
      )}
    </div>
  );
}
