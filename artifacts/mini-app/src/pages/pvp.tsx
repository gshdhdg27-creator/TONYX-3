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
      <div style={{ minHeight: "100dvh", paddingBottom: 110, background: "#0a0612" }}>
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
      <div style={header}>
        <div style={title}>PvP игры</div>
        <div style={sub}>Snoop Dogg Arena · TONYX</div>
      </div>
      <div style={grid}>
        <GameCard
          name="Арена"
          badge="PvP"
          badgeColor="#a855f7"
          online={24}
          lottieSrc={LOTTIE.arena}
          emoji="🐶"
          stickers={["👑", "💎"]}
          gradient="linear-gradient(145deg, #4c1d95 0%, #7c3aed 35%, #c026d3 70%, #1e1b4b 100%)"
          accent="rgba(168,85,247,0.55)"
          onClick={() => setTab("arena")}
        />
        <GameCard
          name="Барабан"
          badge="PvP"
          badgeColor="#eab308"
          online={18}
          lottieSrc={LOTTIE.spin}
          emoji="🎰"
          stickers={["🚬", "🎁"]}
          gradient="linear-gradient(145deg, #3b0764 0%, #6d28d9 40%, #ca8a04 85%, #1c1917 100%)"
          accent="rgba(234,179,8,0.45)"
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
  background: "radial-gradient(ellipse at 30% -10%, #3b0764 0%, #0a0612 50%)",
};
const header: CSSProperties = { marginBottom: 16 };
const title: CSSProperties = { fontSize: 26, fontWeight: 900, letterSpacing: "-0.03em" };
const sub: CSSProperties = { fontSize: 12, color: "#c4b5fd", marginTop: 4, fontWeight: 600 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const back: CSSProperties = {
  margin: 12,
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
