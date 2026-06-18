import { useState } from "react";
import { useGetMiniLeaderboard } from "@workspace/api-client-react";
import { useTelegram, haptic } from "@/lib/telegram";

type Cat = "top_earn" | "top_players" | "referrals" | "top_igro";

const TABS: { key: Cat; label: string }[] = [
  { key: "top_earn", label: "Top Earn" },
  { key: "top_players", label: "Top Players" },
  { key: "referrals", label: "Referrals" },
  { key: "top_igro", label: "🎮 Игромания" },
];

const MEDAL: Record<number, { emoji: string; color: string; bg: string }> = {
  1: { emoji: "🥇", color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  2: { emoji: "🥈", color: "#cbd5e1", bg: "rgba(203,213,225,0.10)" },
  3: { emoji: "🥉", color: "#f97316", bg: "rgba(249,115,22,0.10)" },
};

export default function LeaderboardPage() {
  const { telegramId } = useTelegram();
  const [cat, setCat] = useState<Cat>("top_earn");

  const { data, isLoading } = useGetMiniLeaderboard(
    { category: cat, telegramId: telegramId ?? undefined },
    { query: { refetchInterval: 15000 } },
  );

  const entries = data?.entries ?? [];

  const valueLabel = (n: number, ton?: number) =>
    cat === "referrals" ? `${n} refs`
    : cat === "top_players" ? `${n} ads`
    : cat === "top_igro" ? `${(ton ?? 0).toFixed(3)} TON`
    : `${n.toLocaleString()} TONYX`;

  return (
    <div style={{ padding: "20px 16px 32px", minHeight: "100%" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.01em" }}>🏆 Leaderboard</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>Compete with players worldwide</div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          padding: 4,
          background: "rgba(17,24,39,0.85)",
          border: "1px solid rgba(30,58,143,0.3)",
          borderRadius: 14,
          marginBottom: 18,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              haptic("light");
              setCat(t.key);
            }}
            style={{
              flex: 1,
              padding: "9px 0",
              borderRadius: 10,
              border: "none",
              background: cat === t.key ? "linear-gradient(135deg, #1e3a8a, #2563eb)" : "transparent",
              color: cat === t.key ? "#fff" : "#94a3b8",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: "pointer",
              transition: "all 0.2s",
              boxShadow: cat === t.key ? "0 0 16px rgba(37,99,235,0.45)" : "none",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {data?.myRank && (
        <div
          style={{
            background: "linear-gradient(135deg, rgba(37,99,235,0.18), rgba(96,165,250,0.08))",
            border: "1px solid rgba(96,165,250,0.35)",
            borderRadius: 14,
            padding: "10px 14px",
            marginBottom: 14,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 0 20px rgba(37,99,235,0.18)",
          }}
        >
          <div style={{ fontSize: 12, color: "#93c5fd", fontWeight: 600, letterSpacing: "0.05em" }}>YOUR RANK</div>
          <div style={{ fontSize: 18, color: "#fff", fontWeight: 800 }}>#{data.myRank}</div>
        </div>
      )}

      {isLoading ? (
        <div style={{ textAlign: "center", color: "#64748b", padding: "32px 0" }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div
          style={{
            background: "rgba(17,24,39,0.85)",
            border: "1px solid rgba(30,58,143,0.25)",
            borderRadius: 14,
            padding: 28,
            textAlign: "center",
            color: "#64748b",
          }}
        >
          No data yet
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map((e) => {
            const medal = MEDAL[e.rank];
            const isMe = e.telegramId === telegramId;
            return (
              <div
                key={e.telegramId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 14,
                  background: medal?.bg ?? (isMe ? "rgba(37,99,235,0.10)" : "rgba(17,24,39,0.85)"),
                  border: isMe
                    ? "1px solid rgba(96,165,250,0.5)"
                    : medal
                      ? `1px solid ${medal.color}33`
                      : "1px solid rgba(30,58,143,0.25)",
                  boxShadow: medal ? `0 0 18px ${medal.color}22` : "none",
                }}
              >
                <div
                  style={{
                    width: 36,
                    textAlign: "center",
                    fontSize: medal ? 22 : 15,
                    fontWeight: 700,
                    color: medal?.color ?? "#475569",
                  }}
                >
                  {medal?.emoji ?? `#${e.rank}`}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#e2e8f0",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {e.username ? `@${e.username}` : e.firstName ?? `User ${e.telegramId.slice(-4)}`}
                    {isMe && <span style={{ color: "#60a5fa", fontWeight: 500 }}> · you</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    {cat === "top_earn" && e.ton > 0 ? `${e.ton.toFixed(2)} TON` : ""}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "#60a5fa", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {valueLabel(e.coins, e.ton)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
