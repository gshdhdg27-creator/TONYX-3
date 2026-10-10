import { useState, type CSSProperties } from "react";
import { useTelegram } from "@/lib/telegram";
import { useLang } from "@/lib/LanguageContext";
import { MinesGame } from "@/pages/games";
import { GameCard } from "@/components/GameCard";

type Tab = "pick" | "mines" | "coin" | "roulette";

const LOTTIE = {
  mines: "https://assets5.lottiefiles.com/packages/lf20_k86wxpgr.json",
  coin: "https://assets3.lottiefiles.com/packages/lf20_ysrn2iwp.json",
  roulette: "https://assets4.lottiefiles.com/packages/lf20_3r3i3yqy.json",
};

export default function SoloPage() {
  const { telegramId } = useTelegram();
  const { lang } = useLang();
  const [tab, setTab] = useState<Tab>("pick");
  const [tonBalance, setTonBalance] = useState(0);

  if (tab === "mines") {
    return (
      <div style={{ minHeight: "100dvh", padding: "12px 12px 110px", background: "#070b14" }}>
        <button type="button" onClick={() => setTab("pick")} style={back}>
          ← Назад
        </button>
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
        <button type="button" onClick={() => setTab("pick")} style={back}>
          ← Назад
        </button>
        <div style={title}>{tab === "coin" ? "Монетка" : "Рулетка"}</div>
        <div style={{ color: "#94a3b8", lineHeight: 1.5 }}>
          Карточка и анимация готовы. Сама игра — следующим шагом.
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={title}>Соло игры</div>
      <div style={{ display: "grid", gap: 12 }}>
        <GameCard
          wide
          name="Mines"
          badge="Solo"
          badgeColor="#22c55e"
          online={31}
          lottieSrc={LOTTIE.mines}
          emoji="💣"
          gradient="linear-gradient(145deg, #065f46 0%, #10b981 40%, #022c22 100%)"
          onClick={() => setTab("mines")}
        />
        <div style={grid}>
          <GameCard
            name="Монетка"
            badge="Новое"
            badgeColor="#f59e0b"
            online={12}
            lottieSrc={LOTTIE.coin}
            emoji="🪙"
            gradient="linear-gradient(145deg, #b45309 0%, #fbbf24 45%, #422006 100%)"
            onClick={() => setTab("coin")}
          />
          <GameCard
            name="Рулетка"
            badge="Новое"
            badgeColor="#f59e0b"
            online={9}
            lottieSrc={LOTTIE.roulette}
            emoji="🎡"
            gradient="linear-gradient(145deg, #9f1239 0%, #fb7185 40%, #1f2937 100%)"
            onClick={() => setTab("roulette")}
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
  background: "radial-gradient(circle at 80% 0%, #14532d 0%, #070b14 50%)",
};
const title: CSSProperties = { fontSize: 24, fontWeight: 900, marginBottom: 14 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const back: CSSProperties = {
  marginBottom: 12,
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
