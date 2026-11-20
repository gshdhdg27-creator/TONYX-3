import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
const tonyxLogoSrc = "/tonyx-logo.jpg";
import {
  useGetUserProfile, getGetUserProfileQueryKey, useGetReferrals, useGetMiniHistory,
} from "@workspace/api-client-react";
import { useTelegram, haptic, hapticNotify } from "@/lib/telegram";
import { CountUp } from "@/components/count-up";
import { useLang } from "@/lib/LanguageContext";
import type { Lang } from "@/lib/i18n";
import { inventoryApi, type InventoryItem, type InventoryCollection } from "@/lib/inventoryApi";

const TG_API = "https://api.changes.tg";
function isTgGiftItem(it: InventoryItem): boolean {
  return it.kind === "tg_gift" || Boolean(it.model && it.symbol && it.backdrop);
}
function tgGiftBase(it: InventoryItem): string {
  const candidates = [
    it.collectionName,
    it.nameEn,
    (it.nameRu || "").replace(/\s*#\d+\s*$/, "").trim(),
    String(it.itemId || "").split("#")[0],
  ].filter(Boolean) as string[];
  const titled = candidates.find((c) => /\s/.test(c));
  return (titled || candidates[0] || "").replace(/\s*#\d+\s*$/, "").trim();
}
function TgGiftMini({ item, size = 44 }: { item: InventoryItem; size?: number }) {
  const base = tgGiftBase(item);
  const center = item.backdropCenter || "#4b5563";
  const edge = item.backdropEdge || "#111827";
  const modelUrl = item.modelImageUrl || (item.model ? `${TG_API}/model/${encodeURIComponent(base)}/${encodeURIComponent(item.model)}.png?size=128` : item.imageUrl) || `${TG_API}/original/${encodeURIComponent(base)}.png?size=128`;
  const symbolUrl = item.symbolImageUrl || (item.symbol ? `${TG_API}/symbol/${encodeURIComponent(base)}/${encodeURIComponent(item.symbol)}.png?size=64` : null);
  const patternUrl = item.patternImageUrl || (item.symbol ? `${TG_API}/pattern/${encodeURIComponent(base)}/${encodeURIComponent(item.symbol)}.png?size=64` : null);
  return (
    <div style={{ width: size, height: size, borderRadius: 10, overflow: "hidden", position: "relative", flexShrink: 0, background: `radial-gradient(circle at 50% 36%, ${center} 0%, ${edge} 72%, #0a0f1a 100%)` }}>
      {patternUrl && <div aria-hidden style={{ position: "absolute", inset: 0, opacity: 0.22, backgroundImage: `url("${patternUrl}")`, backgroundSize: "14px 14px", backgroundRepeat: "repeat", mixBlendMode: "soft-light", pointerEvents: "none" }} />}
      <img src={modelUrl || undefined} alt="" style={{ position: "relative", zIndex: 2, width: "78%", height: "78%", objectFit: "contain", display: "block", margin: "10% auto 0" }} onError={(e) => { const el = e.currentTarget; if (!el.dataset.fb) { el.dataset.fb = "1"; el.src = `${TG_API}/original/${encodeURIComponent(base)}.png?size=128`; } }} />
      {symbolUrl && <img src={symbolUrl} alt="" style={{ position: "absolute", right: 2, bottom: 2, width: Math.round(size * 0.28), height: Math.round(size * 0.28), objectFit: "contain", zIndex: 3 }} onError={(e) => { e.currentTarget.style.display = "none"; }} />}
    </div>
  );
}

const TOPUP_WALLET = "UQBDrAxyWlMMmtSgq5TjQyO1nKacS_nA0_7ZQ88m8eMmU1jO";

function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
      background: type === "success" ? "rgba(22,163,74,0.97)" : "rgba(220,38,38,0.97)",
      color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 13, fontWeight: 700, zIndex: 9999,
      maxWidth: "calc(100% - 32px)", boxShadow: "0 8px 28px rgba(0,0,0,0.4)" }}>{msg}</div>
  );
}

function TonIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="28" cy="28" r="28" fill="#0098EA"/>
      <path d="M36.8 15H19.2c-3.3 0-5.3 3.7-3.4 6.4l10 14.8c1.4 2 4.2 2 5.6 0l10-14.8c1.9-2.7-.1-6.4-3.6-6.4z" fill="white"/>
    </svg>
  );
}

