import { useState, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMiniTasks,
  getGetMiniTasksQueryKey,
  useCompleteMiniTask,
  useGetUserProfile,
  getGetUserProfileQueryKey,
  useGetMiniEarnStatus,
  getGetMiniEarnStatusQueryKey,
  useRecordMiniAdWatch,
} from "@workspace/api-client-react";
import { showRewardedAd, ADSGRAM_BLOCK_ID, type AdError } from "@/lib/adsgram";
import { useTelegram, haptic, hapticNotify } from "@/lib/telegram";
import { useLang } from "@/lib/LanguageContext";

const BLOCK_ID = ADSGRAM_BLOCK_ID;
const TON_PER_AD = 0.0001;

function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
      background: type === "success" ? "rgba(22,163,74,0.9)" : "rgba(220,38,38,0.9)",
      color: "#fff", padding: "12px 20px", borderRadius: 12,
      fontSize: 14, fontWeight: 600, zIndex: 9999, maxWidth: "calc(100% - 32px)",
      textAlign: "center",
    }}>{msg}</div>
  );
}

function removeAdsgramOverlays(snapshot: Set<Element>) {
  try {
    Array.from(document.body.children).forEach(el => { if (!snapshot.has(el)) el.remove(); });
    document.querySelectorAll('[id*="adsgram"],[class*="adsgram"],[data-adsgram],iframe[src*="adsgram"]')
      .forEach(el => {
        let t: Element | null = el;
        while (t?.parentElement && t.parentElement !== document.body) t = t.parentElement;
        t?.remove();
      });
  } catch {}
}

const TYPE_ICONS: Record<string, string> = {
  subscribe: "📢", follow: "👤", visit: "🔗", social: "📱", custom: "⚡",
};

