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
      <div style={{ minHeight: "100dvh", padding: "12px 12px 110px", background: "#0a0612" }}>
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
        <div style={{ color: "#c4b5fd", lineHeight: 1.5, marginTop: 8 }}>
          Карточка в стиле TONYX готова. Игровая логика — следующим шагом.
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={header}>
        <div style={title}>Соло игры</div>
        <div style={sub}>Dogg Style · NFT gifts inside</div>
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
            name="Монетка"
            badge="Новое"
            badgeColor="#eab308"
            online={12}
            lottieSrc={LOTTIE.coin}
            emoji="🪙"
            stickers={["🚬"]}
            gradient="linear-gradient(145deg, #713f12 0%, #eab308 40%, #4c1d95 100%)"
            accent="rgba(234,179,8,0.45)"
            onClick={() => setTab("coin")}
          />
          <GameCard
            name="Рулетка"
            badge="Новое"
            badgeColor="#eab308"
            online={9}
            lottieSrc={LOTTIE.roulette}
            emoji="🎡"
            stickers={["👑"]}
            gradient="linear-gradient(145deg, #4c0519 0%, #a855f7 40%, #ca8a04 90%)"
            accent="rgba(192,38,211,0.4)"
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
