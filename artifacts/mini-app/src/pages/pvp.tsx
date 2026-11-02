import { useState, type CSSProperties } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetUserProfile, getGetUserProfileQueryKey } from "@workspace/api-client-react";
import { useTelegram } from "@/lib/telegram";
import ArenaGame from "@/components/ArenaGame";
import SpinGame from "@/components/SpinGame";
import { GameCard } from "@/components/GameCard";

type Tab = "pick" | "arena" | "spin";

export default function PvpPage() {
  const { telegramId } = useTelegram();
  const qc = useQueryClient();
  const id = telegramId ?? "";
  const { data: profile } = useGetUserProfile(id, {
    query: { enabled: !!id, refetchInterval: 10000 },
  } as Parameters<typeof useGetUserProfile>[1]);
  const tonBalance = Number((profile as { ton?: string | number } | undefined)?.ton ?? 0);
  const refresh = () => {
    qc.refetchQueries({ queryKey: getGetUserProfileQueryKey(id) });
  };
  const [tab, setTab] = useState<Tab>("pick");

  if (tab === "arena") {
    return (
      <ArenaGame
        telegramId={id}
        tonBalance={tonBalance}
        onBalanceChange={refresh}
        onClose={() => {
          setTab("pick");
          refresh();
        }}
        onOpenHistory={() => undefined}
      />
    );
  }

  if (tab === "spin") {
    return (
      <div style={{ minHeight: "100dvh", paddingBottom: 110, background: "#0a0612" }}>
        <button type="button" onClick={() => setTab("pick")} style={back}>
          ← Назад
        </button>
        <SpinGame
          telegramId={id}
          tonBalance={tonBalance}
          onBalanceChange={refresh}
          onOpenHistory={() => undefined}
        />
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={header}>
        <div style={title}>PvP</div>
        <div style={sub}>Арена · Spin</div>
      </div>

      <div style={{ padding: "8px 16px 120px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <GameCard
          name="АРЕНА"
          badge="PvP"
          badgeColor="#a855f7"
          online={42}
          emoji="⚔️"
          gradient="linear-gradient(160deg, #1a0a2e 0%, #2e1065 45%, #0f172a 100%)"
          accent="rgba(168,85,247,0.55)"
          onClick={() => setTab("arena")}
        />
        <GameCard
          name="SPIN"
          badge="LIVE"
          badgeColor="#22d3ee"
          online={21}
          emoji="🎡"
          gradient="linear-gradient(160deg, #042f2e 0%, #0e7490 45%, #0f172a 100%)"
          accent="rgba(34,211,238,0.5)"
          onClick={() => setTab("spin")}
        />
      </div>
    </div>
  );
}

const page: CSSProperties = {
  minHeight: "100dvh",
  background: "radial-gradient(ellipse at 50% -5%, #3b1d6d 0%, #0a0612 55%)",
  color: "#e2e8f0",
  fontFamily: "Inter, system-ui, sans-serif",
};

const header: CSSProperties = { padding: "18px 16px 8px" };
const title: CSSProperties = { fontSize: 28, fontWeight: 900 };
const sub: CSSProperties = { fontSize: 13, color: "#c4b5fd", marginTop: 4, fontWeight: 600 };
const back: CSSProperties = {
  margin: "12px 16px",
  background: "rgba(255,255,255,0.06)",
  border: "none",
  borderRadius: 10,
  padding: "8px 14px",
  color: "#94a3b8",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};
