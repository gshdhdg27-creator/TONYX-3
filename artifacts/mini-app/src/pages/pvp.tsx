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
        <button type="button" onClick={() => setTab("pick")} style={{ margin: 12 }}>Назад</button>
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
    <div style={{ minHeight: "100dvh", padding: "24px 16px 110px", color: "#f1f5f9" }}>
      <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 16 }}>PvP</div>
      <button type="button" onClick={() => setTab("arena")} style={card}>PvP Арена</button>
      <button type="button" onClick={() => setTab("spin")} style={card}>PvP Барабан</button>
    </div>
  );
}

const card: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left", marginBottom: 12,
  padding: 16, borderRadius: 16, border: "1px solid rgba(220,38,38,0.45)",
  background: "rgba(127,29,29,0.35)", color: "#fecaca", fontWeight: 800,
};
import type React from "react";
