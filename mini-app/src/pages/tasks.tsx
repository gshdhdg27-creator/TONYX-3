import { useState, useCallback, useRef } from "react";
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
import { useAdsgram } from "@adsgram/react";
import { useTelegram, haptic, hapticNotify } from "@/lib/telegram";

const BLOCK_ID = import.meta.env.VITE_ADSGRAM_BLOCK_ID ?? "int-32141";

function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
      background: type === "success" ? "rgba(22,163,74,0.9)" : "rgba(220,38,38,0.9)",
      color: "#fff", padding: "12px 20px", borderRadius: 12,
      fontSize: 14, fontWeight: 600, zIndex: 9999, maxWidth: "calc(100% - 32px)",
    }}>{msg}</div>
  );
}

/** Remove AdsGram overlays injected into <body> */
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
  const qc = useQueryClient();
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [justEarned, setJustEarned] = useState(0);
  const bodySnapshotRef = useRef<Set<Element>>(new Set());

  const showToast = useCallback((msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const { data: tasksData, isLoading } = useGetMiniTasks(telegramId ?? "", {
    query: { enabled: !!telegramId, refetchInterval: 15000 },
  });
  const { data: profile } = useGetUserProfile(telegramId ?? "", {
    query: { enabled: !!telegramId, refetchInterval: 10000 },
  });
  const { data: earnStatus } = useGetMiniEarnStatus(telegramId ?? "", {
    query: { enabled: !!telegramId, refetchInterval: 5000 },
  });

  /* ── Ad watch ── */
  const recordWatch = useRecordMiniAdWatch({
    mutation: {
      onSuccess: (data) => {
        if (data.coinsEarned > 0) {
          hapticNotify("success");
          setJustEarned(data.coinsEarned);
          showToast(`+${data.coinsEarned} pts заработано!`, "success");
        }
        qc.invalidateQueries({ queryKey: getGetMiniEarnStatusQueryKey(telegramId ?? "") });
        qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId ?? "") });
        setTimeout(() => setJustEarned(0), 2500);
      },
      onError: (e: unknown) => {
        hapticNotify("error");
        showToast((e as { data?: { error?: string } })?.data?.error ?? "Ошибка", "error");
      },
    },
  });

  const onReward = useCallback(() => {
    if (!telegramId) return;
    recordWatch.mutate({ data: { telegramId, blockId: BLOCK_ID } });
  }, [telegramId]);

  const showAdError = useCallback(() => {
    removeAdsgramOverlays(bodySnapshotRef.current);
    showToast("Реклама временно недоступна, попробуйте позже", "error");
  }, [showToast]);

  const onAdError = useCallback(() => {
    removeAdsgramOverlays(bodySnapshotRef.current);
    showAdError();
  }, [showAdError]);

  const { show: showAd } = useAdsgram({ blockId: BLOCK_ID, onReward, onError: onAdError });

  const handleWatch = useCallback(async () => {
    haptic("medium");
    if (!isInTelegram) { showToast("Реклама работает только внутри Telegram", "error"); return; }
    if (!telegramId) { showToast("Профиль не загружен", "error"); return; }
    bodySnapshotRef.current = new Set(Array.from(document.body.children));
    try { await showAd(); } catch {
      removeAdsgramOverlays(bodySnapshotRef.current);
      showAdError();
    }
  }, [showAd, isInTelegram, telegramId, showAdError, showToast]);

  /* ── Task complete ── */
  const completeTask = useCompleteMiniTask({
    mutation: {
      onSuccess: (data) => {
        hapticNotify("success");
        showToast(`+${data.coinsEarned} pts за "${data.taskTitle}"!`, "success");
        qc.invalidateQueries({ queryKey: getGetMiniTasksQueryKey(telegramId ?? "") });
        qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId ?? "") });
      },
      onError: (e: unknown) => {
        hapticNotify("error");
        showToast((e as { data?: { error?: string } })?.data?.error ?? "Failed", "error");
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
  const cooldown = earnStatus?.cooldownSeconds ?? 0;

  return (
    <div style={{ padding: 16 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Задания</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>Выполняй задания и смотри рекламу</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#60a5fa" }}>{profile?.coins ?? 0}</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>pts</div>
        </div>
      </div>

      {/* ── WATCH AD SECTION ── */}
      <div style={{
        background: "linear-gradient(135deg, rgba(30,58,143,0.35), rgba(37,99,235,0.15))",
        border: "1px solid rgba(96,165,250,0.3)",
        borderRadius: 18, padding: "16px 16px", marginBottom: 20,
        boxShadow: "0 0 24px rgba(37,99,235,0.15)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 24 }}>📺</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#f1f5f9" }}>Смотреть рекламу</div>
            <div style={{ fontSize: 11, color: "#93c5fd" }}>
              {earnStatus ? `${earnStatus.minCoins}–${earnStatus.maxCoins} pts за просмотр` : "Загрузка…"}
            </div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa", fontVariantNumeric: "tabular-nums" }}>
              {watched}/{limit}
            </div>
            <div style={{ fontSize: 10, color: "#475569" }}>сегодня</div>
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
          }}>+{justEarned} pts</div>
        )}

        <button
          onClick={handleWatch}
          disabled={!telegramId || recordWatch.isPending || !canWatch}
          className={telegramId && canWatch ? "pulse-glow" : ""}
          style={{
            width: "100%", padding: "16px 0", borderRadius: 14, border: "none",
            background: canWatch && telegramId
              ? "linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #60a5fa 100%)"
              : "rgba(30,58,143,0.2)",
            color: canWatch && telegramId ? "#fff" : "#475569",
            fontSize: 16, fontWeight: 800, letterSpacing: "0.1em",
            fontFamily: "inherit", cursor: canWatch && telegramId ? "pointer" : "not-allowed",
            boxShadow: canWatch && telegramId ? "0 0 24px rgba(37,99,235,0.4)" : "none",
            transition: "all 0.2s",
          }}
        >
          {recordWatch.isPending
            ? "⏳ ОБРАБОТКА…"
            : cooldown > 0
              ? `⏱ КУЛДАУН ${cooldown}с`
              : watched >= limit
                ? "✅ ЛИМИТ ИСЧЕРПАН"
                : "▶ СМОТРЕТЬ РЕКЛАМУ"}
        </button>
      </div>

      {/* ── TASKS ── */}
      {isLoading ? (
        <div style={{ textAlign: "center", color: "#64748b", padding: "32px 0" }}>Загрузка заданий…</div>
      ) : pending.length === 0 && done.length === 0 ? (
        <div style={{
          background: "rgba(17,24,39,0.8)", border: "1px solid rgba(30,58,143,0.2)",
          borderRadius: 16, padding: 32, textAlign: "center",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#f1f5f9" }}>Заданий пока нет</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Загляни позже — скоро появятся новые</div>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                Доступные ({pending.length})
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
                    <div style={{ fontSize: 12, color: "#60a5fa", marginTop: 4, fontWeight: 600 }}>+{task.reward} pts</div>
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
                    {task.link ? "Перейти" : "Получить"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {done.length > 0 && (
            <div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                Выполненные ({done.length})
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
                    <div style={{ fontSize: 12, color: "#4ade80", marginTop: 2 }}>+{task.reward} pts получено</div>
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
