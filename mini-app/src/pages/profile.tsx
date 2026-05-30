import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetUserProfile,
  getGetUserProfileQueryKey,
  useGetReferrals,
  useExchangeMiniCoins,
  useRequestMiniWithdraw,
  useGetMiniWithdrawals,
  getGetMiniWithdrawalsQueryKey,
  useGetMiniHistory,
} from "@workspace/api-client-react";
import { useTelegram, haptic, hapticNotify } from "@/lib/telegram";
import { CountUp } from "@/components/count-up";

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

type Section = "main" | "exchange" | "withdraw" | "invite" | "topup";

interface ActionButtonProps {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
  accent: string;
}

function ActionButton({ icon, label, active, onClick, accent }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className="tile-bounce"
      style={{
        flex: 1, padding: "14px 8px", borderRadius: 14,
        background: active ? `linear-gradient(135deg, ${accent}aa, ${accent}55)` : "rgba(17,24,39,0.85)",
        border: `1px solid ${active ? accent : "rgba(30,58,143,0.3)"}`,
        color: active ? "#fff" : "#cbd5e1",
        fontSize: 12, fontWeight: 700, fontFamily: "inherit",
        cursor: "pointer", transition: "all 0.2s",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        boxShadow: active ? `0 0 20px ${accent}55` : "none",
      }}
    >
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ letterSpacing: "0.04em" }}>{label}</div>
    </button>
  );
}

function LoadingScreen() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 32 }}>⏳</div>
      <div style={{ fontSize: 13, color: "#475569" }}>Загрузка профиля…</div>
    </div>
  );
}

