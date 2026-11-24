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
      <div style={secTitle}>PvP игры</div>
      <div style={grid}>
        <GameCard
          name="Арена"
          scene="arena"
          badge="PvP"
          badgeColor="#6366f1"
          online={6}
          maxBet="50 TON"
          gradient="linear-gradient(145deg, #1e3a8a 0%, #ca8a04 45%, #b91c1c 100%)"
          accent="rgba(99,102,241,0.55)"
          enterDelay={0}
          onClick={() => setTab("arena")}
        />
        <GameCard
          name="Spin"
          scene="spin"
          badge="НОВИНКА"
          badgeColor="#f97316"
          online={8}
          maxBet="25 TON"
          gradient="linear-gradient(160deg, #4c1d95 0%, #7c3aed 50%, #312e81 100%)"
          accent="rgba(168,85,247,0.55)"
          enterDelay={80}
          onClick={() => setTab("spin")}
        />
      </div>
    </div>
  );
}

const page: CSSProperties = {
  minHeight: "100dvh",
  background: "radial-gradient(ellipse at 50% 0%, #16122a 0%, #0b0b0f 55%)",
  color: "#fff",
  fontFamily: "Inter, system-ui, sans-serif",
  padding: "18px 14px 120px",
};
const secTitle: CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
  color: "#fff",
  marginBottom: 14,
  letterSpacing: "-0.03em",
};
const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};
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
