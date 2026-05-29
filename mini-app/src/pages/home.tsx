import { useState, useCallback, useRef } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAdsgram } from "@adsgram/react";
import {
  useGetMiniEarnStatus,
  getGetMiniEarnStatusQueryKey,
  useRecordMiniAdWatch,
  useGetUserProfile,
  getGetUserProfileQueryKey,
} from "@workspace/api-client-react";
import { useTelegram, haptic, hapticNotify } from "@/lib/telegram";
import { CountUp } from "@/components/count-up";

const BLOCK_ID = import.meta.env.VITE_ADSGRAM_BLOCK_ID ?? "int-32141";

function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  const bg = type === "success" ? "rgba(22,163,74,0.95)" : "rgba(220,38,38,0.95)";
  return (
    <div style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
      background: bg, color: "#fff", padding: "12px 20px", borderRadius: 12,
      fontSize: 14, fontWeight: 600, zIndex: 9999, maxWidth: "calc(100% - 32px)",
      animation: "bounceIn 0.3s ease-out",
      boxShadow: "0 8px 28px rgba(0,0,0,0.4)",
    }}>{msg}</div>
  );
}

/** Remove any DOM overlay that AdsGram injected into <body> after the snapshot set. */
function removeAdsgramOverlays(snapshotBefore: Set<Element>) {
  try {
    // 1. Remove new direct body children added by the SDK (the overlay container)
    Array.from(document.body.children).forEach((el) => {
      if (!snapshotBefore.has(el)) el.remove();
    });
    // 2. Fallback: target known AdsGram selectors regardless of snapshot
    document
      .querySelectorAll(
        '[id*="adsgram"], [class*="adsgram"], [data-adsgram], ' +
        'iframe[src*="adsgram"], iframe[src*="sad.adsgram"]',
      )
      .forEach((el) => {
        // Walk up to the outermost overlay wrapper and remove it
        let target: Element | null = el;
        while (target?.parentElement && target.parentElement !== document.body) {
          target = target.parentElement;
        }
        target?.remove();
      });
  } catch (err) {
    console.warn("[AdsGram] overlay cleanup error", err);
  }
}

