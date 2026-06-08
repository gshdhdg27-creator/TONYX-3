import { useState, useEffect } from "react";
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

const TOPUP_WALLET = "UQA8d39yaqa-CGw6BUCQw6U3LGelzpS3GxFaVwVDY3BnCDwe";
const TOPUP_AMOUNTS = [0.1, 0.5, 1, 5] as const;

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
      background: type === "success" ? "rgba(22,163,74,0.95)" : "rgba(220,38,38,0.95)",
      color: "#fff", padding: "12px 20px", borderRadius: 12,
      fontSize: 14, fontWeight: 600, zIndex: 9999, maxWidth: "calc(100% - 32px)",
      boxShadow: "0 8px 28px rgba(0,0,0,0.4)", animation: "bounceIn 0.3s ease-out",
    }}>{msg}</div>
  );
}

type Section = "main" | "withdraw" | "invite" | "topup";

interface ActionButtonProps {
  icon: string; label: string; active: boolean; onClick: () => void; accent: string;
}

function ActionButton({ icon, label, active, onClick, accent }: ActionButtonProps) {
  return (
    <button onClick={onClick} className="tile-bounce" style={{
      flex: 1, padding: "14px 8px", borderRadius: 14,
      background: active ? `linear-gradient(135deg, ${accent}aa, ${accent}55)` : "rgba(17,24,39,0.85)",
      border: `1px solid ${active ? accent : "rgba(30,58,143,0.3)"}`,
      color: active ? "#fff" : "#cbd5e1",
      fontSize: 12, fontWeight: 700, fontFamily: "inherit",
      cursor: "pointer", transition: "all 0.2s",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      boxShadow: active ? `0 0 20px ${accent}55` : "none",
    }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ letterSpacing: "0.04em" }}>{label}</div>
    </button>
  );
}