export default function TasksPage() {
  const { telegramId, isInTelegram } = useTelegram();
  const { t } = useLang();
  const qc = useQueryClient();
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [justEarned, setJustEarned] = useState(0);
  // Local 1-second countdown — smooth timer independent of network refetch
  const [countdown, setCountdown] = useState(0);
  const bodySnapshotRef = useRef<Set<Element>>(new Set());

  const showToast = useCallback((msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const { data: tasksData, isLoading } = useGetMiniTasks(telegramId ?? "", {
    query: { enabled: !!telegramId, refetchInterval: 15000 } as any,
  });
  const { data: profile } = useGetUserProfile(telegramId ?? "", {
    query: { enabled: !!telegramId, refetchInterval: 10000 } as any,
  });
  const { data: earnStatus } = useGetMiniEarnStatus(telegramId ?? "", {
    query: { enabled: !!telegramId, refetchInterval: 10000 } as any,
  });

  // Sync server cooldown → local countdown whenever earnStatus updates
  useEffect(() => {
    const serverCooldown = earnStatus?.cooldownSeconds ?? 0;
    if (serverCooldown > 0) setCountdown(serverCooldown);
  }, [earnStatus?.cooldownSeconds]);

  // Tick countdown down by 1 every second; refetch status when it reaches 0
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          qc.invalidateQueries({ queryKey: getGetMiniEarnStatusQueryKey(telegramId ?? "") });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown > 0]); // re-run only when countdown transitions from 0→positive


  /* ── Ad watch ── */
  const recordWatch = useRecordMiniAdWatch({
    mutation: {
      onSuccess: (data) => {
        const tonEarned = (data as unknown as { tonEarned?: number }).tonEarned ?? 0;
        hapticNotify("success");
        setJustEarned(tonEarned || data.coinsEarned);
        showToast(tonEarned > 0 ? t.tasks.toastEarnedTon(tonEarned) : t.tasks.toastEarnedPts(data.coinsEarned), "success");
        qc.invalidateQueries({ queryKey: getGetMiniEarnStatusQueryKey(telegramId ?? "") });
        qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId ?? "") });
        setTimeout(() => setJustEarned(0), 2500);
      },
      onError: (e: unknown) => {
        hapticNotify("error");
        showToast((e as { data?: { error?: string } })?.data?.error ?? "Ошибка сервера", "error");
      },
    },
  });

  const handleWatch = useCallback(async () => {
    haptic("medium");
    if (!isInTelegram) { showToast(t.tasks.errTelegram, "error"); return; }
    if (!telegramId) { showToast(t.tasks.errProfile, "error"); return; }

    bodySnapshotRef.current = new Set(Array.from(document.body.children));

    await showRewardedAd({
      blockId: BLOCK_ID,
      onReward: () => {
        recordWatch.mutate({ data: { telegramId, blockId: BLOCK_ID } });
      },
      onSkip: () => {
        removeAdsgramOverlays(bodySnapshotRef.current);
        showToast(t.tasks.errSkip, "error");
      },
      onError: (err: AdError) => {
        removeAdsgramOverlays(bodySnapshotRef.current);
        console.error("[AdsGram] error:", err.reason, err.description);
        if (err.reason === "no_ads") showToast(t.tasks.errNoAds, "error");
        else if (err.reason === "not_loaded") showToast(t.tasks.errNotLoaded, "error");
        else if (err.reason === "network") showToast(t.tasks.errNetwork, "error");
        else showToast(t.tasks.errGeneric, "error");
      },
    });
  }, [isInTelegram, telegramId, showToast, recordWatch, t]);

  /* ── Task complete ── */
  const completeTask = useCompleteMiniTask({
    mutation: {
      onSuccess: (data) => {
        hapticNotify("success");
        const tonEarned = (data as unknown as { tonEarned?: number }).tonEarned ?? 0;
        const msg = tonEarned > 0
          ? `${data.taskTitle} +${data.coinsEarned} pts +${tonEarned} TON ✅`
          : `${data.taskTitle} +${data.coinsEarned} pts ✅`;
        showToast(msg, "success");
        qc.invalidateQueries({ queryKey: getGetMiniTasksQueryKey(telegramId ?? "") });
        qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId ?? "") });
      },
      onError: (e: unknown) => {
        hapticNotify("error");
        showToast((e as { data?: { error?: string } })?.data?.error ?? "Ошибка", "error");
      },
    },
  });

  const tasks = tasksData?.tasks ?? [];
  const pending = tasks.filter(t => !t.completed);
  const done = tasks.filter(t => t.completed);

  const handleComplete = (id: number, link?: string | null) => {
    if (!telegramId) return;
    haptic("medium");
    if (link) {
      window.open(link, "_blank");
      setTimeout(() => completeTask.mutate({ id, data: { telegramId } }), 1500);
    } else {
      completeTask.mutate({ id, data: { telegramId } });
    }
  };

  const canWatch = earnStatus?.canWatch ?? false;
  const watched = earnStatus?.adsWatchedToday ?? 0;
  const limit = earnStatus?.dailyLimit ?? 100;

  const btnLabel = recordWatch.isPending
    ? t.tasks.processing
    : countdown > 0
      ? t.tasks.cooldown(countdown)
      : watched >= limit
        ? t.tasks.limitDone
        : t.tasks.watchBtn;

  const btnActive = canWatch && !!telegramId && !recordWatch.isPending;

  return (
    <div style={{ padding: 16 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Page header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{t.tasks.title}</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>{t.tasks.subtitle}</div>
      </div>

      {/* ── WATCH AD SECTION ── */}
      <div data-tour="tasks-watchad" style={{
        background: "linear-gradient(135deg, rgba(30,58,143,0.35), rgba(37,99,235,0.15))",
        border: "1px solid rgba(96,165,250,0.3)",
        borderRadius: 18, padding: "16px 16px", marginBottom: 20,
        boxShadow: "0 0 24px rgba(37,99,235,0.15)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 24 }}>📺</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#f1f5f9" }}>{t.tasks.watchAd}</div>
            <div style={{ fontSize: 11, color: "#93c5fd" }}>{t.tasks.perView}</div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa", fontVariantNumeric: "tabular-nums" }}>
              {watched}/{limit}
            </div>
            <div style={{ fontSize: 10, color: "#475569" }}>{t.tasks.today}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 6, borderRadius: 3, background: "rgba(30,58,143,0.3)", overflow: "hidden", marginBottom: 12 }}>
          <div style={{
            height: "100%", width: `${Math.min(100, (watched / limit) * 100)}%`,
            background: "linear-gradient(90deg, #2563eb, #60a5fa)",
            borderRadius: 3, transition: "width 0.5s",
          }} />
        </div>

        {justEarned > 0 && (
          <div style={{
            fontSize: 28, fontWeight: 900, color: "#4ade80", textAlign: "center",
            marginBottom: 10, animation: "bounceIn 0.3s ease-out",
            textShadow: "0 0 16px rgba(74,222,128,0.6)",
          }}>+{justEarned} TON</div>
        )}

        <button
          onClick={handleWatch}
          disabled={!btnActive}
          className={btnActive ? "pulse-glow" : ""}
          style={{
            width: "100%", padding: "16px 0", borderRadius: 14, border: "none",
            background: btnActive
              ? "linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #60a5fa 100%)"
              : "rgba(30,58,143,0.2)",
            color: btnActive ? "#fff" : "#475569",
            fontSize: 16, fontWeight: 800, letterSpacing: "0.1em",
            fontFamily: "inherit", cursor: btnActive ? "pointer" : "not-allowed",
            boxShadow: btnActive ? "0 0 24px rgba(37,99,235,0.4)" : "none",
            transition: "all 0.2s",
          }}
        >
          {btnLabel}
        </button>

        <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: "#334155" }}>
          {t.tasks.totalToday} <b style={{ color: "#fbbf24" }}>+{(watched * TON_PER_AD).toFixed(4)} TON</b>
        </div>
      </div>

      {/* ── TASKS ── */}
      {isLoading ? (
        <div style={{ textAlign: "center", color: "#64748b", padding: "32px 0" }}>{t.tasks.loading}</div>
      ) : pending.length === 0 && done.length === 0 ? (
        <div style={{
          background: "rgba(17,24,39,0.8)", border: "1px solid rgba(30,58,143,0.2)",
          borderRadius: 16, padding: 32, textAlign: "center",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#f1f5f9" }}>{t.tasks.noTasks}</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{t.tasks.noTasksSub}</div>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                {t.tasks.available(pending.length)}
              </div>
              {pending.map(task => (
                <div key={task.id} style={{
                  background: "rgba(17,24,39,0.9)", border: "1px solid rgba(30,58,143,0.3)",
                  borderRadius: 14, padding: 14, marginBottom: 8,
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{ fontSize: 28, minWidth: 40, textAlign: "center" }}>
                    {TYPE_ICONS[task.type] ?? "⚡"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>{task.title}</div>
                    {task.description && (
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{task.description}</div>
                    )}
                    <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      {(task.reward ?? 0) > 0 && (
                        <span style={{ fontSize: 12, color: "#60a5fa", fontWeight: 600 }}>+{task.reward} pts</span>
                      )}
                      {(task as { rewardTon?: number | null }).rewardTon && (task as { rewardTon?: number | null }).rewardTon! > 0 && (
                        <span style={{ fontSize: 12, color: "#fbbf24", fontWeight: 700 }}>+{(task as { rewardTon?: number | null }).rewardTon} TON</span>
                      )}
                      {(task as { maxCompletions?: number | null; currentCompletions?: number }).maxCompletions && (
                        <span style={{ fontSize: 11, color: "#64748b" }}>
                          {(task as { currentCompletions?: number }).currentCompletions ?? 0}/{(task as { maxCompletions?: number | null }).maxCompletions}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleComplete(task.id, task.link)}
                    disabled={completeTask.isPending}
                    style={{
                      background: "linear-gradient(135deg, #1e3a8a, #2563eb)",
                      color: "#fff", border: "none", borderRadius: 10,
                      padding: "8px 14px", fontSize: 13, fontWeight: 600,
                      fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    {task.link ? t.tasks.go : t.tasks.claim}
                  </button>
                </div>
              ))}
            </div>
          )}

          {done.length > 0 && (
            <div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                {t.tasks.completed(done.length)}
              </div>
              {done.map(task => (
                <div key={task.id} style={{
                  background: "rgba(17,24,39,0.6)", border: "1px solid rgba(30,58,143,0.15)",
                  borderRadius: 14, padding: 14, marginBottom: 8,
                  display: "flex", alignItems: "center", gap: 12, opacity: 0.6,
                }}>
                  <div style={{ fontSize: 24, minWidth: 40, textAlign: "center" }}>✅</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "#94a3b8", textDecoration: "line-through" }}>{task.title}</div>
                    <div style={{ display: "flex", gap: 5, marginTop: 2, flexWrap: "wrap" }}>
                      {(task.reward ?? 0) > 0 && <span style={{ fontSize: 12, color: "#4ade80" }}>+{task.reward} pts</span>}
                      {(task as { rewardTon?: number | null }).rewardTon && (task as { rewardTon?: number | null }).rewardTon! > 0 && (
                        <span style={{ fontSize: 12, color: "#fbbf24" }}>+{(task as { rewardTon?: number | null }).rewardTon} TON</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
