import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetUserProfile,
  getGetUserProfileQueryKey,
  useGetReferrals,
  useGetMiniHistory,
} from "@workspace/api-client-react";
import { useTelegram, haptic, hapticNotify } from "@/lib/telegram";
import { CountUp } from "@/components/count-up";
import { useLang } from "@/lib/LanguageContext";
import type { Lang } from "@/lib/i18n";

const TOPUP_WALLET = "UQA8d39yaqa-CGw6BUCQw6U3LGelzpS3GxFaVwVDY3BnCDwe";

function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
      background: type === "success" ? "rgba(22,163,74,0.97)" : "rgba(220,38,38,0.97)",
      color: "#fff", padding: "12px 20px", borderRadius: 12,
      fontSize: 13, fontWeight: 700, zIndex: 9999, maxWidth: "calc(100% - 32px)",
      boxShadow: "0 8px 28px rgba(0,0,0,0.4)",
    }}>{msg}</div>
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
    <div style={{
      width: size, height: size, borderRadius: "50%",
      border: "2px solid rgba(0,162,255,0.5)",
      overflow: "hidden", flexShrink: 0, position: "relative",
    }}>
      <img src="/tonyx-logo.jpg" alt="TONYX" style={{
        width: "140%", height: "140%", objectFit: "cover",
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
      }} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    pending:    { bg: "rgba(217,119,6,0.2)",  color: "#fbbf24", label: "⏳ ожидает" },
    processing: { bg: "rgba(37,99,235,0.2)",  color: "#60a5fa", label: "⚙️ обработка" },
    completed:  { bg: "rgba(22,163,74,0.2)",  color: "#4ade80", label: "✅ выплачено" },
    approved:   { bg: "rgba(22,163,74,0.2)",  color: "#4ade80", label: "✅ одобрено" },
    rejected:   { bg: "rgba(220,38,38,0.2)",  color: "#f87171", label: "❌ отклонено" },
    failed:     { bg: "rgba(220,38,38,0.2)",  color: "#f87171", label: "❌ ошибка" },
  };
  const c = cfg[status] ?? cfg.pending;
  return (
    <span style={{ background: c.bg, color: c.color, padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700 }}>
      {c.label}
    </span>
  );
}

interface WithdrawalHistoryItem {
  id: number; tonAmount: number | null; amount: number;
  address: string; status: string; txHash: string | null; createdAt: string;
}

interface DepositHistoryItem {
  id: number; tonAmount: number | null;
  memo: string | null; txHash: string | null;
  status: string; createdAt: string;
}

type ActivePanel = null | "topup" | "withdraw";
type TopupStep   = "idle" | "verifying" | "credited" | "timeout";

function LoadingScreen() {
  return (
    <div style={{ padding: "16px 16px 28px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(30,58,143,0.25)", animation: "pulse 1.4s ease-in-out infinite" }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: "55%", height: 16, borderRadius: 8, background: "rgba(30,58,143,0.2)", marginBottom: 8, animation: "pulse 1.4s ease-in-out infinite" }} />
          <div style={{ width: "35%", height: 11, borderRadius: 6, background: "rgba(30,58,143,0.15)", animation: "pulse 1.4s ease-in-out infinite" }} />
        </div>
      </div>
      <div style={{ height: 140, borderRadius: 20, background: "rgba(30,58,143,0.15)", marginBottom: 14, animation: "pulse 1.4s ease-in-out infinite" }} />
      <style>{`@keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:1} }`}</style>
    </div>
  );
}