function LoadingScreen() {
  return (
    <div style={{ padding: "16px 16px 28px" }}>
      {/* Avatar + name skeleton */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(30,58,143,0.25)", animation: "pulse 1.4s ease-in-out infinite" }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: "55%", height: 16, borderRadius: 8, background: "rgba(30,58,143,0.2)", marginBottom: 8, animation: "pulse 1.4s ease-in-out infinite" }} />
          <div style={{ width: "35%", height: 11, borderRadius: 6, background: "rgba(30,58,143,0.15)", animation: "pulse 1.4s ease-in-out infinite" }} />
        </div>
      </div>
      {/* Balance pills skeleton */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        {[0, 1].map(i => (
          <div key={i} style={{ borderRadius: 18, background: "rgba(30,58,143,0.15)", height: 68, animation: "pulse 1.4s ease-in-out infinite" }} />
        ))}
      </div>
      {/* Action buttons skeleton */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ flex: 1, borderRadius: 14, height: 64, background: "rgba(30,58,143,0.12)", animation: "pulse 1.4s ease-in-out infinite" }} />
        ))}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:1} }`}</style>
    </div>
  );
}

interface WithdrawalHistoryItem {
  id: number;
  tonAmount: number | null;
  amount: number;
  address: string;
  status: string;
  txHash: string | null;
  createdAt: string;
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    pending:   { bg: "rgba(217,119,6,0.2)",   color: "#fbbf24", label: "⏳ ожидает" },
    completed: { bg: "rgba(22,163,74,0.2)",   color: "#4ade80", label: "✅ выплачено" },
    approved:  { bg: "rgba(22,163,74,0.2)",   color: "#4ade80", label: "✅ одобрено" },
    rejected:  { bg: "rgba(220,38,38,0.2)",   color: "#f87171", label: "❌ отклонено" },
  };
  const c = cfg[status] ?? cfg.pending;
  return (
    <span style={{ background: c.bg, color: c.color, padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700 }}>
      {c.label}
    </span>
  );
}

export default function ProfilePage() {
  const { telegramId, username, firstName, photoUrl } = useTelegram();
  const { t, lang, setLang } = useLang();
  const tp = t.profile;
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>("main");
  const [tonWithdrawAmount, setTonWithdrawAmount] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawPending, setWithdrawPending] = useState(false);
  const [withdrawHistory, setWithdrawHistory] = useState<WithdrawalHistoryItem[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);

  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const [topupAmount, setTopupAmount] = useState<number>(1);
  const [topupPending, setTopupPending] = useState(false);
  const [addrCopied, setAddrCopied] = useState(false);
  const [memoCopied, setMemoCopied] = useState(false);

  const { data: profile } = useGetUserProfile(telegramId ?? "", { query: { enabled: !!telegramId, refetchInterval: 15000 } });
  const { data: referrals } = useGetReferrals(telegramId ?? "", { query: { enabled: !!telegramId } });
  const { data: history } = useGetMiniHistory(telegramId ?? "", { query: { enabled: !!telegramId && section === "main", refetchInterval: 20000 } });

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const memo = `TOPUP_${telegramId ?? ""}`;

  const copyAddr = async () => {
    try { await navigator.clipboard.writeText(TOPUP_WALLET); setAddrCopied(true); haptic("light"); setTimeout(() => setAddrCopied(false), 1500); } catch {}
  };
  const copyMemo = async () => {
    try { await navigator.clipboard.writeText(memo); setMemoCopied(true); haptic("light"); setTimeout(() => setMemoCopied(false), 1500); } catch {}
  };

  const sendTonPayment = async () => {
    if (!telegramId) return;
    haptic("medium");
    try {
      if (!wallet) {
        await tonConnectUI.openModal();
        return;
      }
      setTopupPending(true);
      const payload = buildCommentPayload(memo);
      const result = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{
          address: TOPUP_WALLET,
          amount: toNano(topupAmount),
          payload,
        }],
      });
      await fetch("/api/mini/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, amount: topupAmount, memo, txBoc: result.boc, walletAddress: wallet.account.address }),
      });
      hapticNotify("success");
      showToast(`✅ ${topupAmount} TON отправлено! Зачисление после проверки.`, "success");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("Reject") && !msg.includes("reject") && !msg.includes("cancel")) {
        showToast("Ошибка оплаты — попробуйте снова", "error");
      }
    } finally {
      setTopupPending(false);
    }
  };

  const loadWithdrawHistory = async () => {
    if (!telegramId) return;
    try {
      const r = await fetch(`/api/mini/wallet/withdrawals/${telegramId}`);
      if (r.ok) {
        const d = await r.json();
        setWithdrawHistory(d.withdrawals ?? []);
      }
    } catch { /* ignore */ }
  };

  const submitWithdraw = async () => {
    if (!telegramId) return;
    haptic("heavy");
    const amount = parseFloat(tonWithdrawAmount);
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
      showToast(d.message ?? "Заявка отправлена!", "success");
      setTonWithdrawAmount(""); setWithdrawAddress("");
      qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId) });
      await loadWithdrawHistory();
    } catch { showToast("Ошибка сети, попробуйте снова", "error"); }
    finally { setWithdrawPending(false); }
  };

  useEffect(() => {
    if (section === "withdraw" && telegramId) {
      loadWithdrawHistory();
    }
  }, [section, telegramId]);

  if (!telegramId) return <LoadingScreen />;

  const userTon   = Number((profile as { ton?: string | number } | undefined)?.ton ?? 0);
  const userTonyx = Number((profile as { tonyxCoins?: number } | undefined)?.tonyxCoins ?? 0);
  const boostRate = Number((profile as { boostRate?: number } | undefined)?.boostRate ?? 0);
  const inviteLink = `https://t.me/TONYX_game_bot?start=${telegramId ?? ""}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      haptic("light");
      setTimeout(() => setCopied(false), 1500);
    } catch { showToast("Copy failed", "error"); }
  };

  const chooseLang = (l: Lang) => {
    haptic("medium");
    setLang(l);
    setShowLangPicker(false);
  };

  return (
    <div style={{ padding: "16px 16px 28px" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* ─── Language picker modal ─── */}
      {showLangPicker && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(5,8,20,0.96)", display: "flex",
          alignItems: "center", justifyContent: "center", flexDirection: "column",
          padding: "0 28px", backdropFilter: "blur(12px)",
        }}
          onClick={() => setShowLangPicker(false)}
        >
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 320 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", textAlign: "center", marginBottom: 24 }}>
              {t.langModal.title}
            </div>
            {(["ru", "en"] as Lang[]).map(l => (
              <button key={l} onClick={() => chooseLang(l)} style={{
                width: "100%", padding: "18px 24px", borderRadius: 16, marginBottom: 12,
                border: `1px solid ${lang === l ? "rgba(96,165,250,0.7)" : "rgba(96,165,250,0.2)"}`,
                background: lang === l
                  ? "linear-gradient(135deg, rgba(30,58,143,0.7), rgba(37,99,235,0.4))"
                  : "rgba(17,24,39,0.8)",
                color: "#f1f5f9", fontSize: 18, fontWeight: 700,
                fontFamily: "inherit", cursor: "pointer",
                boxShadow: lang === l ? "0 0 20px rgba(37,99,235,0.3)" : "none",
              }}>
                {l === "ru" ? t.langModal.ru : t.langModal.en}
                {lang === l && <span style={{ marginLeft: 8, color: "#60a5fa" }}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Header ─── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <div style={{
          width: 60, height: 60, borderRadius: "50%",
          background: "linear-gradient(135deg, #1e3a8a, #60a5fa)",
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
            {firstName ?? username ?? `User ${telegramId?.slice(-4)}`}
          </div>
          {username && <div style={{ fontSize: 12, color: "#60a5fa" }}>@{username}</div>}
          <div style={{ fontSize: 10, color: "#475569" }}>ID {telegramId}</div>
        </div>
        <button
          onClick={() => { haptic("light"); setShowLangPicker(true); }}
          style={{
            background: "rgba(30,58,143,0.25)", border: "1px solid rgba(96,165,250,0.25)",
            borderRadius: 10, padding: "7px 11px", color: "#93c5fd",
            fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {lang === "ru" ? "🇷🇺 RU" : "🇬🇧 EN"}
        </button>
      </div>

      {/* ─── Balance pills ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        {/* TON */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "rgba(0,152,234,0.13)",
          border: "1px solid rgba(0,152,234,0.35)",
          borderRadius: 18, padding: "12px 16px",
          boxShadow: "0 0 18px rgba(0,152,234,0.1)",
        }}>
          <svg width="36" height="36" viewBox="0 0 56 56" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="28" cy="28" r="28" fill="#0098EA"/>
            <path d="M36.8 15H19.2c-3.3 0-5.3 3.7-3.4 6.4l10 14.8c1.4 2 4.2 2 5.6 0l10-14.8c1.9-2.7-.1-6.4-3.6-6.4z" fill="white"/>
          </svg>
          <div>
            <div style={{ fontSize: 9, color: "rgba(0,162,255,0.7)", letterSpacing: "0.15em", fontWeight: 700, textTransform: "uppercase" }}>TON</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
              {userTon.toFixed(3)}
            </div>
            {boostRate > 0 && (
              <div style={{ fontSize: 9, color: "#4ade80", fontWeight: 700, marginTop: 2 }}>
                {tp.boost((boostRate * 100))}
              </div>
            )}
          </div>
        </div>

        {/* TONYX */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "rgba(0,100,200,0.13)",
          border: "1px solid rgba(0,162,255,0.28)",
          borderRadius: 18, padding: "12px 16px",
          boxShadow: "0 0 18px rgba(0,162,255,0.08)",
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            border: "2px solid rgba(0,162,255,0.5)",
            overflow: "hidden", flexShrink: 0, position: "relative",
          }}>
            <img src="/tonyx-logo.jpg" alt="TONYX" style={{
              width: "140%", height: "140%", objectFit: "cover",
              position: "absolute", top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
            }} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: "rgba(0,162,255,0.7)", letterSpacing: "0.15em", fontWeight: 700, textTransform: "uppercase" }}>TONYX</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
              <CountUp value={userTonyx} />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Action buttons ─── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <ActionButton icon="💸" label={tp.withdraw} active={section === "withdraw"} accent="#16a34a"
          onClick={() => { haptic("light"); setSection(section === "withdraw" ? "main" : "withdraw"); }} />
        <ActionButton icon="👥" label={tp.invite} active={section === "invite"} accent="#a855f7"
          onClick={() => { haptic("light"); setSection(section === "invite" ? "main" : "invite"); }} />
        <ActionButton icon="💎" label={tp.topup} active={section === "topup"} accent="#0891b2"
          onClick={() => { haptic("light"); setSection(section === "topup" ? "main" : "topup"); }} />
      </div>

      {/* ─── Withdraw section ─── */}
      {section === "withdraw" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: "rgba(17,24,39,0.9)", border: "1px solid rgba(22,163,74,0.3)", borderRadius: 16, padding: 16, marginBottom: 14 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>💸 Вывод TON</div>
              <div style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>
                Баланс: <span style={{ color: "#4ade80" }}>{userTon.toFixed(4)} TON</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
              Минимум: 0.1 TON · Обработка до 24 часов
            </div>

            {/* TON amount */}
            <input
              value={tonWithdrawAmount}
              onChange={(e) => setTonWithdrawAmount(e.target.value)}
              type="number" step="0.01" min="0.1"
              placeholder="Сумма в TON (мин. 0.1)"
              style={{
                width: "100%", background: "rgba(30,45,69,0.6)",
                border: `1px solid ${parseFloat(tonWithdrawAmount) > userTon ? "rgba(220,38,38,0.6)" : "rgba(30,58,143,0.4)"}`,
                borderRadius: 10, padding: "12px 14px", color: "#f1f5f9",
                fontFamily: "inherit", fontSize: 14, outline: "none",
                boxSizing: "border-box", marginBottom: 10,
              }}
            />

            {/* TON address */}
            <input
              value={withdrawAddress}
              onChange={(e) => setWithdrawAddress(e.target.value)}
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

            {/* Validation hint */}
            {tonWithdrawAmount && parseFloat(tonWithdrawAmount) > userTon && (
              <div style={{ background: "rgba(220,38,38,0.12)", borderRadius: 10, padding: "9px 14px", fontSize: 12, color: "#f87171", marginBottom: 10, fontWeight: 600 }}>
                ⚠️ Недостаточно TON. Ваш баланс: {userTon.toFixed(4)} TON
              </div>
            )}

            <button
              onClick={submitWithdraw}
              disabled={
                withdrawPending ||
                !tonWithdrawAmount ||
                !withdrawAddress ||
                parseFloat(tonWithdrawAmount) < 0.1 ||
                parseFloat(tonWithdrawAmount) > userTon
              }
              style={{
                width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                background: "linear-gradient(135deg, #15803d, #22c55e)",
                color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "inherit",
                cursor: "pointer",
                opacity: (withdrawPending || parseFloat(tonWithdrawAmount || "0") > userTon) ? 0.5 : 1,
              }}
            >
              {withdrawPending ? "⏳ Отправляем…" : "Запросить вывод"}
            </button>
          </div>

          {/* Withdrawal history */}
          {withdrawHistory.length > 0 && (
            <div style={{ background: "rgba(17,24,39,0.9)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10, letterSpacing: "0.12em", fontWeight: 600 }}>ИСТОРИЯ ВЫВОДОВ</div>
              {withdrawHistory.slice().reverse().map(w => (
                <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(30,58,143,0.15)" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>
                      {w.tonAmount != null ? `${Number(w.tonAmount).toFixed(4)} TON` : `${w.amount} pts`}
                    </div>
                    <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>
                      {w.address.slice(0, 12)}…{w.address.slice(-6)}
                    </div>
                    <div style={{ fontSize: 10, color: "#334155" }}>{new Date(w.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <StatusBadge status={w.status} />
                    {w.txHash && (
                      <div style={{ fontSize: 9, color: "#4ade80", fontFamily: "monospace", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {w.txHash}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Load history button */}
          {withdrawHistory.length === 0 && (
            <button
              onClick={loadWithdrawHistory}
              style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: "1px solid rgba(30,58,143,0.25)", background: "transparent", color: "#475569", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}
            >
              📜 Показать историю выводов
            </button>
          )}
        </div>
      )}

      {/* ─── Invite section ─── */}
      {section === "invite" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: "rgba(17,24,39,0.9)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 16, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Пригласить друзей</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 14, lineHeight: 1.5 }}>
              Получай <b style={{ color: "#c084fc" }}>10%</b> от TON-наград каждого приглашённого друга навсегда.
            </div>
            <div style={{
              background: "rgba(30,45,69,0.6)", borderRadius: 10, padding: "12px 14px",
              fontSize: 12, color: "#c084fc", wordBreak: "break-all", fontFamily: "monospace",
              border: "1px solid rgba(168,85,247,0.25)", marginBottom: 10,
            }}>
              {inviteLink}
            </div>
            <button
              onClick={copyLink}
              style={{
                width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "inherit",
                cursor: "pointer", transition: "all 0.2s",
                boxShadow: "0 4px 18px rgba(168,85,247,0.35)",
              }}
            >
              {copied ? "✓ Скопировано!" : "📋 Скопировать ссылку"}
            </button>
            <div style={{ marginTop: 12, fontSize: 13, color: "#4ade80", fontWeight: 600, textAlign: "center" }}>
              {referrals?.referrals?.length ?? 0} рефералов
            </div>
          </div>

          {referrals && referrals.referrals && referrals.referrals.length > 0 && (
            <div style={{ background: "rgba(17,24,39,0.9)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10, letterSpacing: "0.12em", fontWeight: 600 }}>ВАШИ РЕФЕРАЛЫ</div>
              {referrals.referrals.slice(0, 10).map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(30,58,143,0.1)" }}>
                  <div style={{ fontSize: 13, color: "#cbd5e1" }}>{r.username ? `@${r.username}` : r.firstName ?? "User"}</div>
                  <div style={{ fontSize: 12, color: "#60a5fa", fontWeight: 600 }}>{r.coinsEarned} pts</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Top Up section ─── */}
      {section === "topup" && (
        <div style={{ marginBottom: 16 }}>
          <style>{`
            @keyframes tcPulse { 0%,100%{box-shadow:0 0 16px rgba(34,211,238,0.3)} 50%{box-shadow:0 0 28px rgba(34,211,238,0.6)} }
          `}</style>

          {/* TON Connect block */}
          <div style={{ background: "rgba(8,145,178,0.08)", border: "1px solid rgba(8,145,178,0.35)", borderRadius: 16, padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <svg width="22" height="22" viewBox="0 0 56 56" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="28" cy="28" r="28" fill="#0098EA"/>
                <path d="M36.8 15H19.2c-3.3 0-5.3 3.7-3.4 6.4l10 14.8c1.4 2 4.2 2 5.6 0l10-14.8c1.9-2.7-.1-6.4-3.6-6.4z" fill="white"/>
              </svg>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#22d3ee" }}>TON Connect 2.0</div>
              <div style={{ marginLeft: "auto", fontSize: 10, background: "rgba(34,197,94,0.2)", color: "#4ade80", padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>АКТИВЕН</div>
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 14, lineHeight: 1.6 }}>
              {lang === "ru" ? "Подключите TON-кошелёк и оплатите в один клик внутри приложения." : "Connect your TON wallet and pay with one click inside the app."}
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

            {/* Connect / Pay button */}
            {!wallet ? (
              <button onClick={() => tonConnectUI.openModal()} style={{
                width: "100%", padding: "14px 0", borderRadius: 12, border: "none", fontFamily: "inherit",
                background: "linear-gradient(135deg,#0369a1,#0891b2,#22d3ee)",
                color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer",
                boxShadow: "0 0 22px rgba(34,211,238,0.35)", animation: "tcPulse 2.5s ease infinite",
              }}>
                🔗 {lang === "ru" ? "Подключить кошелёк" : "Connect Wallet"}
              </button>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10, padding: "8px 12px" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
                  <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 600 }}>
                    {lang === "ru" ? "Кошелёк подключён" : "Wallet connected"}
                  </span>
                  <button onClick={() => tonConnectUI.disconnect()} style={{ marginLeft: "auto", background: "none", border: "none", color: "#475569", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                    {lang === "ru" ? "Отключить" : "Disconnect"}
                  </button>
                </div>
                <button onClick={sendTonPayment} disabled={topupPending} style={{
                  width: "100%", padding: "14px 0", borderRadius: 12, border: "none", fontFamily: "inherit",
                  background: topupPending ? "rgba(30,45,69,0.6)" : "linear-gradient(135deg,#0369a1,#0891b2,#22d3ee)",
                  color: "#fff", fontSize: 15, fontWeight: 800, cursor: topupPending ? "not-allowed" : "pointer",
                  boxShadow: topupPending ? "none" : "0 0 22px rgba(34,211,238,0.35)",
                }}>
                  {topupPending ? "⏳..." : `💳 ${lang === "ru" ? `Оплатить ${topupAmount} TON` : `Pay ${topupAmount} TON`}`}
                </button>
              </div>
            )}
          </div>

          {/* Manual transfer block */}
          <div style={{ background: "rgba(14,116,144,0.08)", border: "1px solid rgba(14,116,144,0.3)", borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#67e8f9", marginBottom: 4 }}>
              📨 {lang === "ru" ? "Ручной перевод" : "Manual Transfer"}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 12, lineHeight: 1.6 }}>
              {lang === "ru"
                ? "Отправьте TON на адрес ниже с обязательным комментарием (Memo)."
                : "Send TON to the address below with the required comment (Memo)."}
            </div>

            {/* Wallet address */}
            <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>
              {lang === "ru" ? "АДРЕС КОШЕЛЬКА" : "WALLET ADDRESS"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{
                flex: 1, background: "rgba(15,23,42,0.8)", borderRadius: 8, padding: "10px 12px",
                fontFamily: "monospace", fontSize: 11, color: "#67e8f9",
                wordBreak: "break-all", border: "1px solid rgba(14,116,144,0.3)",
              }}>
                {TOPUP_WALLET}
              </div>
              <button onClick={copyAddr} style={{
                flexShrink: 0, padding: "10px 12px", borderRadius: 8, border: "none",
                background: addrCopied ? "rgba(34,197,94,0.2)" : "rgba(14,116,144,0.2)",
                color: addrCopied ? "#4ade80" : "#67e8f9", fontFamily: "inherit",
                fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
              }}>
                {addrCopied ? "✓" : "📋"}
              </button>
            </div>

            {/* Memo */}
            <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>
              MEMO / {lang === "ru" ? "КОММЕНТАРИЙ" : "COMMENT"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                flex: 1, background: "rgba(15,23,42,0.6)", borderRadius: 8, padding: "10px 12px",
                fontSize: 13, color: "#93c5fd", fontWeight: 700, fontFamily: "monospace",
                border: "1px solid rgba(30,58,143,0.4)",
              }}>
                {memo}
              </div>
              <button onClick={copyMemo} style={{
                flexShrink: 0, padding: "10px 12px", borderRadius: 8, border: "none",
                background: memoCopied ? "rgba(34,197,94,0.2)" : "rgba(30,58,143,0.2)",
                color: memoCopied ? "#4ade80" : "#93c5fd", fontFamily: "inherit",
                fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}>
                {memoCopied ? "✓" : "📋"}
              </button>
            </div>
            <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 600, marginTop: 8 }}>
              ⚠️ {lang === "ru" ? "Без комментария зачисление невозможно!" : "Without the comment, your deposit cannot be identified!"}
            </div>
          </div>
        </div>
      )}

      {/* ─── Recent Activity (main) ─── */}
      {section === "main" && (
        <div style={{ background: "rgba(17,24,39,0.9)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12, letterSpacing: "0.12em", fontWeight: 600 }}>📜 ПОСЛЕДНЯЯ АКТИВНОСТЬ</div>
          {!history || !history.items || history.items.length === 0 ? (
            <div style={{ textAlign: "center", color: "#475569", padding: "20px 0", fontSize: 13 }}>
              Активности нет — смотри рекламу, играй, выводи TON
            </div>
          ) : (
            (history.items as Array<{ kind: string; id: number | string; title: string; amount: number; positive: boolean; timestamp: string }>).map((it) => (
              <div key={`${it.kind}-${it.id}`} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 0", borderBottom: "1px solid rgba(30,58,143,0.12)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div style={{
                    fontSize: 18, width: 32, height: 32, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: it.kind === "ad" ? "rgba(37,99,235,0.15)"
                      : it.kind === "withdraw" ? "rgba(22,163,74,0.15)"
                        : "rgba(168,85,247,0.15)",
                  }}>
                    {it.kind === "ad" ? "📺" : it.kind === "withdraw" ? "💸" : "🎮"}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title}</div>
                    <div style={{ fontSize: 10, color: "#475569" }}>{new Date(it.timestamp).toLocaleString()}</div>
                  </div>
                </div>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: it.positive ? "#4ade80" : "#f87171",
                  fontVariantNumeric: "tabular-nums", flexShrink: 0, marginLeft: 8,
                }}>
                  {it.positive ? "+" : ""}{it.amount.toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
