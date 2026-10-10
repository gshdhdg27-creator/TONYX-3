import { useState } from "react";
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
        <GameCard
          name="Арена"
          badge="PvP"
          tone="red"
          online="24"
          onClick={() => setTab("arena")}
          art={<ArenaArt />}
        />
        <GameCard
          name="Барабан"
          badge="PvP"
          tone="gold"
          online="18"
          onClick={() => setTab("spin")}
          art={<WheelArt />}
        />
      </div>
    </div>
  );
}

function GameCard({
  name, badge, tone, online, onClick, art,
}: {
  name: string;
  badge: string;
  tone: "red" | "gold" | "blue" | "green";
  online: string;
  onClick: () => void;
  art: React.ReactNode;
}) {
  const glow = tone === "red" ? "#dc2626" : tone === "gold" ? "#eab308" : tone === "green" ? "#22c55e" : "#2563eb";
  return (
    <button type="button" onClick={onClick} style={{ ...card, boxShadow: `0 10px 30px ${glow}33` }}>
      <div style={artBox}>{art}</div>
      <div style={badgeRow}>
        <span style={{ ...pill, background: glow }}>{badge}</span>
        <span style={onlinePill}>● {online}</span>
      </div>
      <div style={cardName}>{name}</div>
    </button>
  );
}

function ArenaArt() {
  return (
    <svg viewBox="0 0 160 110" width="100%" height="100%">
      <defs>
        <linearGradient id="a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7f1d1d" />
          <stop offset="1" stopColor="#1e3a8a" />
        </linearGradient>
      </defs>
      <rect width="160" height="110" fill="url(#a)" />
      <circle cx="48" cy="58" r="22" fill="#60a5fa" />
      <circle cx="112" cy="58" r="22" fill="#f87171" />
      <path d="M70 40 L90 70 L70 70 Z" fill="#facc15" />
    </svg>
  );
}
function WheelArt() {
  return (
    <svg viewBox="0 0 160 110" width="100%" height="100%">
      <rect width="160" height="110" fill="#3b0764" />
      <circle cx="80" cy="58" r="34" fill="#eab308" />
      <circle cx="80" cy="58" r="34" fill="none" stroke="#7c2d12" strokeWidth="10" strokeDasharray="18 10" />
      <circle cx="80" cy="58" r="8" fill="#0b1020" />
    </svg>
  );
}

const page: React.CSSProperties = { minHeight: "100dvh", padding: "18px 14px 120px", color: "#f8fafc" };
const title: React.CSSProperties = { fontSize: 22, fontWeight: 900, marginBottom: 14 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const card: React.CSSProperties = {
  position: "relative", height: 168, border: 0, borderRadius: 22, overflow: "hidden",
  background: "#111827", padding: 0, textAlign: "left", cursor: "pointer",
};
const artBox: React.CSSProperties = { position: "absolute", inset: 0 };
const badgeRow: React.CSSProperties = { position: "absolute", top: 10, left: 10, right: 10, display: "flex", justifyContent: "space-between" };
const pill: React.CSSProperties = { color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 999, padding: "4px 8px" };
const onlinePill: React.CSSProperties = { color: "#bbf7d0", background: "rgba(0,0,0,0.35)", borderRadius: 999, padding: "4px 8px", fontSize: 10, fontWeight: 800 };
const cardName: React.CSSProperties = { position: "absolute", left: 12, bottom: 12, fontSize: 20, fontWeight: 900 };
const back: React.CSSProperties = { margin: 12, height: 34, borderRadius: 10, border: "1px solid #334155", background: "#111827", color: "#e2e8f0" };
import type React from "react";
