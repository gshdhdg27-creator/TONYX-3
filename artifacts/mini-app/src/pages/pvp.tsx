import { useState, type CSSProperties } from "react";
import { useTelegram } from "@/lib/telegram";
import ArenaGame from "@/components/ArenaGame";
import SpinGame from "@/components/SpinGame";

type Tab = "pick" | "arena" | "spin";

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
      <div style={{ minHeight: "100dvh", paddingBottom: 110 }}>
        <button type="button" onClick={() => setTab("pick")} style={back}>Назад</button>
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
        <Card name="Арена" badge="PvP" online="24" image="/games/arena.jpg" onClick={() => setTab("arena")} />
        <Card name="Барабан" badge="PvP" online="18" image="/games/drum.jpg" onClick={() => setTab("spin")} />
      </div>
    </div>
  );
}

function Card({ name, badge, online, image, onClick }: {
  name: string; badge: string; online: string; image: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={card}>
      <img src={image} alt="" style={img} />
      <div style={shade} />
      <div style={topRow}>
        <span style={pill}>{badge}</span>
        <span style={onlinePill}>● {online}</span>
      </div>
      <div style={nameStyle}>{name}</div>
    </button>
  );
}

const page: CSSProperties = { minHeight: "100dvh", padding: "18px 14px 120px", color: "#fff", background: "#070b14" };
const title: CSSProperties = { fontSize: 24, fontWeight: 900, marginBottom: 14 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const card: CSSProperties = {
  position: "relative", height: 168, border: 0, borderRadius: 24, overflow: "hidden",
  padding: 0, cursor: "pointer", background: "#111827",
};
const img: CSSProperties = { width: "100%", height: "100%", objectFit: "cover", display: "block" };
const shade: CSSProperties = { position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.55))" };
const topRow: CSSProperties = { position: "absolute", top: 10, left: 10, right: 10, display: "flex", justifyContent: "space-between" };
const pill: CSSProperties = { background: "#f97316", color: "#fff", fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "4px 8px" };
const onlinePill: CSSProperties = { color: "#bbf7d0", background: "rgba(0,0,0,0.4)", borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 800 };
const nameStyle: CSSProperties = { position: "absolute", left: 12, bottom: 12, fontSize: 22, fontWeight: 900, textShadow: "0 2px 8px rgba(0,0,0,0.6)" };
const back: CSSProperties = { margin: 12, height: 34, borderRadius: 10, border: "1px solid #334155", background: "#111827", color: "#e2e8f0" };
