import { useState, type CSSProperties } from "react";
import { useTelegram } from "@/lib/telegram";
import ArenaGame from "@/components/ArenaGame";
import SpinGame from "@/components/SpinGame";
import { GameCard } from "@/components/GameCard";

type Tab = "pick" | "arena" | "spin";

const LOTTIE = {
  arena: "https://assets2.lottiefiles.com/packages/lf20_ydo1amjm.json",
  spin: "https://assets9.lottiefiles.com/packages/lf20_CQp5Qv.json",
};

export default function PvpPage() {
  const { telegramId } = useTelegram();
  const [tab, setTab] = useState<Tab>("pick");
  const [tonBalance, setTonBalance] = useState(0);
  const id = telegramId ?? "";

  if (tab === "arena") {
    return (
      <ArenaGame
        telegramId={id}
        tonBalance={tonBalance}
        onBalanceChange={setTonBalance}
        onClose={() => setTab("pick")}
        onOpenHistory={() => undefined}
      />
    );
  }
  if (tab === "spin") {
    return (
      <div style={{ minHeight: "100dvh", paddingBottom: 110, background: "#070b14" }}>
        <button type="button" onClick={() => setTab("pick")} style={back}>
          ← Назад
        </button>
        <SpinGame
          telegramId={id}
          tonBalance={tonBalance}
          onBalanceChange={setTonBalance}
          onOpenHistory={() => undefined}
        />
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={title}>PvP игры</div>
      <div style={grid}>
        <GameCard
          name="Арена"
          badge="PvP"
          badgeColor="#f97316"
          online={24}
          lottieSrc={LOTTIE.arena}
          emoji="⚔️"
          gradient="linear-gradient(145deg, #3b82f6 0%, #eab308 48%, #ef4444 100%)"
          onClick={() => setTab("arena")}
        />
        <GameCard
          name="Барабан"
          badge="PvP"
          badgeColor="#f97316"
          online={18}
          lottieSrc={LOTTIE.spin}
          emoji="🎰"
          gradient="linear-gradient(145deg, #7c3aed 0%, #ec4899 55%, #0f172a 100%)"
          onClick={() => setTab("spin")}
        />
      </div>
    </div>
  );
}

const page: CSSProperties = {
  minHeight: "100dvh",
  padding: "18px 14px 120px",
  color: "#fff",
  background: "radial-gradient(circle at 20% 0%, #1e1b4b 0%, #070b14 55%)",
};
const title: CSSProperties = { fontSize: 24, fontWeight: 900, marginBottom: 14 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const back: CSSProperties = {
  margin: 12,
  height: 36,
  padding: "0 14px",
  borderRadius: 12,
  border: "1px solid #334155",
  background: "#111827",
  color: "#e2e8f0",
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};
