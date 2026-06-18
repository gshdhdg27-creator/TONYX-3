import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
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

const TOPUP_WALLET   = process.env.PROJECT_WALLET_ADDRESS ?? "UQA8d39yaqa-CGw6BUCQw6U3LGelzpS3GxFaVwVDY3BnCDwe";
const TOPUP_AMOUNTS  = [0.5, 1, 5, 10] as const;

function toNano(ton: number): string {
  return Math.round(ton * 1_000_000_000).toString();
}

function buildCommentPayload(text: string): string {
  const textBytes = new TextEncoder().encode(text);
  const data = new Uint8Array(4 + textBytes.length);
  data.set(textBytes, 4);
  let binary = "";
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
  return btoa(binary);
}

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

type ActivePanel = null | "topup" | "withdraw";
type TopupStep   = "idle" | "tx_sent" | "verifying" | "credited" | "timeout";

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

  const [activePanel, setActivePanel]           = useState<ActivePanel>(null);
  const [showLangPicker, setShowLangPicker]     = useState(false);
  const [toast, setToast]                       = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [copied, setCopied]                     = useState(false);
  const [addrCopied, setAddrCopied]             = useState(false);
  const [memoCopied, setMemoCopied]             = useState(false);

  // Withdraw state
  const [withdrawAmount, setWithdrawAmount]     = useState("");
  const [withdrawAddress, setWithdrawAddress]   = useState("");
  const [withdrawPending, setWithdrawPending]   = useState(false);
  const [withdrawHistory, setWithdrawHistory]   = useState<WithdrawalHistoryItem[]>([]);

  // Topup state
  const [topupAmount, setTopupAmount]           = useState<number>(1);
  const [topupPending, setTopupPending]         = useState(false);
  const [topupStep, setTopupStep]               = useState<TopupStep>("idle");
  const pollRef                                 = useRef<ReturnType<typeof setInterval> | null>(null);

  const [tonConnectUI] = useTonConnectUI();
  const wallet         = useTonWallet();

  const { data: profile } = useGetUserProfile(telegramId ?? "", { query: { enabled: !!telegramId, refetchInterval: 10000 } });
  const { data: referrals } = useGetReferrals(telegramId ?? "", { query: { enabled: !!telegramId } });
  const { data: history } = useGetMiniHistory(telegramId ?? "", { query: { enabled: !!telegramId, refetchInterval: 30000 } });

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const memo = `TOPUP_${telegramId ?? ""}`;

  // Cleanup polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  if (!telegramId) return <LoadingScreen />;

  const userTon   = Number((profile as { ton?: string | number } | undefined)?.ton ?? 0);
  const userTonyx = Number((profile as { tonyxCoins?: number } | undefined)?.tonyxCoins ?? 0);
  const inviteLink = `https://t.me/TONYX_game_bot?start=${telegramId ?? ""}`;

  const togglePanel = (panel: ActivePanel) => {
    haptic("light");
    setActivePanel(prev => prev === panel ? null : panel);
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

  /* ── Verification polling ── */
  const startVerification = (expectedTon: number) => {
    setTopupStep("verifying");
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 24) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setTopupStep("timeout");
        showToast("Транзакция не найдена за 2 минуты. Обратитесь в поддержку.", "error");
        return;
      }
      try {
        const r = await fetch("/api/mini/wallet/topup/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telegramId, expectedAmount: expectedTon }),
        });
        const d = await r.json() as { found?: boolean; credited?: boolean; alreadyCredited?: boolean; message?: string; amount?: number };
        if (d.found && (d.credited || d.alreadyCredited)) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setTopupStep("credited");
          showToast(d.message ?? `✅ TON зачислено!`, "success");
          qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId) });
        }
      } catch { /* keep polling */ }
    }, 5000);
  };

  /* ── Send via TON Connect ── */
  const sendTonPayment = async () => {
    if (!telegramId) return;
    haptic("medium");
    try {
      if (!wallet) { await tonConnectUI.openModal(); return; }
      setTopupPending(true);
      setTopupStep("idle");
      const payload = buildCommentPayload(memo);
      const result  = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{ address: TOPUP_WALLET, amount: toNano(topupAmount), payload }],
      });
      // Register intent
      await fetch("/api/mini/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, amount: topupAmount, memo, txBoc: result.boc, walletAddress: wallet.account.address }),
      });
      hapticNotify("success");
      showToast(`✅ ${topupAmount} TON отправлено! Верифицируем...`, "success");
      setTopupStep("tx_sent");
      startVerification(topupAmount);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes("reject") && !msg.toLowerCase().includes("cancel")) {
        showToast("Ошибка транзакции — попробуйте снова", "error");
      }
      setTopupStep("idle");
    } finally {
      setTopupPending(false);
    }
  };

  /* ── Submit withdraw ── */
  const loadWithdrawHistory = async () => {
    if (!telegramId) return;
    try {
      const r = await fetch(`/api/mini/wallet/withdrawals/${telegramId}`);
      if (r.ok) { const d = await r.json(); setWithdrawHistory(d.withdrawals ?? []); }
    } catch { /* ignore */ }
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
              <span style={{ fontSize: 10, color: "#38bdf8", fontWeight: 800, letterSpacing: "0.12em" }}>TON</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {userTon.toFixed(3)}
            </div>
            <div style={{ fontSize: 9, color: "rgba(0,152,234,0.5)", marginTop: 4 }}>Toncoin</div>
          </div>

          {/* TONYX */}
          <div style={{
            background: "rgba(37,99,235,0.1)", border: "1px solid rgba(59,130,246,0.25)",
            borderRadius: 16, padding: "14px 14px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <TonyxIcon size={24} />
              <span style={{ fontSize: 10, color: "#60a5fa", fontWeight: 800, letterSpacing: "0.12em" }}>TONYX</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              <CountUp value={userTonyx} />
            </div>
            <div style={{ fontSize: 9, color: "rgba(59,130,246,0.5)", marginTop: 4 }}>Game token</div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button
            onClick={() => togglePanel("topup")}
            style={{
              padding: "14px 0", borderRadius: 14, border: "none", fontFamily: "inherit",
              background: activePanel === "topup"
                ? "linear-gradient(135deg,#0891b2,#22d3ee)"
                : "rgba(8,145,178,0.15)",
              border: activePanel === "topup" ? "none" : "1px solid rgba(8,145,178,0.3)",
              color: activePanel === "topup" ? "#fff" : "#22d3ee",
              fontSize: 14, fontWeight: 800, cursor: "pointer",
              boxShadow: activePanel === "topup" ? "0 0 24px rgba(34,211,238,0.4)" : "none",
              transition: "all 0.2s",
            } as React.CSSProperties}
          >
            💎 Пополнить
          </button>
          <button
            onClick={() => { togglePanel("withdraw"); if (activePanel !== "withdraw") loadWithdrawHistory(); }}
            style={{
              padding: "14px 0", borderRadius: 14, border: "none", fontFamily: "inherit",
              background: activePanel === "withdraw"
                ? "linear-gradient(135deg,#15803d,#22c55e)"
                : "rgba(22,163,74,0.15)",
              border: activePanel === "withdraw" ? "none" : "1px solid rgba(22,163,74,0.3)",
              color: activePanel === "withdraw" ? "#fff" : "#4ade80",
              fontSize: 14, fontWeight: 800, cursor: "pointer",
              boxShadow: activePanel === "withdraw" ? "0 0 24px rgba(34,197,94,0.4)" : "none",
              transition: "all 0.2s",
            } as React.CSSProperties}
          >
            💸 Вывести
          </button>
        </div>
      </div>

      {/* ─── DEPOSIT PANEL ─── */}
      {activePanel === "topup" && (
        <div style={{ marginBottom: 14 }}>
          <style>{`@keyframes tcPulse { 0%,100%{box-shadow:0 0 16px rgba(34,211,238,0.3)} 50%{box-shadow:0 0 30px rgba(34,211,238,0.65)} }`}</style>

          {/* Verification status bar */}
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
                boxShadow: topupStep === "verifying" ? "0 0 6px #60a5fa" : "none",
              }} />
              <div style={{ fontSize: 12, fontWeight: 700, color: topupStep === "credited" ? "#4ade80" : topupStep === "timeout" ? "#f87171" : "#93c5fd" }}>
                {topupStep === "tx_sent"   && "Транзакция отправлена. Ожидаем подтверждения блокчейна..."}
                {topupStep === "verifying" && "Верифицируем транзакцию в сети TON..."}
                {topupStep === "credited"  && "✅ Баланс пополнен!"}
                {topupStep === "timeout"   && "⏰ Транзакция не найдена. Обратитесь в поддержку."}
              </div>
              {(topupStep === "credited" || topupStep === "timeout") && (
                <button onClick={() => setTopupStep("idle")} style={{ marginLeft: "auto", background: "none", border: "none", color: "#475569", fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>×</button>
              )}
            </div>
          )}

          {/* TON Connect block */}
          <div style={{ background: "rgba(8,145,178,0.08)", border: "1px solid rgba(8,145,178,0.35)", borderRadius: 18, padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <TonIcon size={22} />
              <div style={{ fontSize: 14, fontWeight: 800, color: "#22d3ee" }}>TON Connect</div>
              <div style={{ marginLeft: "auto", fontSize: 10, background: "rgba(34,197,94,0.2)", color: "#4ade80", padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>АВТО</div>
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 14, lineHeight: 1.6 }}>
              Подключите TON-кошелёк и оплатите в один клик — зачисление автоматически после верификации в сети.
            </div>

            {/* Amount selector */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {TOPUP_AMOUNTS.map(amt => (
                <button key={amt} onClick={() => setTopupAmount(amt)} style={{
                  flex: 1, padding: "10px 0", borderRadius: 10, border: "none", fontFamily: "inherit",
                  background: topupAmount === amt ? "linear-gradient(135deg,#0891b2,#22d3ee)" : "rgba(30,45,69,0.7)",
                  color: topupAmount === amt ? "#fff" : "#64748b",
                  fontSize: 13, fontWeight: 800, cursor: "pointer",
                  boxShadow: topupAmount === amt ? "0 0 14px rgba(34,211,238,0.35)" : "none",
                  transition: "all 0.15s",
                }}>
                  {amt} TON
                </button>
              ))}
            </div>

            {!wallet ? (
              <button onClick={() => tonConnectUI.openModal()} style={{
                width: "100%", padding: "14px 0", borderRadius: 12, border: "none", fontFamily: "inherit",
                background: "linear-gradient(135deg,#0369a1,#0891b2,#22d3ee)",
                color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer",
                animation: "tcPulse 2.5s ease infinite",
              }}>
                🔗 Подключить кошелёк
              </button>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10, padding: "8px 12px" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
                  <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 600 }}>Кошелёк подключён</span>
                  <button onClick={() => tonConnectUI.disconnect()} style={{ marginLeft: "auto", background: "none", border: "none", color: "#475569", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                    Отключить
                  </button>
                </div>
                <button
                  onClick={sendTonPayment}
                  disabled={topupPending || topupStep === "verifying" || topupStep === "tx_sent"}
                  style={{
                    width: "100%", padding: "14px 0", borderRadius: 12, border: "none", fontFamily: "inherit",
                    background: (topupPending || topupStep === "verifying" || topupStep === "tx_sent")
                      ? "rgba(30,45,69,0.6)"
                      : "linear-gradient(135deg,#0369a1,#0891b2,#22d3ee)",
                    color: "#fff", fontSize: 15, fontWeight: 800,
                    cursor: (topupPending || topupStep === "verifying" || topupStep === "tx_sent") ? "not-allowed" : "pointer",
                    boxShadow: (topupPending || topupStep === "verifying" || topupStep === "tx_sent") ? "none" : "0 0 22px rgba(34,211,238,0.35)",
                  }}
                >
                  {topupPending ? "⏳ Отправка..."
                    : topupStep === "tx_sent" || topupStep === "verifying" ? "⏳ Верификация..."
                    : `💳 Пополнить ${topupAmount} TON`}
                </button>
              </div>
            )}
          </div>

          {/* Manual transfer block */}
          <div style={{ background: "rgba(14,116,144,0.08)", border: "1px solid rgba(14,116,144,0.3)", borderRadius: 18, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#67e8f9", marginBottom: 4 }}>
              📨 Ручной перевод
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 12, lineHeight: 1.6 }}>
              Отправьте TON на адрес ниже с обязательным комментарием (Memo). Зачисление после подтверждения в сети.
            </div>

            <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>АДРЕС КОШЕЛЬКА</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, background: "rgba(15,23,42,0.8)", borderRadius: 8, padding: "10px 12px", fontFamily: "monospace", fontSize: 11, color: "#67e8f9", wordBreak: "break-all", border: "1px solid rgba(14,116,144,0.3)" }}>
                {TOPUP_WALLET}
              </div>
              <button onClick={copyAddr} style={{ flexShrink: 0, padding: "10px 12px", borderRadius: 8, border: "none", background: addrCopied ? "rgba(34,197,94,0.2)" : "rgba(14,116,144,0.2)", color: addrCopied ? "#4ade80" : "#67e8f9", fontFamily: "inherit", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                {addrCopied ? "✓" : "📋"}
              </button>
            </div>

            <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>MEMO / КОММЕНТАРИЙ</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, background: "rgba(15,23,42,0.6)", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#93c5fd", fontWeight: 700, fontFamily: "monospace", border: "1px solid rgba(30,58,143,0.4)" }}>
                {memo}
              </div>
              <button onClick={copyMemo} style={{ flexShrink: 0, padding: "10px 12px", borderRadius: 8, border: "none", background: memoCopied ? "rgba(34,197,94,0.2)" : "rgba(30,58,143,0.2)", color: memoCopied ? "#4ade80" : "#93c5fd", fontFamily: "inherit", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                {memoCopied ? "✓" : "📋"}
              </button>
            </div>
            <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 600, marginTop: 8 }}>
              ⚠️ Без комментария зачисление невозможно!
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

      {/* ─── INVITE CARD (always visible) ─── */}
      <div style={{ background: "rgba(17,24,39,0.9)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 18, padding: 16, marginBottom: 14 }}>
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
            flex: 1, padding: "11px 0", borderRadius: 10, border: "none",
            background: "rgba(37,99,235,0.2)", border: "1px solid rgba(59,130,246,0.3)",
            color: "#60a5fa", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
          } as React.CSSProperties}>
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