function TonyxIcon({ size = 28 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", border: "2px solid rgba(0,162,255,0.5)",
      overflow: "hidden", flexShrink: 0, position: "relative" }}>
      <img src={tonyxLogoSrc} alt="TONYX" style={{ width: "140%", height: "140%", objectFit: "cover",
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: "rgba(217,119,6,0.2)", color: "#fbbf24", label: "⏳ ожидает" },
    processing: { bg: "rgba(37,99,235,0.2)", color: "#60a5fa", label: "⚙️ обработка" },
    completed: { bg: "rgba(22,163,74,0.2)", color: "#4ade80", label: "✅ выплачено" },
    approved: { bg: "rgba(22,163,74,0.2)", color: "#4ade80", label: "✅ одобрено" },
    rejected: { bg: "rgba(220,38,38,0.2)", color: "#f87171", label: "❌ отклонено" },
    failed: { bg: "rgba(220,38,38,0.2)", color: "#f87171", label: "❌ ошибка" },
  };
  const c = cfg[status] ?? cfg.pending;
  return <span style={{ background: c.bg, color: c.color, padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700 }}>{c.label}</span>;
}

interface WithdrawalHistoryItem {
  id: number; tonAmount: number | null; amount: number;
  address: string; status: string; txHash: string | null; createdAt: string;
}
interface DepositHistoryItem {
  id: number; tonAmount: number | null;
  memo: string | null; txHash: string | null; status: string; createdAt: string;
}

type ActivePanel = null | "topup" | "withdraw";
type TopupStep = "idle" | "verifying" | "credited" | "timeout";

