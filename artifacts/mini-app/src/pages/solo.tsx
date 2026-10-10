import { useState } from "react";
import { useTelegram } from "@/lib/telegram";
import { useLang } from "@/lib/LanguageContext";
import { MinesGame } from "@/pages/games";

type Tab = "pick" | "mines" | "coin" | "roulette";

export default function SoloPage() {
  const { telegramId } = useTelegram();
  const { lang } = useLang();
  const [tab, setTab] = useState<Tab>("pick");
  const [tonBalance, setTonBalance] = useState(0);

  if (tab === "mines") {
    return (
      <div style={{ minHeight: "100dvh", padding: "12px 12px 110px" }}>
        <button type="button" onClick={() => setTab("pick")} style={back}>Назад</button>
        <MinesGame
          telegramId={telegramId ?? ""}
          balance={tonBalance}
          lang={lang}
          onBalanceChange={setTonBalance}
        />
      </div>
    );
  }
  if (tab === "coin" || tab === "roulette") {
    return (
      <div style={page}>
        <button type="button" onClick={() => setTab("pick")} style={back}>Назад</button>
        <div style={title}>{tab === "coin" ? "Монетка" : "Рулетка"}</div>
        <div style={{ color: "#94a3b8" }}>Карточка есть. Сама игра будет следующим шагом.</div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={title}>Соло игры</div>
      <div style={{ display: "grid", gap: 12 }}>
        <WideCard name="Mines" badge="Solo" tone="#2563eb" online="31" onClick={() => setTab("mines")} art={<MinesArt />} />
        <div style={grid}>
          <SmallCard name="Монетка" badge="Новое" tone="#eab308" onClick={() => setTab("coin")} art={<CoinArt />} />
          <SmallCard name="Рулетка" badge="Новое" tone="#dc2626" onClick={() => setTab("roulette")} art={<RouletteArt />} />
        </div>
      </div>
    </div>
  );
}

function WideCard({ name, badge, tone, online, onClick, art }: CardProps & { online: string }) {
  return (
    <button type="button" onClick={onClick} style={{ ...card, height: 150, boxShadow: `0 10px 30px ${tone}33` }}>
      <div style={artBox}>{art}</div>
      <div style={badgeRow}>
        <span style={{ ...pill, background: tone }}>{badge}</span>
        <span style={onlinePill}>● {online}</span>
      </div>
      <div style={cardName}>{name}</div>
    </button>
  );
}
function SmallCard({ name, badge, tone, onClick, art }: CardProps) {
  return (
    <button type="button" onClick={onClick} style={{ ...card, height: 150, boxShadow: `0 10px 30px ${tone}33` }}>
      <div style={artBox}>{art}</div>
      <span style={{ ...pill, position: "absolute", top: 10, left: 10, background: tone }}>{badge}</span>
      <div style={cardName}>{name}</div>
    </button>
  );
}
type CardProps = { name: string; badge: string; tone: string; onClick: () => void; art: React.ReactNode };

function MinesArt() {
  return (
    <svg viewBox="0 0 320 140" width="100%" height="100%">
      <rect width="320" height="140" fill="#082f49" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={24 + i * 58} y="34" width="46" height="46" rx="10" fill={i === 2 ? "#ef4444" : "#22c55e"} opacity="0.9" />
      ))}
    </svg>
  );
}
function CoinArt() {
  return (
    <svg viewBox="0 0 160 140" width="100%" height="100%">
      <rect width="160" height="140" fill="#713f12" />
      <circle cx="80" cy="70" r="36" fill="#facc15" />
      <text x="80" y="78" textAnchor="middle" fontSize="28" fontWeight="700" fill="#713f12">T</text>
    </svg>
  );
}
function RouletteArt() {
  return (
    <svg viewBox="0 0 160 140" width="100%" height="100%">
      <rect width="160" height="140" fill="#450a0a" />
      <circle cx="80" cy="72" r="38" fill="#111827" />
      <path d="M80 72 L80 36 A36 36 0 0 1 112 86 Z" fill="#ef4444" />
      <path d="M80 72 L112 86 A36 36 0 0 1 52 96 Z" fill="#f8fafc" />
      <circle cx="80" cy="72" r="8" fill="#eab308" />
    </svg>
  );
}

const page: React.CSSProperties = { minHeight: "100dvh", padding: "18px 14px 120px", color: "#f8fafc" };
const title: React.CSSProperties = { fontSize: 22, fontWeight: 900, marginBottom: 14 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const card: React.CSSProperties = {
  position: "relative", width: "100%", border: 0, borderRadius: 22, overflow: "hidden",
  background: "#111827", padding: 0, textAlign: "left", cursor: "pointer",
};
const artBox: React.CSSProperties = { position: "absolute", inset: 0 };
const badgeRow: React.CSSProperties = { position: "absolute", top: 10, left: 10, right: 10, display: "flex", justifyContent: "space-between" };
const pill: React.CSSProperties = { color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 999, padding: "4px 8px" };
const onlinePill: React.CSSProperties = { color: "#bbf7d0", background: "rgba(0,0,0,0.35)", borderRadius: 999, padding: "4px 8px", fontSize: 10, fontWeight: 800 };
const cardName: React.CSSProperties = { position: "absolute", left: 12, bottom: 12, fontSize: 20, fontWeight: 900 };
const back: React.CSSProperties = { marginBottom: 12, height: 34, borderRadius: 10, border: "1px solid #334155", background: "#111827", color: "#e2e8f0" };
import type React from "react";