export default function HomePage() {
  const { telegramId, isInTelegram } = useTelegram();
  const qc = useQueryClient();
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [justEarned, setJustEarned] = useState(0);
  // Snapshot of body children taken just before each showAd() call
  const bodySnapshotRef = useRef<Set<Element>>(new Set());

  const { data: profile } = useGetUserProfile(telegramId ?? "", {
    query: { enabled: !!telegramId, refetchInterval: 8000 },
  });
  const { data: status } = useGetMiniEarnStatus(telegramId ?? "", {
    query: { enabled: !!telegramId, refetchInterval: 5000 },
  });

  const recordWatch = useRecordMiniAdWatch({
    mutation: {
      onSuccess: (data) => {
        if (data.coinsEarned > 0) {
          hapticNotify("success");
          setJustEarned(data.coinsEarned);
          setToast({ msg: `+${data.coinsEarned} pts earned!`, type: "success" });
        }
        qc.invalidateQueries({ queryKey: getGetMiniEarnStatusQueryKey(telegramId ?? "") });
        qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId ?? "") });
        setTimeout(() => { setToast(null); setJustEarned(0); }, 2500);
      },
      onError: (e: unknown) => {
        hapticNotify("error");
        const msg = (e as { data?: { error?: string } })?.data?.error ?? "Something went wrong";
        setToast({ msg, type: "error" });
        setTimeout(() => setToast(null), 2500);
      },
    },
  });

  const onReward = useCallback(() => {
    if (!telegramId) return;
    recordWatch.mutate({ data: { telegramId, blockId: BLOCK_ID } });
  }, [telegramId]);

  const showErrorToast = useCallback(() => {
    setToast({ msg: "Реклама временно загружается, попробуйте через пару минут", type: "error" });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const onError = useCallback((result?: { error: boolean; done: boolean; state: string; description: string }) => {
    console.warn("[AdsGram] error", result);
    // Remove the SDK's own error overlay from the DOM immediately
    removeAdsgramOverlays(bodySnapshotRef.current);
    showErrorToast();
  }, [showErrorToast]);

  const { show: showAd } = useAdsgram({ blockId: BLOCK_ID, onReward, onError });

  const handleWatch = useCallback(async () => {
    haptic("medium");
    if (!isInTelegram) {
      setToast({ msg: "Реклама работает только внутри Telegram", type: "error" });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (!telegramId) {
      setToast({ msg: "Профиль не загружен, попробуйте позже", type: "error" });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    // Snapshot body BEFORE the SDK adds its overlay — used for cleanup on error
    bodySnapshotRef.current = new Set(Array.from(document.body.children));
    try {
      await showAd();
    } catch (err) {
      // Promise rejected after onError fires — overlay already cleaned up,
      // but run cleanup again in case the SDK re-injected anything
      console.warn("[AdsGram] show() rejected:", err);
      removeAdsgramOverlays(bodySnapshotRef.current);
      showErrorToast();
    }
  }, [showAd, isInTelegram, telegramId, showErrorToast]);

  const coins = profile?.coins ?? 0;
  const ton = coins / 1000;
  const cool = status?.cooldownSeconds ?? 0;
  const canWatch = status?.canWatch ?? false;
  const watched = status?.adsWatchedToday ?? 0;
  const limit = status?.dailyLimit ?? 100;

  return (
    <div style={{ padding: "16px 16px 28px", minHeight: "100%" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* TONYX header */}
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div
          style={{
            fontSize: 26, fontWeight: 800, letterSpacing: "0.08em",
            background: "linear-gradient(135deg, #60a5fa 0%, #c084fc 50%, #60a5fa 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text", backgroundSize: "200% auto",
            animation: "shine 4s linear infinite",
          }}
        >
          TONYX
        </div>
      </div>

      {/* Weekly Leaderboard banner */}
      <Link
        href="/leaderboard"
        onClick={() => haptic("light")}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          background: "linear-gradient(135deg, rgba(190,18,60,0.35), rgba(244,63,94,0.18))",
          border: "1px solid rgba(244,63,94,0.45)",
          borderRadius: 16, padding: "12px 14px", marginBottom: 16,
          textDecoration: "none", color: "inherit",
          boxShadow: "0 0 22px rgba(244,63,94,0.22)",
          cursor: "pointer",
        }}
        className="tile-bounce"
      >
        <div style={{ fontSize: 28 }}>🔥</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Weekly Leaderboard</div>
          <div style={{ fontSize: 11, color: "#fda4af" }}>Top 10 players get rewards!</div>
        </div>
        <div style={{
          padding: "6px 12px", borderRadius: 10, fontSize: 11, fontWeight: 700,
          background: "rgba(244,63,94,0.25)", color: "#fff", letterSpacing: "0.05em",
        }}>
          VIEW →
        </div>
      </Link>

      {/* Balance card */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(30,58,143,0.45), rgba(37,99,235,0.18))",
          border: "1px solid rgba(96,165,250,0.3)",
          borderRadius: 20, padding: "20px 18px", marginBottom: 22,
          textAlign: "center", position: "relative", overflow: "hidden",
          boxShadow: "0 0 36px rgba(37,99,235,0.25)",
        }}
        className="balance-card"
      >
        <div style={{
          position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)",
          width: 220, height: 220, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(96,165,250,0.35) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{ fontSize: 11, color: "#93c5fd", letterSpacing: "0.22em", fontWeight: 600, position: "relative" }}>
          BALANCE
        </div>
        <div style={{
          fontSize: 40, fontWeight: 800, color: "#fff", marginTop: 4, letterSpacing: "-0.02em",
          textShadow: "0 0 24px rgba(96,165,250,0.55)", position: "relative", fontVariantNumeric: "tabular-nums",
        }}>
          <CountUp value={coins} /> <span style={{ fontSize: 17, color: "#93c5fd", fontWeight: 600 }}>pts</span>
        </div>
        <div style={{ fontSize: 13, color: "#60a5fa", marginTop: 2, fontWeight: 500, position: "relative" }}>
          ≈ {ton.toFixed(3)} TON
        </div>
      </div>

      {/* Watch Ad section */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 18 }}>
        {justEarned > 0 && (
          <div style={{
            fontSize: 36, fontWeight: 800, color: "#4ade80", marginBottom: 12,
            animation: "bounceIn 0.3s ease-out",
            textShadow: "0 0 16px rgba(74,222,128,0.6)",
          }}>+{justEarned} pts</div>
        )}

        <button
          onClick={handleWatch}
          disabled={!telegramId || recordWatch.isPending}
          className={telegramId ? "pulse-glow" : ""}
          style={{
            width: "100%", maxWidth: 320, padding: "20px 0", borderRadius: 18, border: "none",
            background: telegramId
              ? "linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #60a5fa 100%)"
              : "rgba(30,58,143,0.2)",
            color: telegramId ? "#fff" : "#475569",
            fontSize: 18, fontWeight: 800, letterSpacing: "0.14em",
            fontFamily: "inherit",
            cursor: telegramId ? "pointer" : "not-allowed",
            transition: "all 0.2s",
            boxShadow: telegramId ? "0 0 28px rgba(37,99,235,0.45)" : "none",
          }}
        >
          {recordWatch.isPending ? "⏳ ОБРАБОТКА…" : "▶ WATCH AD"}
        </button>

        <div style={{ fontSize: 12, color: "#64748b", marginTop: 10 }}>
          Earn {status?.minCoins ?? 1}–{status?.maxCoins ?? 2} pts per ad
        </div>
      </div>

      {/* Daily stats */}
      <div style={{
        background: "rgba(17,24,39,0.85)",
        border: "1px solid rgba(30,58,143,0.3)",
        borderRadius: 16, padding: "14px 16px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "#64748b", letterSpacing: "0.12em", fontWeight: 600 }}>СЕГОДНЯ</div>
          <div style={{ fontSize: 13, color: "#93c5fd", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {watched} / {limit} ads
          </div>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: "rgba(30,58,143,0.25)", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${Math.min(100, (watched / limit) * 100)}%`,
            background: "linear-gradient(90deg, #2563eb, #60a5fa)",
            borderRadius: 4, transition: "width 0.5s ease",
            boxShadow: "0 0 10px rgba(96,165,250,0.6)",
          }} />
        </div>
      </div>
    </div>
  );
}