export default function ProfilePage() {
  const { telegramId, username, firstName, photoUrl } = useTelegram();
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>("main");
  const [exchangeCoins, setExchangeCoins] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: profile } = useGetUserProfile(telegramId ?? "", { query: { enabled: !!telegramId, refetchInterval: 15000 } });
  const { data: referrals } = useGetReferrals(telegramId ?? "", { query: { enabled: !!telegramId } });
  const { data: withdrawals } = useGetMiniWithdrawals(telegramId ?? "", { query: { enabled: !!telegramId && section === "withdraw" } });
  const { data: history } = useGetMiniHistory(telegramId ?? "", { query: { enabled: !!telegramId && section === "main", refetchInterval: 20000 } });

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const exchange = useExchangeMiniCoins({
    mutation: {
      onSuccess: (data) => {
        hapticNotify("success");
        showToast(`Exchanged ${data.coins} pts → ${data.ton} TON`, "success");
        setExchangeCoins("");
        qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId ?? "") });
      },
      onError: (e: unknown) => showToast((e as { data?: { error?: string } })?.data?.error ?? "Failed", "error"),
    },
  });

  const withdraw = useRequestMiniWithdraw({
    mutation: {
      onSuccess: (data) => {
        hapticNotify("success");
        showToast(data.message, "success");
        setWithdrawAmount(""); setWithdrawAddress("");
        qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId ?? "") });
        qc.invalidateQueries({ queryKey: getGetMiniWithdrawalsQueryKey(telegramId ?? "") });
      },
      onError: (e: unknown) => showToast((e as { data?: { error?: string } })?.data?.error ?? "Failed", "error"),
    },
  });

  // Guard: Telegram context not yet available — don't try to render user data
  if (!telegramId) return <LoadingScreen />;

  const coins = profile?.coins ?? 0;
  const minWithdraw = withdrawals?.minimumAmount ?? 1000;
  const tonFromExchange = exchangeCoins ? Math.floor(parseInt(exchangeCoins) / 1000) : 0;
  const tonFromWithdraw = withdrawAmount ? parseInt(withdrawAmount) / 1000 : 0;
  const inviteLink = `https://t.me/TONYX_game_bot?start=${telegramId ?? ""}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      haptic("light");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast("Copy failed", "error");
    }
  };

  return (
    <div style={{ padding: "16px 16px 28px" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Header */}
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
      </div>

      {/* Balance card */}
      <div style={{
        background: "linear-gradient(135deg, rgba(30,58,143,0.4), rgba(37,99,235,0.15))",
        border: "1px solid rgba(96,165,250,0.3)",
        borderRadius: 18, padding: "16px 18px", marginBottom: 16,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        boxShadow: "0 0 28px rgba(37,99,235,0.18)",
      }}>
        <div>
          <div style={{ fontSize: 10, color: "#93c5fd", letterSpacing: "0.2em", fontWeight: 600 }}>BALANCE</div>
          <div style={{
            fontSize: 28, fontWeight: 800, color: "#fff", marginTop: 2,
            textShadow: "0 0 16px rgba(96,165,250,0.45)", fontVariantNumeric: "tabular-nums",
          }}>
            <CountUp value={coins} /> <span style={{ fontSize: 14, color: "#93c5fd", fontWeight: 600 }}>pts</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#93c5fd", letterSpacing: "0.2em", fontWeight: 600 }}>≈ TON</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#60a5fa", marginTop: 2 }}>
            {(coins / 1000).toFixed(3)}
          </div>
        </div>
      </div>

      {/* 4 action buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <ActionButton icon="🔄" label="EXCHANGE" active={section === "exchange"} accent="#2563eb"
          onClick={() => { haptic("light"); setSection(section === "exchange" ? "main" : "exchange"); }} />
        <ActionButton icon="💸" label="WITHDRAW" active={section === "withdraw"} accent="#16a34a"
          onClick={() => { haptic("light"); setSection(section === "withdraw" ? "main" : "withdraw"); }} />
        <ActionButton icon="👥" label="INVITE" active={section === "invite"} accent="#a855f7"
          onClick={() => { haptic("light"); setSection(section === "invite" ? "main" : "invite"); }} />
        <ActionButton icon="💎" label="TOP UP" active={section === "topup"} accent="#0891b2"
          onClick={() => { haptic("light"); setSection(section === "topup" ? "main" : "topup"); }} />
      </div>

      {section === "exchange" && (
        <div style={{ background: "rgba(17,24,39,0.9)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Exchange points to TON</div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>Rate: 1000 pts = 1 TON</div>
          <input
            value={exchangeCoins} onChange={(e) => setExchangeCoins(e.target.value)}
            type="number" step="1000" placeholder="Enter pts (multiple of 1000)"
            style={{ width: "100%", background: "rgba(30,45,69,0.6)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 10, padding: "12px 14px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 10 }}
          />
          {tonFromExchange > 0 && (
            <div style={{ background: "rgba(37,99,235,0.12)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#93c5fd", marginBottom: 12, fontWeight: 600 }}>
              You will get: {tonFromExchange} TON
            </div>
          )}
          <button
            onClick={() => { haptic("medium"); exchange.mutate({ data: { telegramId: telegramId!, coins: parseInt(exchangeCoins) } }); }}
            disabled={!exchangeCoins || exchange.isPending || parseInt(exchangeCoins) < 1000}
            style={{
              width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
              background: "linear-gradient(135deg, #1e3a8a, #2563eb)",
              color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "inherit",
              cursor: "pointer", opacity: exchange.isPending ? 0.6 : 1,
            }}
          >
            {exchange.isPending ? "Exchanging…" : "Exchange"}
          </button>
        </div>
      )}

      {section === "withdraw" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: "rgba(17,24,39,0.9)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 16, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Withdraw TON</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>Min: {minWithdraw} pts = {minWithdraw / 1000} TON</div>
            <input
              value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)}
              type="number" step="1000" placeholder={`Min ${minWithdraw} pts`}
              style={{ width: "100%", background: "rgba(30,45,69,0.6)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 10, padding: "12px 14px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 10 }}
            />
            <input
              value={withdrawAddress} onChange={(e) => setWithdrawAddress(e.target.value)}
              type="text" placeholder="TON wallet address (UQ…)"
              style={{ width: "100%", background: "rgba(30,45,69,0.6)", border: "1px solid rgba(30,58,143,0.4)", borderRadius: 10, padding: "12px 14px", color: "#f1f5f9", fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 10 }}
            />
            {tonFromWithdraw > 0 && (
              <div style={{ background: "rgba(22,163,74,0.12)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#4ade80", marginBottom: 12, fontWeight: 600 }}>
                You will receive: {tonFromWithdraw.toFixed(4)} TON
              </div>
            )}
            <button
              onClick={() => { haptic("heavy"); withdraw.mutate({ data: { telegramId: telegramId!, amount: parseInt(withdrawAmount), address: withdrawAddress } }); }}
              disabled={!withdrawAmount || !withdrawAddress || withdraw.isPending || parseInt(withdrawAmount) < minWithdraw}
              style={{
                width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                background: "linear-gradient(135deg, #15803d, #22c55e)",
                color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "inherit",
                cursor: "pointer", opacity: withdraw.isPending ? 0.6 : 1,
              }}
            >
              {withdraw.isPending ? "Submitting…" : "Request withdrawal"}
            </button>
          </div>

          {withdrawals && withdrawals.withdrawals.length > 0 && (
            <div style={{ background: "rgba(17,24,39,0.9)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10, letterSpacing: "0.12em", fontWeight: 600 }}>WITHDRAWAL HISTORY</div>
              {withdrawals.withdrawals.slice().reverse().map(w => (
                <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(30,58,143,0.15)" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{w.amount} pts → {w.tonAmount?.toFixed(4) ?? "?"} TON</div>
                    <div style={{ fontSize: 11, color: "#475569" }}>{new Date(w.createdAt).toLocaleDateString()}</div>
                  </div>
                  <StatusBadge status={w.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {section === "invite" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: "rgba(17,24,39,0.9)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 16, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Invite friends</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 14, lineHeight: 1.5 }}>
              Earn <b style={{ color: "#c084fc" }}>10%</b> of ad rewards from every friend you invite, forever.
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
              {copied ? "✓ Copied!" : "📋 Copy invite link"}
            </button>
            <div style={{ marginTop: 12, fontSize: 13, color: "#4ade80", fontWeight: 600, textAlign: "center" }}>
              {referrals?.referrals?.length ?? 0} referrals · {referrals?.referralEarnings ?? 0} pts earned
            </div>
          </div>

          {referrals && referrals.referrals && referrals.referrals.length > 0 && (
            <div style={{ background: "rgba(17,24,39,0.9)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10, letterSpacing: "0.12em", fontWeight: 600 }}>YOUR REFERRALS</div>
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

      {section === "topup" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: "rgba(17,24,39,0.9)", border: "1px solid rgba(8,145,178,0.35)", borderRadius: 16, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>💎 Top Up Balance</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16, lineHeight: 1.5 }}>
              Send TON to your account and receive pts automatically.<br />
              Rate: <b style={{ color: "#22d3ee" }}>1 TON = 100 pts</b>
            </div>

            {/* Option 1: TON Connect */}
            <div style={{ background: "rgba(8,145,178,0.1)", border: "1px solid rgba(8,145,178,0.3)", borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#22d3ee" }}>TON Connect</div>
                <div style={{ fontSize: 10, background: "rgba(251,191,36,0.2)", color: "#fbbf24", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>COMING SOON</div>
              </div>
              <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>
                Connect your TON wallet directly and send funds with one tap. No address copy needed.
              </div>
            </div>

            {/* Option 2: Manual send */}
            <div style={{ background: "rgba(14,116,144,0.1)", border: "1px solid rgba(14,116,144,0.3)", borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#67e8f9", marginBottom: 8 }}>Manual Transfer</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10, lineHeight: 1.5 }}>
                Send TON to the address below. Include your Telegram ID in the comment so we can credit your account.
              </div>
              <div style={{
                background: "rgba(15,23,42,0.8)", borderRadius: 8, padding: "10px 12px",
                fontFamily: "monospace", fontSize: 12, color: "#67e8f9",
                wordBreak: "break-all", border: "1px solid rgba(14,116,144,0.3)",
                marginBottom: 8,
              }}>
                UQXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
              </div>
              <div style={{ background: "rgba(15,23,42,0.6)", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#64748b" }}>
                Comment: <span style={{ color: "#93c5fd", fontWeight: 600 }}>TOPUP_{telegramId}</span>
              </div>
            </div>

            {/* Option 3: Crypto Pay */}
            <div style={{ background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.25)", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#93c5fd" }}>Crypto Pay (CryptoPay API)</div>
                <div style={{ fontSize: 10, background: "rgba(251,191,36,0.2)", color: "#fbbf24", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>COMING SOON</div>
              </div>
              <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>
                Pay via @CryptoBot directly inside Telegram. Supports TON, USDT, BTC and more.
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: "#475569", textAlign: "center", lineHeight: 1.6 }}>
            After sending, allow up to 5 minutes for the balance to update.<br />
            Contact support if funds don't arrive within 24 hours.
          </div>
        </div>
      )}

      {/* History always shown on main */}
      {section === "main" && (
        <div style={{ background: "rgba(17,24,39,0.9)", border: "1px solid rgba(30,58,143,0.3)", borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12, letterSpacing: "0.12em", fontWeight: 600 }}>📜 RECENT ACTIVITY</div>
          {!history || !history.items || history.items.length === 0 ? (
            <div style={{ textAlign: "center", color: "#475569", padding: "20px 0", fontSize: 13 }}>
              No activity yet — watch ads, play games, withdraw to see history here.
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

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    pending: { bg: "rgba(217,119,6,0.2)", color: "#fbbf24" },
    completed: { bg: "rgba(22,163,74,0.2)", color: "#4ade80" },
    rejected: { bg: "rgba(220,38,38,0.2)", color: "#f87171" },
  };
  const c = cfg[status] ?? cfg.pending;
  return (
    <span style={{ background: c.bg, color: c.color, padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700 }}>
      {status}
    </span>
  );
}