export default function ProfilePage() {
  const { telegramId, username, firstName, photoUrl } = useTelegram();
  const { t, lang, setLang } = useLang();
  const tp = t.profile;
  const qc = useQueryClient();

  const [activePanel, setActivePanel]       = useState<ActivePanel>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [toast, setToast]                   = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [copied, setCopied]                 = useState(false);
  const [addrCopied, setAddrCopied]         = useState(false);
  const [memoCopied, setMemoCopied]         = useState(false);

  // Withdraw state
  const [withdrawAmount, setWithdrawAmount]   = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawPending, setWithdrawPending] = useState(false);
  const [withdrawHistory, setWithdrawHistory] = useState<WithdrawalHistoryItem[]>([]);

  // Topup state
  const [topupStep, setTopupStep]   = useState<TopupStep>("idle");
  const [topupChecking, setTopupChecking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Unified transaction history state
  const [txHistory, setTxHistory] = useState<{ deposits: DepositHistoryItem[]; withdrawals: WithdrawalHistoryItem[] }>({ deposits: [], withdrawals: [] });
  const [txHistoryLoading, setTxHistoryLoading] = useState(false);
  const [txHistoryLoaded, setTxHistoryLoaded]   = useState(false);
  const [txTab, setTxTab] = useState<"deposits" | "withdrawals">("deposits");

  const { data: profile } = useGetUserProfile(telegramId ?? "", { query: { enabled: !!telegramId, refetchInterval: 10000 } as any });
  const { data: referrals } = useGetReferrals(telegramId ?? "", { query: { enabled: !!telegramId } as any });
  const { data: history } = useGetMiniHistory(telegramId ?? "", { query: { enabled: !!telegramId, refetchInterval: 30000 } as any });

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const memo = `TONYX-${telegramId ?? ""}`;

  // Cleanup polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  if (!telegramId) return <LoadingScreen />;

  const userTon   = Number((profile as { ton?: string | number } | undefined)?.ton ?? 0);
  const userTonyx = Number((profile as { tonyxCoins?: number } | undefined)?.tonyxCoins ?? 0);
  const inviteLink = `https://t.me/TONYX_game_bot?start=${telegramId ?? ""}`;

  const togglePanel = (panel: ActivePanel) => {
    haptic("light");
    setActivePanel(prev => prev === panel ? null : panel);
    if (panel !== "topup") {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      setTopupStep("idle");
    }
  };

  /* ── Copy helpers ── */
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(inviteLink); setCopied(true); haptic("light"); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  const copyAddr = async () => {
    try { await navigator.clipboard.writeText(TOPUP_WALLET); setAddrCopied(true); haptic("light"); setTimeout(() => setAddrCopied(false), 1500); } catch {}
  };
  const copyMemo = async () => {
    try { await navigator.clipboard.writeText(memo); setMemoCopied(true); haptic("light"); setTimeout(() => setMemoCopied(false), 1500); } catch {}
  };

  /* ── Verification polling (triggered manually by user) ── */
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
        showToast("Транзакция не найдена за 2 минуты. Фоновый сканер продолжает работу.", "error");
        return;
      }
      try {
        const r = await fetch("/api/mini/wallet/topup/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telegramId }),
        });
        const d = await r.json() as { found?: boolean; credited?: boolean; alreadyCredited?: boolean; message?: string; amount?: number };
        if (d.found && (d.credited || d.alreadyCredited)) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setTopupStep("credited");
          setTopupChecking(false);
          hapticNotify("success");
          showToast(d.message ?? `✅ TON зачислено!`, "success");
          qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId) });
        }
      } catch { /* keep polling */ }
    }, 5000);
  };

  const stopVerification = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setTopupStep("idle");
    setTopupChecking(false);
  };

  /* ── Submit withdraw ── */
  const loadWithdrawHistory = async () => {
    if (!telegramId) return;
    try {
      const r = await fetch(`/api/mini/wallet/withdrawals/${telegramId}`);
      if (r.ok) { const d = await r.json(); setWithdrawHistory(d.withdrawals ?? []); }
    } catch { /* ignore */ }
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
    } catch { /* ignore */ }
    finally { setTxHistoryLoading(false); }
  };

  const submitWithdraw = async () => {
    if (!telegramId) return;
    haptic("heavy");
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount < 0.1) { showToast("Минимум 0.1 TON", "error"); return; }
    if (amount > userTon) { showToast("Недостаточно TON на балансе", "error"); return; }
    const addr = withdrawAddress.trim();
    if (!addr) { showToast("Введите TON адрес", "error"); return; }
    setWithdrawPending(true);
    try {
      const r = await fetch("/api/mini/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, tonAmount: amount, address: addr }),
      });
      const d = await r.json();
      if (!r.ok) { showToast(d.error ?? "Ошибка сервера", "error"); return; }
      hapticNotify("success");
      showToast(d.message ?? "✅ Вывод успешен!", "success");
      setWithdrawAmount(""); setWithdrawAddress("");
      qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId) });
      await loadWithdrawHistory();
    } catch { showToast("Ошибка сети, попробуйте снова", "error"); }
    finally { setWithdrawPending(false); }
  };

  const chooseLang = (l: Lang) => { haptic("medium"); setLang(l); setShowLangPicker(false); };

  return (
    <div style={{ padding: "16px 16px 100px" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Language picker */}
      {showLangPicker && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(5,8,20,0.97)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", padding: "0 28px", backdropFilter: "blur(12px)" }}
          onClick={() => setShowLangPicker(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 320 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", textAlign: "center", marginBottom: 24 }}>
              {t.langModal.title}
            </div>
            {(["ru", "en"] as Lang[]).map(l => (
              <button key={l} onClick={() => chooseLang(l)} style={{
                width: "100%", padding: "18px 24px", borderRadius: 16, marginBottom: 12,
                border: `1px solid ${lang === l ? "rgba(96,165,250,0.7)" : "rgba(96,165,250,0.2)"}`,
                background: lang === l ? "linear-gradient(135deg,rgba(30,58,143,0.7),rgba(37,99,235,0.4))" : "rgba(17,24,39,0.8)",
                color: "#f1f5f9", fontSize: 18, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
              }}>
                {l === "ru" ? t.langModal.ru : t.langModal.en}
                {lang === l && <span style={{ marginLeft: 8, color: "#60a5fa" }}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── User info header ─── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <div style={{
          width: 60, height: 60, borderRadius: "50%",
          background: "linear-gradient(135deg,#1e3a8a,#60a5fa)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, fontWeight: 800, color: "#fff",
          boxShadow: "0 4px 24px rgba(37,99,235,0.4)",
          overflow: "hidden", flexShrink: 0,
        }}>
          {photoUrl
            ? <img src={photoUrl} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : (firstName ?? username ?? "U")[0]?.toUpperCase()
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9" }}>
            {firstName ?? username ?? `User ${telegramId.slice(-4)}`}
          </div>
          {username && <div style={{ fontSize: 12, color: "#60a5fa" }}>@{username}</div>}
          <div style={{ fontSize: 10, color: "#475569" }}>ID {telegramId}</div>
        </div>
        <button onClick={() => { haptic("light"); setShowLangPicker(true); }}
          style={{ background: "rgba(30,58,143,0.25)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 10, padding: "7px 11px", color: "#93c5fd", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", flexShrink: 0 }}>
          {lang === "ru" ? "🇷🇺 RU" : "🇬🇧 EN"}
        </button>
      </div>

      {/* ─── MAIN BALANCE CARD ─── */}
      <div style={{
        background: "linear-gradient(145deg, rgba(10,20,55,0.98) 0%, rgba(15,30,75,0.95) 100%)",
        border: "1px solid rgba(37,99,235,0.4)",
        borderRadius: 22, padding: "20px 18px 18px",
        marginBottom: 14,
        boxShadow: "0 12px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}>
        <div style={{ fontSize: 10, color: "#334155", fontWeight: 700, letterSpacing: "0.18em", marginBottom: 16 }}>
          ВАШ БАЛАНС
        </div>

        {/* Balances row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
          {/* TON */}
          <div style={{
            background: "rgba(0,152,234,0.12)", border: "1px solid rgba(0,152,234,0.3)",
            borderRadius: 16, padding: "14px 14px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <TonIcon size={24} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#93c5fd" }}>TON</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#f1f5f9", letterSpacing: "-0.03em", lineHeight: 1 }}>
              {userTon.toFixed(4)}
            </div>
          </div>

          {/* TONYX */}
          <div style={{
            background: "rgba(0,162,255,0.08)", border: "1px solid rgba(0,162,255,0.25)",
            borderRadius: 16, padding: "14px 14px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <TonyxIcon size={24} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#67e8f9" }}>TONYX</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#f1f5f9", letterSpacing: "-0.03em", lineHeight: 1 }}>
              <CountUp value={userTonyx} />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button
            onClick={() => togglePanel("topup")}
            style={{
              padding: "14px 0", borderRadius: 14, fontFamily: "inherit",
              background: activePanel === "topup"
                ? "linear-gradient(135deg,#0891b2,#22d3ee)"
                : "linear-gradient(135deg,rgba(8,145,178,0.3),rgba(34,211,238,0.2))",
              border: `1px solid ${activePanel === "topup" ? "rgba(34,211,238,0.6)" : "rgba(34,211,238,0.25)"}`,
              color: activePanel === "topup" ? "#fff" : "#67e8f9",
              fontSize: 14, fontWeight: 800, cursor: "pointer",
              boxShadow: activePanel === "topup" ? "0 0 20px rgba(34,211,238,0.35)" : "none",
              transition: "all 0.2s",
            }}
          >
            💎 Пополнить
          </button>
          <button
            onClick={() => { togglePanel("withdraw"); if (activePanel !== "withdraw") loadWithdrawHistory(); }}
            style={{
              padding: "14px 0", borderRadius: 14, fontFamily: "inherit",
              background: activePanel === "withdraw"
                ? "linear-gradient(135deg,#15803d,#22c55e)"
                : "linear-gradient(135deg,rgba(21,128,61,0.3),rgba(34,197,94,0.2))",
              border: `1px solid ${activePanel === "withdraw" ? "rgba(34,197,94,0.6)" : "rgba(34,197,94,0.25)"}`,
              color: activePanel === "withdraw" ? "#fff" : "#4ade80",
              fontSize: 14, fontWeight: 800, cursor: "pointer",
              boxShadow: activePanel === "withdraw" ? "0 0 20px rgba(34,197,94,0.3)" : "none",
              transition: "all 0.2s",
            }}
          >
            💸 Вывести
          </button>
        </div>
      </div>

      {/* ─── DEPOSIT PANEL ─── */}
      {activePanel === "topup" && (
        <div style={{ marginBottom: 14 }}>

          {/* Status bar */}
          {topupStep !== "idle" && (
            <div style={{
              background: topupStep === "credited"
                ? "rgba(22,163,74,0.12)" : topupStep === "timeout"
                ? "rgba(220,38,38,0.12)" : "rgba(37,99,235,0.12)",
              border: `1px solid ${topupStep === "credited" ? "rgba(34,197,94,0.4)" : topupStep === "timeout" ? "rgba(248,113,113,0.4)" : "rgba(59,130,246,0.4)"}`,
              borderRadius: 14, padding: "12px 16px", marginBottom: 12,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: topupStep === "credited" ? "#4ade80" : topupStep === "timeout" ? "#f87171" : "#60a5fa",
                boxShadow: topupStep === "verifying" ? "0 0 6px rgba(96,165,250,0.8)" : "none",
                animation: topupStep === "verifying" ? "scanPulse 1s ease-in-out infinite" : "none",
              }} />
              <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: topupStep === "credited" ? "#4ade80" : topupStep === "timeout" ? "#f87171" : "#93c5fd" }}>
                {topupStep === "verifying" && "🔍 Сканируем блокчейн TON... (до 2 мин)"}
                {topupStep === "credited"  && "✅ TON зачислен на баланс!"}
                {topupStep === "timeout"   && "⏰ Не найдено. Фоновый сканер проверяет каждые 30 сек."}
              </div>
              {(topupStep === "credited" || topupStep === "timeout") && (
                <button onClick={() => setTopupStep("idle")} style={{ background: "none", border: "none", color: "#475569", fontSize: 18, cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}>×</button>
              )}
              {topupStep === "verifying" && (
                <button onClick={stopVerification} style={{ background: "none", border: "none", color: "#475569", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Стоп</button>
              )}
            </div>
          )}

          <style>{`@keyframes scanPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }`}</style>

          {/* Transfer instructions */}
          <div style={{ background: "rgba(14,116,144,0.08)", border: "1px solid rgba(14,116,144,0.35)", borderRadius: 18, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <TonIcon size={22} />
              <div style={{ fontSize: 14, fontWeight: 800, color: "#22d3ee" }}>Пополнение TON</div>
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16, lineHeight: 1.65 }}>
              Отправьте TON на адрес ниже с точным комментарием-memo. Зачисление произойдёт автоматически в течение нескольких минут.
            </div>

            {/* Step 1 — Wallet address */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(34,211,238,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#22d3ee", flexShrink: 0 }}>1</div>
                <div style={{ fontSize: 11, color: "#67e8f9", fontWeight: 700, letterSpacing: "0.08em" }}>АДРЕС КОШЕЛЬКА</div>
              </div>
              <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
                <div style={{ flex: 1, background: "rgba(15,23,42,0.8)", borderRadius: 10, padding: "11px 13px", fontFamily: "monospace", fontSize: 11, color: "#67e8f9", wordBreak: "break-all", border: "1px solid rgba(14,116,144,0.35)", lineHeight: 1.5 }}>
                  {TOPUP_WALLET}
                </div>
                <button onClick={copyAddr} style={{ flexShrink: 0, padding: "0 14px", borderRadius: 10, border: "none", background: addrCopied ? "rgba(34,197,94,0.25)" : "rgba(14,116,144,0.25)", color: addrCopied ? "#4ade80" : "#67e8f9", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}>
                  {addrCopied ? "✓" : "📋"}
                </button>
              </div>
            </div>

            {/* Step 2 — Memo */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(147,197,253,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#93c5fd", flexShrink: 0 }}>2</div>
                <div style={{ fontSize: 11, color: "#93c5fd", fontWeight: 700, letterSpacing: "0.08em" }}>КОММЕНТАРИЙ (MEMO) — обязательно!</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, background: "rgba(15,23,42,0.8)", borderRadius: 10, padding: "12px 14px", fontSize: 15, color: "#c7d2fe", fontWeight: 800, fontFamily: "monospace", border: "1px solid rgba(99,102,241,0.4)", letterSpacing: "0.05em" }}>
                  {memo}
                </div>
                <button onClick={copyMemo} style={{ flexShrink: 0, padding: "12px 16px", borderRadius: 10, border: "none", background: memoCopied ? "rgba(34,197,94,0.25)" : "rgba(99,102,241,0.25)", color: memoCopied ? "#4ade80" : "#c7d2fe", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}>
                  {memoCopied ? "✓" : "📋"}
                </button>
              </div>
              <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                <div style={{ fontSize: 11, color: "#f87171", fontWeight: 700 }}>
                  ⚠️ Без точного комментария средства не будут зачислены!
                </div>
              </div>
            </div>

            {/* Step 3 — Min amount */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, background: "rgba(30,45,69,0.5)", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "#475569", marginBottom: 3, fontWeight: 600 }}>МИН. СУММА</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#fbbf24" }}>0.1 TON</div>
              </div>
              <div style={{ flex: 1, background: "rgba(30,45,69,0.5)", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "#475569", marginBottom: 3, fontWeight: 600 }}>ЗАЧИСЛЕНИЕ</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#4ade80" }}>авто</div>
              </div>
              <div style={{ flex: 1, background: "rgba(30,45,69,0.5)", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "#475569", marginBottom: 3, fontWeight: 600 }}>КОМИССИЯ</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#94a3b8" }}>0%</div>
              </div>
            </div>

            {/* Check button */}
            <button
              onClick={startVerification}
              disabled={topupChecking}
              style={{
                width: "100%", padding: "15px 0", borderRadius: 13, border: "none",
                background: topupChecking
                  ? "rgba(30,45,69,0.5)"
                  : "linear-gradient(135deg,#0369a1,#0891b2,#22d3ee)",
                color: topupChecking ? "#475569" : "#fff",
                fontSize: 15, fontWeight: 800, fontFamily: "inherit",
                cursor: topupChecking ? "not-allowed" : "pointer",
                boxShadow: topupChecking ? "none" : "0 0 22px rgba(34,211,238,0.35)",
                transition: "all 0.2s",
              }}
            >
              {topupChecking ? "🔍 Проверяем..." : "✅ Я отправил — проверить зачисление"}
            </button>
            <div style={{ fontSize: 10, color: "#334155", textAlign: "center", marginTop: 8 }}>
              Фоновый сканер также проверяет каждые 30 сек автоматически
            </div>
          </div>
        </div>
      )}

      {/* ─── WITHDRAW PANEL ─── */}
      {activePanel === "withdraw" && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ background: "rgba(17,24,39,0.95)", border: "1px solid rgba(22,163,74,0.3)", borderRadius: 18, padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9" }}>💸 Вывод TON</div>
              <div style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>
                Баланс: <span style={{ color: "#4ade80" }}>{userTon.toFixed(4)} TON</span>
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 14 }}>
              Минимум: 0.1 TON · Комиссия: 5% · При наличии мнемоники — автоматически
            </div>

            <input
              value={withdrawAmount}
              onChange={e => setWithdrawAmount(e.target.value)}
              type="number" step="0.01" min="0.1"
              placeholder="Сумма в TON (мин. 0.1)"
              style={{
                width: "100%", background: "rgba(30,45,69,0.6)",
                border: `1px solid ${parseFloat(withdrawAmount) > userTon ? "rgba(220,38,38,0.6)" : "rgba(30,58,143,0.4)"}`,
                borderRadius: 10, padding: "12px 14px", color: "#f1f5f9",
                fontFamily: "inherit", fontSize: 14, outline: "none",
                boxSizing: "border-box", marginBottom: 10,
              }}
            />

            {withdrawAmount && parseFloat(withdrawAmount) >= 0.1 && parseFloat(withdrawAmount) <= userTon && (
              <div style={{ background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.2)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 11, color: "#4ade80" }}>
                К получению: {(parseFloat(withdrawAmount) * 0.95).toFixed(4)} TON (−5% комиссия)
              </div>
            )}

            <input
              value={withdrawAddress}
              onChange={e => setWithdrawAddress(e.target.value)}
              type="text"
              placeholder="TON адрес (UQ… / EQ… / 0:hex)"
              style={{
                width: "100%", background: "rgba(30,45,69,0.6)",
                border: "1px solid rgba(30,58,143,0.4)",
                borderRadius: 10, padding: "12px 14px", color: "#f1f5f9",
                fontFamily: "inherit", fontSize: 14, outline: "none",
                boxSizing: "border-box", marginBottom: 10,
              }}
            />

            {withdrawAmount && parseFloat(withdrawAmount) > userTon && (
              <div style={{ background: "rgba(220,38,38,0.1)", borderRadius: 10, padding: "9px 14px", fontSize: 12, color: "#f87171", marginBottom: 10, fontWeight: 600 }}>
                ⚠️ Недостаточно TON. Баланс: {userTon.toFixed(4)} TON
              </div>
            )}

            <button
              onClick={submitWithdraw}
              disabled={withdrawPending || !withdrawAmount || !withdrawAddress || parseFloat(withdrawAmount) < 0.1 || parseFloat(withdrawAmount) > userTon}
              style={{
                width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                background: (withdrawPending || !withdrawAmount || !withdrawAddress || parseFloat(withdrawAmount || "0") < 0.1 || parseFloat(withdrawAmount || "0") > userTon)
                  ? "rgba(30,45,80,0.4)"
                  : "linear-gradient(135deg,#15803d,#22c55e)",
                color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: "pointer",
                opacity: (withdrawPending || parseFloat(withdrawAmount || "0") > userTon) ? 0.6 : 1,
                boxShadow: (!withdrawPending && parseFloat(withdrawAmount || "0") >= 0.1 && parseFloat(withdrawAmount || "0") <= userTon && withdrawAddress)
                  ? "0 0 20px rgba(34,197,94,0.35)" : "none",
              }}
            >
              {withdrawPending ? "⏳ Отправляем…" : "Вывод"}
            </button>
          </div>

          {/* Withdrawal history */}
          {withdrawHistory.length > 0 && (
            <div style={{ background: "rgba(17,24,39,0.9)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 18, padding: 16 }}>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 10, letterSpacing: "0.12em", fontWeight: 600 }}>ИСТОРИЯ ВЫВОДОВ</div>
              {withdrawHistory.slice().reverse().slice(0, 10).map(w => (
                <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(30,58,143,0.15)" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>
                      {w.tonAmount != null ? `${Number(w.tonAmount).toFixed(4)} TON` : `${w.amount} pts`}
                    </div>
                    <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>
                      {w.address.slice(0, 12)}…{w.address.slice(-6)}
                    </div>
                    {w.txHash && (
                      <div style={{ fontSize: 9, color: "#4ade80", fontFamily: "monospace", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
                        tx: {w.txHash}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: "#334155" }}>{new Date(w.createdAt).toLocaleDateString()}</div>
                  </div>
                  <StatusBadge status={w.status} />
                </div>
              ))}
            </div>
          )}

          {withdrawHistory.length === 0 && (
            <button onClick={loadWithdrawHistory} style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: "1px solid rgba(30,58,143,0.25)", background: "transparent", color: "#475569", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>
              📜 Показать историю выводов
            </button>
          )}
        </div>
      )}

      {/* ─── TRANSACTION HISTORY ─── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ background: "rgba(17,24,39,0.95)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 18, padding: 16 }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: txHistoryLoaded ? 14 : 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#e2e8f0", letterSpacing: "0.06em" }}>📊 ИСТОРИЯ ОПЕРАЦИЙ</div>
            <div style={{ display: "flex", gap: 6 }}>
              {!txHistoryLoaded && (
                <button
                  onClick={() => { haptic("light"); void loadTxHistory(); }}
                  disabled={txHistoryLoading}
                  style={{ padding: "5px 13px", borderRadius: 8, border: "1px solid rgba(59,130,246,0.4)", background: "rgba(59,130,246,0.12)", color: "#60a5fa", fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: txHistoryLoading ? "not-allowed" : "pointer", opacity: txHistoryLoading ? 0.6 : 1 }}
                >
                  {txHistoryLoading ? "⏳ Загрузка..." : "📜 Показать"}
                </button>
              )}
              {txHistoryLoaded && (
                <button
                  onClick={() => { haptic("light"); void loadTxHistory(); }}
                  disabled={txHistoryLoading}
                  style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid rgba(59,130,246,0.3)", background: "rgba(59,130,246,0.08)", color: "#60a5fa", fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: txHistoryLoading ? "not-allowed" : "pointer", opacity: txHistoryLoading ? 0.5 : 1 }}
                >
                  {txHistoryLoading ? "⏳" : "🔄 Обновить"}
                </button>
              )}
            </div>
          </div>

          {/* Tabs — shown only after first load */}
          {txHistoryLoaded && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14, marginTop: 14 }}>
              {(["deposits", "withdrawals"] as const).map(tab => {
                const isActive = txTab === tab;
                const label    = tab === "deposits" ? "📥 Депозиты" : "📤 Выводы";
                const count    = tab === "deposits" ? txHistory.deposits.length : txHistory.withdrawals.length;
                return (
                  <button
                    key={tab}
                    onClick={() => { haptic("light"); setTxTab(tab); }}
                    style={{
                      padding: "9px 0", borderRadius: 10, fontFamily: "inherit",
                      border: `1px solid ${isActive ? (tab === "deposits" ? "rgba(34,211,238,0.5)" : "rgba(34,197,94,0.5)") : "rgba(30,58,143,0.3)"}`,
                      background: isActive
                        ? (tab === "deposits" ? "rgba(14,116,144,0.22)" : "rgba(22,163,74,0.18)")
                        : "rgba(17,24,39,0.6)",
                      color: isActive ? (tab === "deposits" ? "#22d3ee" : "#4ade80") : "#475569",
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {label}
                    {count > 0 && (
                      <span style={{ marginLeft: 5, background: isActive ? "rgba(255,255,255,0.15)" : "rgba(71,85,105,0.4)", borderRadius: 5, padding: "1px 5px", fontSize: 10 }}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Loading spinner */}
          {!txHistoryLoaded && txHistoryLoading && (
            <div style={{ textAlign: "center", padding: "22px 0", color: "#475569", fontSize: 12 }}>⏳ Загрузка...</div>
          )}

          {txHistoryLoaded && txTab === "deposits" && (
            txHistory.deposits.length === 0 ? (
              <div style={{ textAlign: "center", color: "#475569", padding: "18px 0", fontSize: 12 }}>Пополнений ещё не было</div>
            ) : (
              <div>
                {txHistory.deposits.map((d, i) => {
                  const isOk      = d.status === "completed";
                  const isPending = d.status === "pending" || d.status === "processing";
                  const isRejected = !isOk && !isPending;
                  const statusColor  = isOk ? "#4ade80" : isPending ? "#fbbf24" : "#f87171";
                  const statusLabel  = isOk ? "✅ Успешно" : isPending ? "⏳ В обработке" : "❌ Отклонено";
                  const statusBg     = isOk ? "rgba(34,197,94,0.12)" : isPending ? "rgba(251,191,36,0.12)" : "rgba(248,113,113,0.12)";
                  const statusBorder = isOk ? "rgba(34,197,94,0.3)"  : isPending ? "rgba(251,191,36,0.3)"  : "rgba(248,113,113,0.3)";
                  void isRejected;
                  return (
                    <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < txHistory.deposits.length - 1 ? "1px solid rgba(34,211,238,0.07)" : "none" }}>
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>💎</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0" }}>
                          +{d.tonAmount != null ? Number(d.tonAmount).toFixed(4) : "—"} TON
                        </div>
                        {d.txHash && (
                          <div style={{ fontSize: 9, color: "#334155", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>
                            tx: {d.txHash.slice(0, 22)}…
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>
                          {new Date(d.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <div style={{ background: statusBg, border: `1px solid ${statusBorder}`, borderRadius: 8, padding: "3px 9px", flexShrink: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: statusColor, whiteSpace: "nowrap" }}>{statusLabel}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {txHistoryLoaded && txTab === "withdrawals" && (
            txHistory.withdrawals.length === 0 ? (
              <div style={{ textAlign: "center", color: "#475569", padding: "18px 0", fontSize: 12 }}>Выводов ещё не было</div>
            ) : (
              <div>
                {txHistory.withdrawals.map((w, i) => {
                  const isOk      = w.status === "completed" || w.status === "approved";
                  const isPending = w.status === "pending" || w.status === "processing";
                  const statusColor  = isOk ? "#4ade80" : isPending ? "#fbbf24" : "#f87171";
                  const statusLabel  = isOk ? "✅ Успешно" : isPending ? "⏳ В обработке" : "❌ Отклонено";
                  const statusBg     = isOk ? "rgba(34,197,94,0.12)" : isPending ? "rgba(251,191,36,0.12)" : "rgba(248,113,113,0.12)";
                  const statusBorder = isOk ? "rgba(34,197,94,0.3)"  : isPending ? "rgba(251,191,36,0.3)"  : "rgba(248,113,113,0.3)";
                  return (
                    <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < txHistory.withdrawals.length - 1 ? "1px solid rgba(22,163,74,0.07)" : "none" }}>
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(22,163,74,0.1)", border: "1px solid rgba(22,163,74,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>💸</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0" }}>
                          −{w.tonAmount != null ? Number(w.tonAmount).toFixed(4) : "—"} TON
                        </div>
                        {w.address && (
                          <div style={{ fontSize: 9, color: "#334155", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>
                            → {w.address.slice(0, 10)}…{w.address.slice(-6)}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>
                          {new Date(w.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <div style={{ background: statusBg, border: `1px solid ${statusBorder}`, borderRadius: 8, padding: "3px 9px", flexShrink: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: statusColor, whiteSpace: "nowrap" }}>{statusLabel}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>

      {/* ─── INVITE CARD (always visible) ─── */}
      <div data-tour="profile-referral" style={{ background: "rgba(17,24,39,0.9)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 18, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#c084fc", marginBottom: 4 }}>👥 Пригласить друзей</div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 12, lineHeight: 1.6 }}>
          Получай <b style={{ color: "#c084fc" }}>10%</b> от TON-наград каждого приглашённого навсегда.
          <span style={{ color: "#4ade80", fontWeight: 700, marginLeft: 8 }}>
            {referrals?.referrals?.length ?? 0} рефер.
          </span>
        </div>
        <div style={{ background: "rgba(30,45,69,0.6)", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "#c084fc", wordBreak: "break-all", fontFamily: "monospace", border: "1px solid rgba(168,85,247,0.25)", marginBottom: 10 }}>
          {inviteLink}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={copyLink} style={{
            flex: 1, padding: "11px 0", borderRadius: 10, border: "none",
            background: copied ? "rgba(34,197,94,0.25)" : "linear-gradient(135deg,#7c3aed,#a855f7)",
            color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
            boxShadow: copied ? "none" : "0 4px 14px rgba(168,85,247,0.3)",
          }}>
            {copied ? "✓ Скопировано" : "📋 Копировать"}
          </button>
          <button onClick={() => {
            haptic("light");
            const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent("Играй и зарабатывай TON в TONYX! 🎮")}`;
            window.open(shareUrl, "_blank");
          }} style={{
            flex: 1, padding: "11px 0", borderRadius: 10,
            background: "rgba(37,99,235,0.2)", border: "1px solid rgba(59,130,246,0.3)",
            color: "#60a5fa", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
          }}>
            ✈️ Поделиться
          </button>
        </div>
      </div>

      {/* ─── Activity history (always visible) ─── */}
      <div style={{ background: "rgba(17,24,39,0.9)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 18, padding: 16 }}>
        <div style={{ fontSize: 10, color: "#64748b", marginBottom: 12, letterSpacing: "0.12em", fontWeight: 600 }}>📜 ПОСЛЕДНЯЯ АКТИВНОСТЬ</div>
        {!history || !history.items || history.items.length === 0 ? (
          <div style={{ textAlign: "center", color: "#475569", padding: "20px 0", fontSize: 13 }}>
            Активности нет — смотри рекламу, играй, выводи TON
          </div>
        ) : (
          (history.items as Array<{ kind: string; id: number | string; title: string; amount: number; positive: boolean; timestamp: string }>).map(it => (
            <div key={`${it.kind}-${it.id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(30,58,143,0.12)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={{ fontSize: 18, width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: it.kind === "ad" ? "rgba(37,99,235,0.15)" : it.kind === "withdraw" ? "rgba(22,163,74,0.15)" : "rgba(168,85,247,0.15)", flexShrink: 0 }}>
                  {it.kind === "ad" ? "📺" : it.kind === "withdraw" ? "💸" : "🎮"}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title}</div>
                  <div style={{ fontSize: 10, color: "#475569" }}>{new Date(it.timestamp).toLocaleString()}</div>
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: it.positive ? "#4ade80" : "#f87171", fontVariantNumeric: "tabular-nums", flexShrink: 0, marginLeft: 8 }}>
                {it.positive ? "+" : ""}{it.amount.toLocaleString()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
