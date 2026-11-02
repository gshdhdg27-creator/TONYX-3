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
        <button type="button" onClick={() => setTab("pick")} style={back}>
          ← Назад
        </button>
        <MinesGame
          telegramId={telegramId ?? ""}
          balance={tonBalance}
          lang={lang}
          onBalanceChange={refreshBalance}
        />
      </div>
    );
  }

  if (tab === "coin") {
    return (
      <div style={{ minHeight: "100dvh", padding: "12px 12px 110px", background: "#0a0612" }}>
        <button type="button" onClick={() => setTab("pick")} style={back}>
          ← Назад
        </button>
        <CoinFlipGame
          telegramId={telegramId ?? ""}
          balance={tonBalance}
          onBalanceChange={refreshBalance}
        />
      </div>
    );
  }

  if (tab === "crash") {
    return (
      <div style={{ minHeight: "100dvh", padding: "12px 12px 110px", background: "#0a0612" }}>
        <button type="button" onClick={() => setTab("pick")} style={back}>
          ← Назад
        </button>
        <CrashGame
          telegramId={telegramId ?? ""}
          balance={tonBalance}
          onBalanceChange={refreshBalance}
        />
      </div>
    );
  }

  if (tab === "plinko") {
    return (
      <div style={{ minHeight: "100dvh", padding: "12px 12px 140px", background: "#0a0612" }}>
        <button type="button" onClick={() => setTab("pick")} style={back}>
          ← Назад
        </button>
        <PlinkoGame
          telegramId={telegramId ?? ""}
          balance={tonBalance}
          onBalanceChange={refreshBalance}
        />
      </div>
    );
  }

  if (tab === "upgrade") {
    return (
      <div style={{ minHeight: "100dvh", padding: "12px 12px 110px", background: "#0a0612" }}>
        <button type="button" onClick={() => setTab("pick")} style={back}>
          ← Назад
        </button>
        <UpgradeGame
          telegramId={telegramId ?? ""}
          balance={tonBalance}
          onBalanceChange={refreshBalance}
        />
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={header}>
        <div style={title}>Соло</div>
        <div style={sub}>Выбери режим</div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {/* wide UPGRADE like reference */}
        <GameCard
          wide
          scene="upgrade"
          name="UPGRADE"
          badge="NEW"
          badgeColor="#ec4899"
          online={14}
          gradient="linear-gradient(135deg, #fbbf24 0%, #f59e0b 35%, #db2777 100%)"
          accent="rgba(251,191,36,0.45)"
          onClick={() => setTab("upgrade")}
        />

        <div style={grid}>
          <GameCard
            scene="plinko"
            name="PLINKO"
            badge="NEW"
            badgeColor="#38bdf8"
            online={19}
            gradient="linear-gradient(160deg, #0ea5e9 0%, #0369a1 45%, #0c4a6e 100%)"
            accent="rgba(14,165,233,0.5)"
            onClick={() => setTab("plinko")}
          />
          <div style={{ display: "grid", gap: 12 }}>
            <GameCard
              scene="mines"
              name="MINES"
              badge="NEW"
              badgeColor="#a855f7"
              online={31}
              gradient="linear-gradient(145deg, #6d28d9 0%, #4c1d95 50%, #1e1b4b 100%)"
              accent="rgba(168,85,247,0.5)"
              onClick={() => setTab("mines")}
            />
            <GameCard
              scene="crash"
              name="CRASH"
              badge="NEW"
              badgeColor="#f97316"
              online={27}
              gradient="linear-gradient(145deg, #1d4ed8 0%, #7c3aed 40%, #ea580c 100%)"
              accent="rgba(249,115,22,0.5)"
              onClick={() => setTab("crash")}
            />
          </div>
        </div>

        <GameCard
          wide
          scene="coin"
          name="COIN FLIP"
          online={18}
          gradient="linear-gradient(135deg, #fde047 0%, #eab308 40%, #a16207 100%)"
          accent="rgba(234,179,8,0.5)"
          onClick={() => setTab("coin")}
        />
      </div>
    </div>
  );
}

const page: CSSProperties = {
  minHeight: "100dvh",
  padding: "18px 14px 120px",
  color: "#fff",
  background: "radial-gradient(ellipse at 50% -5%, #3b1d6d 0%, #0a0612 55%)",
};
const header: CSSProperties = { marginBottom: 16 };
const title: CSSProperties = { fontSize: 28, fontWeight: 900, letterSpacing: "-0.03em" };
const sub: CSSProperties = { fontSize: 13, color: "#c4b5fd", marginTop: 4, fontWeight: 600 };
const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.05fr 0.95fr",
  gap: 12,
  alignItems: "stretch",
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
