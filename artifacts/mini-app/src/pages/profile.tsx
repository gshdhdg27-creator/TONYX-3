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

const inputStyle: Record<string, string | number> = {
  width: "100%", background: "rgba(30,45,69,0.6)", border: "1px solid rgba(30,58,143,0.4)",
  borderRadius: 10, padding: "12px 14px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 14,
  outline: "none", boxSizing: "border-box", marginBottom: 10,
};
const cardStyle: Record<string, string | number> = {
  background: "rgba(17,24,39,0.95)", border: "1px solid rgba(30,58,143,0.3)",
  borderRadius: 18, padding: 16, marginBottom: 14,
};

export default function ProfilePage() {
  const { telegramId, username, firstName, photoUrl } = useTelegram();
  const { t, lang, setLang } = useLang();
  const qc = useQueryClient();
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [copied, setCopied] = useState(false);
  const [addrCopied, setAddrCopied] = useState(false);
  const [memoCopied, setMemoCopied] = useState(false);
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
  const [depositAmount, setDepositAmount] = useState("");
  const [tonConnectUI] = useTonConnectUI();
  const connectedAddress = useTonAddress();
  const [txHistory, setTxHistory] = useState<{ deposits: DepositHistoryItem[]; withdrawals: WithdrawalHistoryItem[] }>({ deposits: [], withdrawals: [] });
  const [txHistoryLoading, setTxHistoryLoading] = useState(false);
  const [txHistoryLoaded, setTxHistoryLoaded] = useState(false);
  const [txTab, setTxTab] = useState<"deposits" | "withdrawals">("deposits");

  const { data: profile } = useGetUserProfile(telegramId ?? "", { query: { enabled: !!telegramId, refetchInterval: 10000 } as any });
  const { data: referrals } = useGetReferrals(telegramId ?? "", { query: { enabled: !!telegramId } as any });
  const { data: history } = useGetMiniHistory(telegramId ?? "", { query: { enabled: !!telegramId, refetchInterval: 30000 } as any });

  useEffect(() => {
    if (!telegramId) return;
    setInvLoading(true);
    inventoryApi.get()
      .then((d) => { setInvItems(d.inventory ?? []); setInvCollections(d.collections ?? []); })
      .catch(() => {})
      .finally(() => setInvLoading(false));
  }, [telegramId]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  async function sellItem(id: number) {
    if (sellingId) return;
    setSellingId(id);
    try {
      const r = await inventoryApi.sell(id);
      hapticNotify("success");
      setToast({ msg: `Продано +${r.receivedTon} TON`, type: "success" });
      setInvItems((prev) => prev.filter((x) => x.id !== id));
      qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId ?? "") });
    } catch (e) {
      hapticNotify("error");
      setToast({ msg: e instanceof Error ? e.message : "Ошибка", type: "error" });
    } finally { setSellingId(null); }
  }

  if (!telegramId) {
    return <div style={{ padding: 24, color: "#94a3b8" }}>Loading…</div>;
  }

  const userTon = Number((profile as { ton?: string | number } | undefined)?.ton ?? 0);
  const userTonyx = Number((profile as { tonyxCoins?: number } | undefined)?.tonyxCoins ?? 0);
  const depositCode = profile?.depositCode ?? null;
  const memo = depositCode ?? `TONYX-${telegramId}`;
  const inviteLink = `https://t.me/TONYX_game_bot?start=${telegramId}`;

  const togglePanel = (panel: ActivePanel) => {
    haptic("light");
    setActivePanel((prev) => (prev === panel ? null : panel));
    if (panel !== "topup") {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      setTopupStep("idle");
    }
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(inviteLink); setCopied(true); haptic("light"); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  const copyAddr = async () => {
    try { await navigator.clipboard.writeText(TOPUP_WALLET); setAddrCopied(true); haptic("light"); setTimeout(() => setAddrCopied(false), 1500); } catch {}
  };
  const copyMemo = async () => {
    try { await navigator.clipboard.writeText(memo); setMemoCopied(true); haptic("light"); setTimeout(() => setMemoCopied(false), 1500); } catch {}
  };

  const startVerification = () => {
    if (pollRef.current) return;
    setTopupStep("verifying");
    setTopupChecking(true);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 24) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setTopupStep("timeout");
        setTopupChecking(false);
        showToast("Транзакция не найдена за 2 минуты.", "error");
        return;
      }
      try {
        const r = await fetch("/api/mini/wallet/topup/verify", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telegramId }),
        });
        const d = await r.json() as { found?: boolean; credited?: boolean; alreadyCredited?: boolean; message?: string };
        if (d.found && (d.credited || d.alreadyCredited)) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setTopupStep("credited");
          setTopupChecking(false);
          hapticNotify("success");
          showToast(d.message ?? "✅ TON зачислено!");
          qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId) });
        }
      } catch { /* keep polling */ }
    }, 5000);
  };

  const buildCommentPayload = (comment: string): string => {
    const textBytes = new TextEncoder().encode(comment);
    const data = new Uint8Array(4 + textBytes.length);
    data.set(textBytes, 4);
    const body = new Uint8Array(2 + data.length);
    body[0] = 0;
    body[1] = data.length * 2;
    body.set(data, 2);
    const boc = new Uint8Array([0xb5, 0xee, 0x9c, 0x72, 0x01, 0x01, 0x01, 0x01, 0x00, body.length & 0xff, 0x00, ...body]);
    return btoa(String.fromCharCode(...boc));
  };

  const sendTonDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount < 0.1) { showToast("Минимум 0.1 TON", "error"); return; }
    haptic("medium");
    try {
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{ address: TOPUP_WALLET, amount: String(Math.floor(amount * 1e9)), payload: buildCommentPayload(memo) }],
      });
      showToast("✅ Транзакция отправлена!", "success");
      startVerification();
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? "";
      if (!msg.includes("User rejects")) showToast("Ошибка отправки", "error");
    }
  };

  const loadWithdrawHistory = async () => {
    if (!telegramId) return;
    try {
      const r = await fetch(`/api/mini/wallet/withdrawals/${telegramId}`);
      if (r.ok) { const d = await r.json(); setWithdrawHistory(d.withdrawals ?? []); }
    } catch {}
  };

  const loadTxHistory = async () => {
    if (!telegramId || txHistoryLoading) return;
    setTxHistoryLoading(true);
    try {
      const r = await fetch(`/api/mini/wallet/history/${telegramId}`);
      if (r.ok) {
        const d = await r.json() as { deposits?: DepositHistoryItem[]; withdrawals?: WithdrawalHistoryItem[] };
        setTxHistory({ deposits: d.deposits ?? [], withdrawals: d.withdrawals ?? [] });
        setTxHistoryLoaded(true);
      }
    } catch {} finally { setTxHistoryLoading(false); }
  };

  const submitWithdraw = async () => {
    if (!telegramId) return;
    haptic("heavy");
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount < 0.1) { showToast("Минимум 0.1 TON", "error"); return; }
    if (amount > userTon) { showToast("Недостаточно TON", "error"); return; }
    if (!connectedAddress) { showToast("Подключите TON кошелёк", "error"); return; }
    setWithdrawPending(true);
    try {
      const r = await fetch("/api/mini/wallet/withdraw", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, tonAmount: amount, address: connectedAddress }),
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
              <button key={l} onClick={() => { haptic("medium"); setLang(l); setShowLangPicker(false); }}
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
        <button onClick={() => { haptic("light"); setShowLangPicker(true); }}
          style={{ background: "rgba(30,58,143,0.25)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 10, padding: "7px 11px", color: "#93c5fd", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
          {lang === "ru" ? "🇷🇺 RU" : "🇬🇧 EN"}
        </button>
      </div>

      <div style={{ ...cardStyle, background: "linear-gradient(145deg, rgba(10,20,55,0.98), rgba(15,30,75,0.95))", border: "1px solid rgba(37,99,235,0.4)" }}>
        <div style={{ fontSize: 10, color: "#334155", fontWeight: 700, letterSpacing: "0.18em", marginBottom: 16 }}>ВАШ БАЛАНС</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
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
          <button onClick={() => togglePanel("topup")} style={{ padding: "14px 0", borderRadius: 14, fontFamily: "inherit", cursor: "pointer",
            background: activePanel === "topup" ? "linear-gradient(135deg,#0891b2,#22d3ee)" : "rgba(8,145,178,0.25)",
            border: `1px solid ${activePanel === "topup" ? "rgba(34,211,238,0.6)" : "rgba(34,211,238,0.25)"}`,
            color: activePanel === "topup" ? "#fff" : "#67e8f9", fontSize: 14, fontWeight: 800 }}>💎 Пополнить</button>
          <button onClick={() => { togglePanel("withdraw"); if (activePanel !== "withdraw") loadWithdrawHistory(); }}
            style={{ padding: "14px 0", borderRadius: 14, fontFamily: "inherit", cursor: "pointer",
              background: activePanel === "withdraw" ? "linear-gradient(135deg,#15803d,#22c55e)" : "rgba(21,128,61,0.25)",
              border: `1px solid ${activePanel === "withdraw" ? "rgba(34,197,94,0.6)" : "rgba(34,197,94,0.25)"}`,
              color: activePanel === "withdraw" ? "#fff" : "#4ade80", fontSize: 14, fontWeight: 800 }}>💸 Вывести</button>
        </div>
      </div>

      {activePanel === "topup" && (
        <div style={{ marginBottom: 14 }}>
          {topupStep !== "idle" && (
            <div style={{ background: topupStep === "credited" ? "rgba(22,163,74,0.12)" : topupStep === "timeout" ? "rgba(220,38,38,0.12)" : "rgba(37,99,235,0.12)",
              border: "1px solid rgba(59,130,246,0.4)", borderRadius: 14, padding: "12px 16px", marginBottom: 12, fontSize: 12, fontWeight: 700 }}>
              {topupStep === "verifying" && "🔍 Сканируем блокчейн…"}
              {topupStep === "credited" && "✅ TON зачислен!"}
              {topupStep === "timeout" && "⏰ Не найдено. Сканер продолжает работу."}
            </div>
          )}
          <div style={{ ...cardStyle, border: "1px solid rgba(0,152,234,0.35)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <TonIcon size={22} /><div style={{ fontSize: 14, fontWeight: 800, color: "#38bdf8" }}>Пополнить через TON</div>
            </div>
            {connectedAddress && (
              <div style={{ fontSize: 10, color: "#22d3ee", fontFamily: "monospace", marginBottom: 10 }}>
                🔗 {connectedAddress.slice(0, 8)}…{connectedAddress.slice(-6)}
              </div>
            )}
            <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="Сумма TON" min="0.1" step="any" style={inputStyle} />
            <button onClick={connectedAddress ? sendTonDeposit : () => tonConnectUI.openModal()}
              style={{ width: "100%", padding: 14, borderRadius: 13, border: "none", background: "linear-gradient(135deg,#0077b5,#0098ea)", color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>
              {connectedAddress ? `💎 Оплатить ${depositAmount || ""} TON` : "🔗 Подключить кошелёк"}
            </button>
          </div>
          <div style={{ ...cardStyle, border: "1px solid rgba(14,116,144,0.35)" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#22d3ee", marginBottom: 10 }}>Ручное пополнение</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>Адрес + memo. Без кода средства не зачислятся.</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, ...inputStyle, marginBottom: 0, fontFamily: "monospace", fontSize: 11, wordBreak: "break-all" }}>{TOPUP_WALLET}</div>
              <button onClick={copyAddr} style={{ padding: "0 14px", borderRadius: 10, border: "none", background: "rgba(14,116,144,0.25)", color: addrCopied ? "#4ade80" : "#67e8f9", cursor: "pointer" }}>{addrCopied ? "✓" : "📋"}</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, ...inputStyle, marginBottom: 0, fontFamily: "monospace", fontSize: depositCode ? 18 : 13, fontWeight: 900 }}>{memo}</div>
              <button onClick={copyMemo} style={{ padding: "0 14px", borderRadius: 10, border: "none", background: "rgba(139,92,246,0.3)", color: memoCopied ? "#4ade80" : "#c4b5fd", cursor: "pointer" }}>{memoCopied ? "✓" : "📋"}</button>
            </div>
            <button onClick={startVerification} disabled={topupChecking}
              style={{ width: "100%", padding: 15, borderRadius: 13, border: "none", background: topupChecking ? "rgba(30,45,69,0.5)" : "linear-gradient(135deg,#0369a1,#22d3ee)", color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>
              {topupChecking ? "🔍 Проверяем…" : "✅ Я отправил — проверить"}
            </button>
          </div>
        </div>
      )}

      {activePanel === "withdraw" && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ ...cardStyle, border: "1px solid rgba(22,163,74,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>💸 Вывод TON</div>
              <div style={{ fontSize: 11, color: "#475569" }}>Баланс: <span style={{ color: "#4ade80" }}>{userTon.toFixed(4)}</span></div>
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>Мин. 0.1 · Комиссия 5% · На подключённый кошелёк</div>
            <input value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} type="number" step="0.01" min="0.1" placeholder="Сумма TON" style={inputStyle} />
            {withdrawAmount && parseFloat(withdrawAmount) >= 0.1 && parseFloat(withdrawAmount) <= userTon && (
              <div style={{ fontSize: 11, color: "#4ade80", marginBottom: 10 }}>К получению: {(parseFloat(withdrawAmount) * 0.95).toFixed(4)} TON</div>
            )}
            {connectedAddress ? (
              <div style={{ background: "rgba(0,152,234,0.08)", border: "1px solid rgba(0,152,234,0.35)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: "#38bdf8", fontWeight: 700, marginBottom: 4 }}>Подключённый кошелёк</div>
                <div style={{ fontSize: 12, fontFamily: "monospace", wordBreak: "break-all" }}>{connectedAddress}</div>
              </div>
            ) : (
              <button type="button" onClick={() => tonConnectUI.openModal()}
                style={{ width: "100%", padding: 12, borderRadius: 10, marginBottom: 10, border: "1px solid rgba(0,152,234,0.5)", background: "rgba(0,152,234,0.12)", color: "#38bdf8", fontSize: 13, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>
                🔗 Подключить кошелёк для вывода
              </button>
            )}
            <button onClick={submitWithdraw} disabled={withdrawPending || !connectedAddress || !withdrawAmount || parseFloat(withdrawAmount) < 0.1 || parseFloat(withdrawAmount) > userTon}
              style={{ width: "100%", padding: 14, borderRadius: 12, border: "none",
                background: !connectedAddress || withdrawPending ? "rgba(30,45,80,0.4)" : "linear-gradient(135deg,#15803d,#22c55e)",
                color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>
              {withdrawPending ? "⏳ Отправляем…" : "💸 Вывести на подключённый кошелёк"}
            </button>
          </div>
          {withdrawHistory.length > 0 && (
            <div style={cardStyle}>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 10, fontWeight: 600 }}>ИСТОРИЯ ВЫВОДОВ</div>
              {withdrawHistory.slice().reverse().slice(0, 10).map((w) => (
                <div key={w.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(30,58,143,0.15)" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{w.tonAmount != null ? `${Number(w.tonAmount).toFixed(4)} TON` : `${w.amount} pts`}</div>
                    <div style={{ fontSize: 10, color: "#475569" }}>{w.address.slice(0, 12)}…</div>
                  </div>
                  <StatusBadge status={w.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>📊 ИСТОРИЯ ОПЕРАЦИЙ</div>
          <button onClick={() => { haptic("light"); void loadTxHistory(); }} disabled={txHistoryLoading}
            style={{ padding: "5px 13px", borderRadius: 8, border: "1px solid rgba(59,130,246,0.4)", background: "rgba(59,130,246,0.12)", color: "#60a5fa", fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
            {txHistoryLoading ? "⏳" : txHistoryLoaded ? "🔄" : "📜 Показать"}
          </button>
        </div>
        {txHistoryLoaded && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
              {(["deposits", "withdrawals"] as const).map((tab) => (
                <button key={tab} onClick={() => setTxTab(tab)}
                  style={{ padding: 9, borderRadius: 10, fontFamily: "inherit", cursor: "pointer", border: `1px solid ${txTab === tab ? "rgba(34,211,238,0.5)" : "rgba(30,58,143,0.3)"}`,
                    background: txTab === tab ? "rgba(14,116,144,0.22)" : "rgba(17,24,39,0.6)", color: txTab === tab ? "#22d3ee" : "#475569", fontSize: 13, fontWeight: 700 }}>
                  {tab === "deposits" ? "📥 Депозиты" : "📤 Выводы"}
                </button>
              ))}
            </div>
            {txTab === "deposits" && (txHistory.deposits.length === 0 ? (
              <div style={{ textAlign: "center", color: "#475569", padding: 18, fontSize: 12 }}>Пополнений ещё не было</div>
            ) : txHistory.deposits.map((d) => (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(34,211,238,0.07)" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>+{d.tonAmount != null ? Number(d.tonAmount).toFixed(4) : "—"} TON</div>
                  <div style={{ fontSize: 10, color: "#475569" }}>{new Date(d.createdAt).toLocaleString("ru-RU")}</div>
                </div>
                <StatusBadge status={d.status} />
              </div>
            )))}
            {txTab === "withdrawals" && (txHistory.withdrawals.length === 0 ? (
              <div style={{ textAlign: "center", color: "#475569", padding: 18, fontSize: 12 }}>Выводов ещё не было</div>
            ) : txHistory.withdrawals.map((w) => (
              <div key={w.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(22,163,74,0.07)" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>−{w.tonAmount != null ? Number(w.tonAmount).toFixed(4) : "—"} TON</div>
                  <div style={{ fontSize: 10, color: "#475569" }}>{new Date(w.createdAt).toLocaleString("ru-RU")}</div>
                </div>
                <StatusBadge status={w.status} />
              </div>
            )))}
          </>
        )}
      </div>

      <div style={{ ...cardStyle, border: "1px solid rgba(168,85,247,0.25)" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#c084fc", marginBottom: 4 }}>👥 Пригласить друзей</div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 12 }}>
          10% от TON-наград рефералов. <span style={{ color: "#4ade80", fontWeight: 700 }}>{referrals?.referrals?.length ?? 0} рефер.</span>
        </div>
        <div style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12, color: "#c084fc", wordBreak: "break-all" }}>{inviteLink}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={copyLink} style={{ flex: 1, padding: 11, borderRadius: 10, border: "none", background: copied ? "rgba(34,197,94,0.25)" : "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
            {copied ? "✓ Скопировано" : "📋 Копировать"}
          </button>
          <button onClick={() => window.open(`https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent("Играй в TONYX!")}`, "_blank")}
            style={{ flex: 1, padding: 11, borderRadius: 10, background: "rgba(37,99,235,0.2)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
            ✈️ Поделиться
          </button>
        </div>
      </div>

      <div style={{ ...cardStyle, border: "1px solid rgba(168,85,247,0.25)" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#c084fc", marginBottom: 10 }}>🎒 Инвентарь NFT</div>
        {invLoading ? <div style={{ color: "#64748b", fontSize: 12 }}>Загрузка…</div>
          : invItems.length === 0 ? <div style={{ color: "#64748b", fontSize: 12 }}>Пока пусто. Собери пазл или выиграй NFT из кейса.</div>
          : invItems.map((it) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(30,45,69,0.55)", borderRadius: 12, padding: "10px 12px", marginBottom: 8, border: "1px solid rgba(168,85,247,0.2)" }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: "linear-gradient(135deg,#7c3aed55,#a855f755)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {it.imageUrl ? <img src={it.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🎁"}
              </div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{it.nameRu}</div><div style={{ fontSize: 11, color: "#94a3b8" }}>≈ {it.valueTon} TON</div></div>
              <button type="button" disabled={sellingId === it.id} onClick={() => { haptic("light"); sellItem(it.id); }}
                style={{ padding: "8px 12px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#16a34a,#22c55e)", color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "inherit", opacity: sellingId === it.id ? 0.6 : 1 }}>
                {sellingId === it.id ? "…" : "Продать"}
              </button>
            </div>
          ))}
        {invCollections.some((c) => c.owned > 0) && (
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {invCollections.filter((c) => c.owned > 0).map((c) => (
              <div key={c.id} style={{ fontSize: 11, color: c.canClaim ? "#4ade80" : "#c4b5fd", background: "rgba(124,58,237,0.15)", borderRadius: 8, padding: "4px 8px" }}>
                {c.nameRu} {c.owned}/9
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 10, color: "#64748b", marginBottom: 12, fontWeight: 600 }}>📜 ПОСЛЕДНЯЯ АКТИВНОСТЬ</div>
        {!history || !history.items || history.items.length === 0 ? (
          <div style={{ textAlign: "center", color: "#475569", padding: 20, fontSize: 13 }}>Активности нет</div>
        ) : (history.items as Array<{ kind: string; id: number | string; title: string; amount: number; positive: boolean; timestamp: string }>).map((it) => (
          <div key={`${it.kind}-${it.id}`} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(30,58,143,0.12)" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{it.title}</div>
              <div style={{ fontSize: 10, color: "#475569" }}>{new Date(it.timestamp).toLocaleString()}</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: it.positive ? "#4ade80" : "#f87171" }}>
              {it.positive ? "+" : ""}{it.amount.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
