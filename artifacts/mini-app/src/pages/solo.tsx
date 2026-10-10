import { useState, type CSSProperties } from "react";
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
        <Wide name="Mines" badge="Solo" online="31" image="/games/mines.jpg" onClick={() => setTab("mines")} />
        <div style={grid}>
          <Card name="Монетка" badge="Новое" image="/games/coin.jpg" onClick={() => setTab("coin")} />
          <Card name="Рулетка" badge="Новое" image="/games/roulette.jpg" onClick={() => setTab("roulette")} />
        </div>
      </div>
    </div>
  );
}

function Wide({ name, badge, online, image, onClick }: {
  name: string; badge: string; online: string; image: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={{ ...card, height: 168 }}>
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
function Card({ name, badge, image, onClick }: {
  name: string; badge: string; image: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={{ ...card, height: 158 }}>
      <img src={image} alt="" style={img} />
      <div style={shade} />
      <span style={{ ...pill, position: "absolute", top: 10, left: 10 }}>{badge}</span>
      <div style={nameStyle}>{name}</div>
    </button>
  );
}

const page: CSSProperties = { minHeight: "100dvh", padding: "18px 14px 120px", color: "#fff", background: "#070b14" };
const title: CSSProperties = { fontSize: 24, fontWeight: 900, marginBottom: 14 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const card: CSSProperties = {
  position: "relative", width: "100%", border: 0, borderRadius: 24, overflow: "hidden",
  padding: 0, cursor: "pointer", background: "#111827",
};
const img: CSSProperties = { width: "100%", height: "100%", objectFit: "cover", display: "block" };
const shade: CSSProperties = { position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.55))" };
const topRow: CSSProperties = { position: "absolute", top: 10, left: 10, right: 10, display: "flex", justifyContent: "space-between" };
const pill: CSSProperties = { background: "#f97316", color: "#fff", fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "4px 8px" };
const onlinePill: CSSProperties = { color: "#bbf7d0", background: "rgba(0,0,0,0.4)", borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 800 };
const nameStyle: CSSProperties = { position: "absolute", left: 12, bottom: 12, fontSize: 22, fontWeight: 900, textShadow: "0 2px 8px rgba(0,0,0,0.6)" };
const back: CSSProperties = { marginBottom: 12, height: 34, borderRadius: 10, border: "1px solid #334155", background: "#111827", color: "#e2e8f0" };
