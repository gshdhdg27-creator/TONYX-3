import { useState } from "react";
import { useTelegram } from "@/lib/telegram";
import { useLang } from "@/lib/LanguageContext";
import MinesGame from "@/components/MinesGame";

type Tab = "pick" | "mines" | "coin" | "roulette";

export default function SoloPage() {
  const { telegramId } = useTelegram();
  const { lang } = useLang();
  const [tab, setTab] = useState<Tab>("pick");
  const [tonBalance, setTonBalance] = useState(0);

  if (tab === "mines") {
    return (
      <div style={{ minHeight: "100dvh", padding: "12px 12px 110px" }}>
        <button type="button" onClick={() => setTab("pick")}>Назад</button>
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
      <div style={{ minHeight: "100dvh", padding: "24px 16px 110px", color: "#f1f5f9" }}>
        <button type="button" onClick={() => setTab("pick")}>Назад</button>
        <div style={{ fontSize: 22, fontWeight: 900 }}>{tab === "coin" ? "Монетка" : "Рулетка"}</div>
        <div style={{ color: "#94a3b8" }}>Карточка есть. Сама игра будет следующим шагом.</div>
      </div>
    );
  }
  return (
    <div style={{ minHeight: "100dvh", padding: "24px 16px 110px", color: "#f1f5f9" }}>
      <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 16 }}>Solo</div>
      <button type="button" onClick={() => setTab("mines")} style={card}>Mines</button>
      <button type="button" onClick={() => setTab("coin")} style={card}>Монетка</button>
      <button type="button" onClick={() => setTab("roulette")} style={card}>Рулетка</button>
    </div>
  );
}

const card: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left", marginBottom: 12,
  padding: 16, borderRadius: 16, border: "1px solid rgba(220,38,38,0.45)",
  background: "rgba(127,29,29,0.35)", color: "#fecaca", fontWeight: 800,
};
import type React from "react";