export default function ProfilePage() {
  const { telegramId, username, firstName, photoUrl } = useTelegram();
  const { t, lang, setLang } = useLang();
  const qc = useQueryClient();
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [invItems, setInvItems] = useState<InventoryItem[]>([]);
  const [invCollections, setInvCollections] = useState<InventoryCollection[]>([]);
  const [invLoading, setInvLoading] = useState(false);
  const [sellingId, setSellingId] = useState<number | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawPending, setWithdrawPending] = useState(false);
  const [withdrawHistory, setWithdrawHistory] = useState<WithdrawalHistoryItem[]>([]);
  const [topupStep, setTopupStep] = useState<TopupStep>("idle");
  const [topupChecking, setTopupChecking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [tonConnectUI] = useTonConnectUI();
  const connectedAddress = useTonAddress();

  const { data: profile } = useGetUserProfile(telegramId ?? "", { query: { enabled: !!telegramId, refetchInterval: 10000 } as any });

  useEffect(() => {
    if (!telegramId) return;
    setInvLoading(true);
    inventoryApi.get()
      .then((d) => { setInvItems(d.inventory ?? []); setInvCollections(d.collections ?? []); })
      .catch(() => {})
      .finally(() => setInvLoading(false));
  }, [telegramId]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function showToast(msg: string, type: "success" | "error") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function togglePanel(panel: ActivePanel) {
    setActivePanel((p) => (p === panel ? null : panel));
    if (panel !== "topup") {
      setTopupStep("idle");
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
  }

  async function sellItem(id: number) {
    if (sellingId) return;
    setSellingId(id);
    try {
      const r = await inventoryApi.sell(id);
      hapticNotify("success");
      showToast(`Продано +${r.receivedTon} TON`, "success");
      setInvItems((prev) => prev.filter((x) => x.id !== id));
      qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId ?? "") });
    } catch (e) {
      hapticNotify("error");
      showToast(e instanceof Error ? e.message : "Ошибка", "error");
    } finally { setSellingId(null); }
  }

  async function startVerification() {
    if (!telegramId || topupChecking) return;
    setTopupChecking(true);
    setTopupStep("verifying");
    let tries = 0;
    const maxTries = 24;
    if (pollRef.current) clearInterval(pollRef.current);
    const tick = async () => {
      tries += 1;
      try {
        const r = await fetch("/api/mini/wallet/topup/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telegramId }),
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok && (d.credited || d.ok || d.found)) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setTopupStep("credited");
          setTopupChecking(false);
          hapticNotify("success");
          showToast(d.message ?? "✅ TON зачислен!", "success");
          qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId) });
          return;
        }
      } catch { /* keep polling */ }
      if (tries >= maxTries) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setTopupStep("timeout");
        setTopupChecking(false);
        showToast("Пока не найдено. Сканер работает — подожди 1–2 мин", "error");
      }
    };
    await tick();
    pollRef.current = setInterval(tick, 5000);
  }

  async function loadWithdrawHistory() {
    if (!telegramId) return;
    try {
      const r = await fetch(`/api/mini/wallet/withdrawals/${telegramId}`);
      if (r.ok) { const d = await r.json(); setWithdrawHistory(d.withdrawals ?? []); }
    } catch { /* ignore */ }
  }

  async function submitWithdraw() {
    if (!telegramId || !connectedAddress || withdrawPending) return;
    const amount = parseFloat(withdrawAmount);
    if (!Number.isFinite(amount) || amount < 0.1) { showToast("Мин. 0.1 TON", "error"); return; }
    setWithdrawPending(true);
    try {
      const r = await fetch("/api/mini/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, amount, address: connectedAddress }),
      });
      const d = await r.json();
      if (!r.ok) { showToast(d.error ?? "Ошибка сервера", "error"); return; }
      hapticNotify("success");
      showToast(d.message ?? "✅ Вывод успешен!", "success");
      setWithdrawAmount("");
      qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId) });
      await loadWithdrawHistory();
    } catch { showToast("Ошибка сети", "error"); }
    finally { setWithdrawPending(false); }
  }

  if (!telegramId) {
    return <div style={{ padding: 24, color: "#94a3b8" }}>Loading…</div>;
  }

  const userTon = Number((profile as { ton?: string | number } | undefined)?.ton ?? 0);
  const userTonyx = Number((profile as { tonyxCoins?: number } | undefined)?.tonyxCoins ?? 0);
  const memo = String(telegramId);
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(96,165,250,0.25)",
    background: "rgba(15,23,42,0.8)", color: "#f1f5f9", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ padding: "72px 16px 100px", color: "#f1f5f9" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {showLangPicker && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(5,8,20,0.97)", display: "flex",
          alignItems: "center", justifyContent: "center", flexDirection: "column", padding: "0 28px" }}
          onClick={() => setShowLangPicker(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 320 }}>
            <div style={{ fontSize: 22, fontWeight: 800, textAlign: "center", marginBottom: 24 }}>{t.langModal.title}</div>
            {(["ru", "en"] as Lang[]).map((l) => (
              <button key={l} type="button" onClick={() => { haptic("medium"); setLang(l); setShowLangPicker(false); }}
                style={{ width: "100%", padding: "18px 24px", borderRadius: 16, marginBottom: 12, border: `1px solid ${lang === l ? "rgba(96,165,250,0.7)" : "rgba(96,165,250,0.2)"}`,
                  background: lang === l ? "rgba(30,58,143,0.7)" : "rgba(17,24,39,0.8)", color: "#f1f5f9", fontSize: 18, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
                {l === "ru" ? t.langModal.ru : t.langModal.en}{lang === l && " ✓"}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: "linear-gradient(135deg,#1e3a8a,#60a5fa)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, overflow: "hidden", flexShrink: 0 }}>
          {photoUrl ? <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (firstName ?? username ?? "U")[0]?.toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{firstName ?? username ?? `User ${telegramId.slice(-4)}`}</div>
          {username && <div style={{ fontSize: 12, color: "#60a5fa" }}>@{username}</div>}
          <div style={{ fontSize: 10, color: "#475569" }}>ID {telegramId}</div>
        </div>
        <button type="button" onClick={() => { haptic("light"); setShowLangPicker(true); }}
          style={{ background: "rgba(30,58,143,0.25)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 10, padding: "7px 11px", color: "#93c5fd", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", flexShrink: 0 }}>
          {lang === "ru" ? "🇷🇺 RU" : "🇬🇧 EN"}
        </button>
      </div>

      <div style={{ background: "linear-gradient(145deg, rgba(10,20,55,0.98), rgba(15,30,75,0.95))", border: "1px solid rgba(37,99,235,0.4)", borderRadius: 18, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: "#334155", fontWeight: 700, letterSpacing: "0.18em", marginBottom: 16 }}>ВАШ БАЛАНС</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div style={{ background: "rgba(0,152,234,0.12)", border: "1px solid rgba(0,152,234,0.3)", borderRadius: 16, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><TonIcon size={24} /><span style={{ fontSize: 13, fontWeight: 700, color: "#93c5fd" }}>TON</span></div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{userTon.toFixed(4)}</div>
          </div>
          <div style={{ background: "rgba(0,162,255,0.08)", border: "1px solid rgba(0,162,255,0.25)", borderRadius: 16, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><TonyxIcon size={24} /><span style={{ fontSize: 13, fontWeight: 700, color: "#67e8f9" }}>TONYX</span></div>
            <div style={{ fontSize: 26, fontWeight: 900 }}><CountUp value={userTonyx} /></div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button type="button" onClick={() => togglePanel("topup")} style={{ padding: "14px 0", borderRadius: 14, fontFamily: "inherit", cursor: "pointer",
            background: activePanel === "topup" ? "linear-gradient(135deg,#0891b2,#22d3ee)" : "rgba(8,145,178,0.25)",
            border: `1px solid ${activePanel === "topup" ? "rgba(34,211,238,0.6)" : "rgba(34,211,238,0.25)"}`,
            color: activePanel === "topup" ? "#fff" : "#67e8f9", fontSize: 14, fontWeight: 800 }}>💎 Пополнить</button>
          <button type="button" onClick={() => { togglePanel("withdraw"); if (activePanel !== "withdraw") void loadWithdrawHistory(); }}
            style={{ padding: "14px 0", borderRadius: 14, fontFamily: "inherit", cursor: "pointer",
              background: activePanel === "withdraw" ? "linear-gradient(135deg,#15803d,#22c55e)" : "rgba(21,128,61,0.25)",
              border: `1px solid ${activePanel === "withdraw" ? "rgba(34,197,94,0.6)" : "rgba(34,197,94,0.25)"}`,
              color: activePanel === "withdraw" ? "#fff" : "#4ade80", fontSize: 14, fontWeight: 800 }}>💸 Вывести</button>
        </div>
      </div>

      {activePanel === "topup" && (
        <div style={{ background: "rgba(17,24,39,0.95)", border: "1px solid rgba(34,211,238,0.3)", borderRadius: 18, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#67e8f9", marginBottom: 10 }}>💎 Пополнение TON</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12, lineHeight: 1.5 }}>
            Отправь TON на кошелёк проекта с memo = твой Telegram ID. После отправки нажми «Я отправил — проверить» — сканер зачислит автоматически.
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Адрес</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1, ...inputStyle, wordBreak: "break-all", fontSize: 11 }}>{TOPUP_WALLET}</div>
            <button type="button" onClick={() => { void navigator.clipboard.writeText(TOPUP_WALLET); haptic("light"); showToast("Адрес скопирован", "success"); }}
              style={{ padding: "0 12px", borderRadius: 10, border: "none", background: "rgba(34,211,238,0.2)", color: "#67e8f9", fontWeight: 700, cursor: "pointer" }}>📋</button>
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Memo (обязательно)</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <div style={{ flex: 1, ...inputStyle, fontSize: 13 }}>{memo}</div>
            <button type="button" onClick={() => { void navigator.clipboard.writeText(memo); haptic("light"); showToast("Memo скопирован", "success"); }}
              style={{ padding: "0 12px", borderRadius: 10, border: "none", background: "rgba(34,211,238,0.2)", color: "#67e8f9", fontWeight: 700, cursor: "pointer" }}>📋</button>
          </div>
          {topupStep !== "idle" && (
            <div style={{ background: topupStep === "credited" ? "rgba(22,163,74,0.12)" : topupStep === "timeout" ? "rgba(220,38,38,0.12)" : "rgba(37,99,235,0.12)",
              borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 13, fontWeight: 700 }}>
              {topupStep === "verifying" && "🔍 Сканируем блокчейн…"}
              {topupStep === "credited" && "✅ TON зачислен!"}
              {topupStep === "timeout" && "⏰ Не найдено. Сканер продолжает работу."}
            </div>
          )}
          <button type="button" onClick={() => void startVerification()} disabled={topupChecking}
            style={{ width: "100%", padding: 15, borderRadius: 13, border: "none", background: topupChecking ? "rgba(30,45,69,0.5)" : "linear-gradient(135deg,#0369a1,#22d3ee)", color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>
            {topupChecking ? "🔍 Проверяем…" : "✅ Я отправил — проверить"}
          </button>
        </div>
      )}

      {activePanel === "withdraw" && (
        <div style={{ background: "rgba(17,24,39,0.95)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 18, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#4ade80", marginBottom: 10 }}>💸 Вывод TON</div>
          {!connectedAddress ? (
            <button type="button" onClick={() => tonConnectUI.openModal()} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none",
              background: "linear-gradient(135deg,#15803d,#22c55e)", color: "#fff", fontWeight: 800, fontFamily: "inherit", cursor: "pointer", marginBottom: 12 }}>
              Подключить кошелёк
            </button>
          ) : (
            <div style={{ fontSize: 11, color: "#86efac", marginBottom: 10, wordBreak: "break-all" }}>→ {connectedAddress}</div>
          )}
          <input value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} type="number" step="0.01" min="0.1" placeholder="Сумма TON" style={{ ...inputStyle, marginBottom: 10 }} />
          {withdrawAmount && parseFloat(withdrawAmount) >= 0.1 && parseFloat(withdrawAmount) <= userTon && (
            <div style={{ fontSize: 11, color: "#4ade80", marginBottom: 10 }}>К получению: {(parseFloat(withdrawAmount) * 0.95).toFixed(4)} TON (комиссия 5%)</div>
          )}
          <button type="button" onClick={() => void submitWithdraw()} disabled={withdrawPending || !connectedAddress || !withdrawAmount || parseFloat(withdrawAmount) < 0.1 || parseFloat(withdrawAmount) > userTon}
            style={{ width: "100%", padding: 14, borderRadius: 13, border: "none",
              background: "linear-gradient(135deg,#15803d,#22c55e)", color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: "pointer",
              opacity: (withdrawPending || !connectedAddress) ? 0.6 : 1 }}>
            {withdrawPending ? "⏳…" : "Вывести"}
          </button>
          {withdrawHistory.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginBottom: 8 }}>ИСТОРИЯ ВЫВОДОВ</div>
              {withdrawHistory.slice(0, 5).map((w) => (
                <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ fontSize: 12 }}>{(w.tonAmount ?? w.amount).toFixed(4)} TON</span>
                  <StatusBadge status={w.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ background: "rgba(17,24,39,0.95)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 18, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#c084fc", marginBottom: 10 }}>🎒 Инвентарь NFT</div>
        {invLoading ? <div style={{ color: "#64748b", fontSize: 12 }}>Загрузка…</div>
          : invItems.length === 0 ? <div style={{ color: "#64748b", fontSize: 12 }}>Пока пусто. Собери пазл или выиграй NFT из кейса.</div>
          : invItems.map((it) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(30,45,69,0.55)", borderRadius: 12, padding: "10px 12px", marginBottom: 8, border: "1px solid rgba(168,85,247,0.2)" }}>
              {isTgGiftItem(it) ? <TgGiftMini item={it} size={44} /> : (
                <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: "linear-gradient(135deg,#7c3aed55,#a855f755)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {it.imageUrl ? <img src={it.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🎁"}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{it.nameRu}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                  {isTgGiftItem(it) ? [it.model, it.backdrop, it.symbol].filter(Boolean).join(" · ") : `≈ ${it.valueTon} TON`}
                </div>
              </div>
              <button type="button" disabled={sellingId === it.id} onClick={() => { haptic("light"); void sellItem(it.id); }}
                style={{ padding: "8px 12px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#16a34a,#22c55e)", color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "inherit", opacity: sellingId === it.id ? 0.6 : 1 }}>
                {sellingId === it.id ? "…" : "Продать"}
              </button>
            </div>
          ))}
      </div>

      <button type="button" onClick={() => { haptic("light"); setShowLangPicker(true); }}
        style={{ width: "100%", marginTop: 4, padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(96,165,250,0.3)",
          background: "rgba(30,58,143,0.25)", color: "#93c5fd", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
        {t.profile.changeLanguage}
      </button>
    </div>
  );
}
