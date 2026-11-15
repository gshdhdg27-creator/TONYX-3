import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
const tonyxLogoSrc = "/tonyx-logo.jpg";
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
import { inventoryApi, type InventoryItem, type InventoryCollection } from "@/lib/inventoryApi";

const TOPUP_WALLET = "UQBDrAxyWlMMmtSgq5TjQyO1nKacS_nA0_7ZQ88m8eMmU1jO";

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

export default function ProfilePage() {
  const { telegramId } = useTelegram();
  const { t, lang, setLang } = useLang();
  const qc = useQueryClient();
  const [activePanel, setActivePanel] = useState<null | "topup" | "withdraw">(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawPending, setWithdrawPending] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [tonConnectUI] = useTonConnectUI();
  const connectedAddress = useTonAddress();
  const { data: profile } = useGetUserProfile(telegramId ?? "", { query: { enabled: !!telegramId, refetchInterval: 10000 } as any });

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  if (!telegramId) return <div style={{ padding: 24, color: "#fff" }}>Loading…</div>;

  const userTon = Number((profile as { ton?: string | number } | undefined)?.ton ?? 0);
  const depositCode = profile?.depositCode ?? null;
  const memo = depositCode ?? `TONYX-${telegramId}`;

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
    try {
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{
          address: TOPUP_WALLET,
          amount: String(Math.floor(amount * 1e9)),
          payload: buildCommentPayload(memo),
        }],
      });
      showToast("✅ Транзакция отправлена!", "success");
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? "";
      if (!msg.includes("User rejects")) showToast("Ошибка отправки", "error");
    }
  };

  const submitWithdraw = async () => {
    if (!telegramId) return;
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount < 0.1) { showToast("Минимум 0.1 TON", "error"); return; }
    if (amount > userTon) { showToast("Недостаточно TON", "error"); return; }
    if (!connectedAddress) { showToast("Подключите TON кошелёк", "error"); return; }
    setWithdrawPending(true);
    try {
      const r = await fetch("/api/mini/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, tonAmount: amount, address: connectedAddress }),
      });
      const d = await r.json();
      if (!r.ok) { showToast(d.error ?? "Ошибка сервера", "error"); return; }
      hapticNotify("success");
      showToast(d.message ?? "✅ Вывод успешен!", "success");
      setWithdrawAmount("");
      qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId) });
    } catch {
      showToast("Ошибка сети", "error");
    } finally {
      setWithdrawPending(false);
    }
  };

  return (
    <div style={{ padding: "72px 16px 100px", color: "#f1f5f9" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Профиль</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 6 }}>Баланс: <b style={{ color: "#4ade80" }}>{userTon.toFixed(4)} TON</b></div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <button onClick={() => setActivePanel(activePanel === "topup" ? null : "topup")} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid rgba(56,189,248,0.4)", background: activePanel === "topup" ? "rgba(14,165,233,0.25)" : "rgba(15,23,42,0.8)", color: "#38bdf8", fontWeight: 800 }}>💎 Пополнить</button>
        <button onClick={() => setActivePanel(activePanel === "withdraw" ? null : "withdraw")} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid rgba(34,197,94,0.4)", background: activePanel === "withdraw" ? "rgba(22,163,74,0.25)" : "rgba(15,23,42,0.8)", color: "#4ade80", fontWeight: 800 }}>💸 Вывести</button>
      </div>

      {activePanel === "topup" && (
        <div style={{ background: "rgba(17,24,39,0.95)", border: "1px solid rgba(56,189,248,0.3)", borderRadius: 16, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Пополнение TON</div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>Memo: <code>{memo}</code></div>
          <input value={depositAmount} onChange={e => setDepositAmount(e.target.value)} type="number" step="0.01" min="0.1" placeholder="Сумма TON" style={{ width: "100%", marginBottom: 10, padding: 12, borderRadius: 10, border: "1px solid rgba(30,58,143,0.4)", background: "rgba(30,45,69,0.6)", color: "#fff", boxSizing: "border-box" }} />
          <button onClick={connectedAddress ? sendTonDeposit : () => tonConnectUI.openModal()} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: "linear-gradient(135deg,#0369a1,#0ea5e9)", color: "#fff", fontWeight: 800 }}>
            {connectedAddress ? `💎 Оплатить ${depositAmount || ""} TON` : "🔗 Подключить кошелёк"}
          </button>
        </div>
      )}

      {activePanel === "withdraw" && (
        <div style={{ background: "rgba(17,24,39,0.95)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 16, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>Вывод TON</div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>Минимум 0.1 · Комиссия 5% · Авто на подключённый кошелёк</div>
          <input value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} type="number" step="0.01" min="0.1" placeholder="Сумма TON" style={{ width: "100%", marginBottom: 10, padding: 12, borderRadius: 10, border: "1px solid rgba(30,58,143,0.4)", background: "rgba(30,45,69,0.6)", color: "#fff", boxSizing: "border-box" }} />
          {connectedAddress ? (
            <div style={{ background: "rgba(0,152,234,0.08)", border: "1px solid rgba(0,152,234,0.35)", borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: "#38bdf8", fontWeight: 700, marginBottom: 4 }}>Подключённый кошелёк</div>
              <div style={{ fontSize: 12, color: "#e2e8f0", fontFamily: "monospace", wordBreak: "break-all" }}>{connectedAddress}</div>
            </div>
          ) : (
            <button type="button" onClick={() => tonConnectUI.openModal()} style={{ width: "100%", padding: 12, borderRadius: 10, marginBottom: 10, border: "1px solid rgba(0,152,234,0.5)", background: "rgba(0,152,234,0.12)", color: "#38bdf8", fontWeight: 800 }}>
              🔗 Подключить кошелёк для вывода
            </button>
          )}
          <button onClick={submitWithdraw} disabled={withdrawPending || !connectedAddress || !withdrawAmount} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: !connectedAddress || withdrawPending ? "rgba(30,45,80,0.4)" : "linear-gradient(135deg,#15803d,#22c55e)", color: "#fff", fontWeight: 800 }}>
            {withdrawPending ? "⏳ Отправляем…" : "💸 Вывести на подключённый кошелёк"}
          </button>
        </div>
      )}
    </div>
  );
}
