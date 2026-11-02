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

const LOTTIE = {
  mines: "https://assets5.lottiefiles.com/packages/lf20_k86wxpgr.json",
  coin: "https://assets3.lottiefiles.com/packages/lf20_ysrn2iwp.json",
  crash: "https://assets9.lottiefiles.com/packages/lf20_jbrw3hcz.json",
  plinko: "https://assets2.lottiefiles.com/packages/lf20_kyu7xb1v.json",
  upgrade: "https://assets1.lottiefiles.com/packages/lf20_jcikwtux.json",
};

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
        <div style={title}>Соло игры</div>
        <div style={sub}>Mines · Coin · Crash · Plinko · Upgrade</div>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        <GameCard
          wide
          name="Mines"
          badge="Solo"
          badgeColor="#22c55e"
          online={31}
          lottieSrc={LOTTIE.mines}
          emoji="💎"
          stickers={["🐶", "🎁"]}
          gradient="linear-gradient(145deg, #14532d 0%, #7c3aed 45%, #0f172a 100%)"
          accent="rgba(34,197,94,0.4)"
          onClick={() => setTab("mines")}
        />
        <div style={grid}>
          <GameCard
            name="Coin Flip"
            badge="Live"
            badgeColor="#22c55e"
            online={18}
            lottieSrc={LOTTIE.coin}
            emoji="🪙"
            stickers={["🦅", "⚪"]}
            gradient="linear-gradient(145deg, #713f12 0%, #eab308 40%, #4c1d95 100%)"
            accent="rgba(234,179,8,0.45)"
            onClick={() => setTab("coin")}
          />
          <GameCard
            name="Crash"
            badge="New"
            badgeColor="#f97316"
            online={24}
            lottieSrc={LOTTIE.crash}
            emoji="🚀"
            stickers={["📈"]}
            gradient="linear-gradient(145deg, #4c1d95 0%, #7c3aed 40%, #ea580c 100%)"
            accent="rgba(249,115,22,0.45)"
            onClick={() => setTab("crash")}
          />
          <GameCard
            name="Plinko"
            badge="New"
            badgeColor="#38bdf8"
            online={15}
            lottieSrc={LOTTIE.plinko}
            emoji="⚪"
            stickers={["🎯"]}
            gradient="linear-gradient(145deg, #0c4a6e 0%, #0284c7 40%, #0f172a 100%)"
            accent="rgba(56,189,248,0.45)"
            onClick={() => setTab("plinko")}
          />
          <GameCard
            name="Upgrade"
            badge="New"
            badgeColor="#ec4899"
            online={12}
            lottieSrc={LOTTIE.upgrade}
            emoji="⬆️"
            stickers={["💎"]}
            gradient="linear-gradient(145deg, #831843 0%, #db2777 40%, #0f172a 100%)"
            accent="rgba(236,72,153,0.45)"
            onClick={() => setTab("upgrade")}
          />
        </div>
      </div>
    </div>
  );
}

const page: CSSProperties = {
  minHeight: "100dvh",
  padding: "18px 14px 120px",
  color: "#fff",
  background: "radial-gradient(ellipse at 70% -10%, #4c1d95 0%, #0a0612 52%)",
};
const header: CSSProperties = { marginBottom: 16 };
const title: CSSProperties = { fontSize: 26, fontWeight: 900, letterSpacing: "-0.03em" };
const sub: CSSProperties = { fontSize: 12, color: "#c4b5fd", marginTop: 4, fontWeight: 600 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
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
