import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMiniTasks,
  getGetMiniTasksQueryKey,
  useCompleteMiniTask,
  useGetUserProfile,
  getGetUserProfileQueryKey,
} from "@workspace/api-client-react";
import { useTelegram } from "@/lib/telegram";
import { haptic, hapticNotify } from "@/lib/telegram";

function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
      background: type === "success" ? "rgba(22,163,74,0.9)" : "rgba(220,38,38,0.9)",
      color: "#fff", padding: "12px 20px", borderRadius: 12,
      fontSize: 14, fontWeight: 600, zIndex: 9999, maxWidth: "calc(100% - 32px)",
    }}>
      {msg}
    </div>
  );
}

const TYPE_ICONS: Record<string, string> = {
  subscribe: "📢",
  follow: "👤",
  visit: "🔗",
  social: "📱",
  custom: "⚡",
};

export default function TasksPage() {
  const { telegramId } = useTelegram();
  const qc = useQueryClient();
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const { data: tasksData, isLoading } = useGetMiniTasks(telegramId ?? "", {
    query: { enabled: !!telegramId, refetchInterval: 15000 },
  });
  const { data: profile } = useGetUserProfile(telegramId ?? "", {
    query: { enabled: !!telegramId },
  });

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const completeTask = useCompleteMiniTask({
    mutation: {
      onSuccess: (data) => {
        hapticNotify("success");
        showToast(`+${data.coinsEarned} coins for "${data.taskTitle}"!`, "success");
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
      setTimeout(() => {
        completeTask.mutate({ id, data: { telegramId } });
      }, 1500);
    } else {
      completeTask.mutate({ id, data: { telegramId } });
    }
  };

  return (
    <div style={{ padding: 16 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Tasks</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>Complete tasks, earn coins</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#60a5fa" }}>{profile?.coins ?? 0}</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>coins</div>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", color: "#64748b", padding: "48px 0" }}>Loading tasks...</div>
      ) : pending.length === 0 && done.length === 0 ? (
        <div style={{
          background: "rgba(17,24,39,0.8)", border: "1px solid rgba(30,58,143,0.2)",
          borderRadius: 16, padding: 32, textAlign: "center",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#f1f5f9" }}>No tasks yet</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Check back soon for new tasks</div>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                Available ({pending.length})
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
                    <div style={{ fontSize: 12, color: "#60a5fa", marginTop: 4, fontWeight: 600 }}>+{task.reward} coins</div>
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
                    {task.link ? "Go & Claim" : "Claim"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {done.length > 0 && (
            <div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                Completed ({done.length})
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
                    <div style={{ fontSize: 12, color: "#4ade80", marginTop: 2 }}>+{task.reward} coins earned</div>
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
