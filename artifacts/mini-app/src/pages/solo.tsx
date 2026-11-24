import { useState, useEffect, type CSSProperties } from "react";
import { useTelegram } from "@/lib/telegram";
import { useLang } from "@/lib/LanguageContext";
import MinesGame from "@/components/MinesGame";
import CoinFlipGame from "@/components/CoinFlipGame";
import CrashGame from "@/components/CrashGame";
import PlinkoGame from "@/components/PlinkoGame";
import UpgradeGame from "@/components/UpgradeGame";
import { GameCard } from "@/components/GameCard";
import { useGetUserProfile, getGetUserProfileQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

type Tab = "pick" | "mines" | "coin" | "crash" | "plinko" | "upgrade";

export default function SoloPage() {
  const { telegramId } = useTelegram();
  const { lang } = useLang();
  const [tab, setTab] = useState<Tab>("pick");
  const queryClient = useQueryClient();

  const { data: profile, refetch } = useGetUserProfile(telegramId ?? "", {
    query: {
      enabled: !!telegramId,
      refetchOnWindowFocus: true,
    },
  } as Parameters<typeof useGetUserProfile>[1]);

  const tonBalance = profile ? Number((profile as { ton?: string | number }).ton ?? 0) : 0;

  const refreshBalance = async () => {
    if (!telegramId) return;
    await refetch();
    void queryClient.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId) });
  };

  useEffect(() => {
    if (telegramId) void refetch();
  }, [telegramId]);

  if (tab === "mines") {
    return (
      <div style={{ minHeight: "100dvh", padding: "12px 12px 110px", background: "#0a0612" }}>
        <button type="button" onClick={() => setTab("pick")} style={back}>← Назад</button>
        <MinesGame telegramId={telegramId ?? ""} balance={tonBalance} lang={lang} onBalanceChange={refreshBalance} />
      </div>
    );
  }
  if (tab === "coin") {
    return (
      <div style={{ minHeight: "100dvh", padding: "12px 12px 110px", background: "#0a0612" }}>
        <button type="button" onClick={() => setTab("pick")} style={back}>← Назад</button>
        <CoinFlipGame telegramId={telegramId ?? ""} balance={tonBalance} onBalanceChange={refreshBalance} />
      </div>
    );
  }
  if (tab === "crash") {
    return (
      <div style={{ minHeight: "100dvh", padding: "12px 12px 110px", background: "#0a0612" }}>
        <button type="button" onClick={() => setTab("pick")} style={back}>← Назад</button>
        <CrashGame telegramId={telegramId ?? ""} balance={tonBalance} onBalanceChange={refreshBalance} />
      </div>
    );
  }
  if (tab === "plinko") {
    return (
      <div style={{ minHeight: "100dvh", padding: "12px 12px 110px", background: "#0a0612" }}>
        <button type="button" onClick={() => setTab("pick")} style={back}>← Назад</button>
        <PlinkoGame telegramId={telegramId ?? ""} balance={tonBalance} onBalanceChange={refreshBalance} />
      </div>
    );
  }
  if (tab === "upgrade") {
    return (
      <div style={{ minHeight: "100dvh", padding: "12px 12px 110px", background: "#0a0612" }}>
        <button type="button" onClick={() => setTab("pick")} style={back}>← Назад</button>
        <UpgradeGame telegramId={telegramId ?? ""} balance={tonBalance} onBalanceChange={refreshBalance} />
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={secTitle}>Соло игры</div>

      <GameCard
        wide
        scene="upgrade"
        name="Upgrade"
        badge="HOT"
        badgeColor="#f43f5e"
        online={13}
        maxBet="20 TON"
        gradient="linear-gradient(135deg, #4c1d95 0%, #7c3aed 40%, #db2777 100%)"
        accent="rgba(236,72,153,0.45)"
        enterDelay={0}
        onClick={() => setTab("upgrade")}
      />

      <div style={{ height: 12 }} />

      <div style={grid}>
        <GameCard
          scene="plinko"
          name="Plinko"
          badge="NEW"
          badgeColor="#38bdf8"
          online={6}
          maxBet="15 TON"
          gradient="linear-gradient(160deg, #0ea5e9 0%, #0369a1 50%, #0c4a6e 100%)"
          accent="rgba(14,165,233,0.45)"
          enterDelay={40}
          onClick={() => setTab("plinko")}
        />
        <GameCard
          scene="mines"
          name="Mines"
          badge="NEW"
          badgeColor="#a855f7"
          online={12}
          maxBet="10 TON"
          gradient="linear-gradient(145deg, #6d28d9 0%, #4c1d95 50%, #1e1b4b 100%)"
          accent="rgba(168,85,247,0.45)"
          enterDelay={80}
          onClick={() => setTab("mines")}
        />
        <GameCard
          scene="crash"
          name="Crash"
          online={7}
          maxBet="25 TON"
          gradient="linear-gradient(145deg, #1d4ed8 0%, #7c3aed 40%, #ea580c 100%)"
          accent="rgba(249,115,22,0.45)"
          enterDelay={120}
          onClick={() => setTab("crash")}
        />
        <GameCard
          scene="coin"
          name="Coinflip"
          online={6}
          maxBet="15 TON"
          gradient="linear-gradient(145deg, #fde047 0%, #38bdf8 55%, #0ea5e9 100%)"
          accent="rgba(56,189,248,0.4)"
          enterDelay={160}
          onClick={() => setTab("coin")}
        />
      </div>
    </div>
  );
}

const page: CSSProperties = {
  minHeight: "100dvh",
  padding: "16px 14px 120px",
  color: "#fff",
  background: "#0b0b0f",
  fontFamily: "Inter, system-ui, sans-serif",
};
const secTitle: CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: "rgba(255,255,255,0.92)",
  marginBottom: 12,
  letterSpacing: "-0.02em",
};
const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};
const back: CSSProperties = {
  marginBottom: 12,
  height: 36,
  padding: "0 14px",
  borderRadius: 12,
  border: "1px solid rgba(168,85,247,0.35)",
  background: "rgba(24,16,40,0.9)",
  color: "#e9d5ff",
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};
