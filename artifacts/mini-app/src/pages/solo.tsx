import { useState, useEffect, type CSSProperties, type ReactNode } from "react";
import { useTelegram } from "@/lib/telegram";
import { useLang } from "@/lib/LanguageContext";
import MinesGame from "@/components/MinesGame";
import CoinFlipGame from "@/components/CoinFlipGame";
import CrashGame from "@/components/CrashGame";
import PlinkoGame from "@/components/PlinkoGame";
import UpgradeGame from "@/components/UpgradeGame";
import PickaxeGame from "@/components/PickaxeGame";
import QuickGames from "@/components/QuickGames";
import { useGetUserProfile, getGetUserProfileQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

type Tab = "pick" | "mines" | "coin" | "crash" | "plinko" | "upgrade" | "pickaxe" | "dice" | "roulette";
type SoloCardData = {
  id: Exclude<Tab, "pick">;
  title: string;
  subtitle: string;
  icon: string;
  tag: string;
  tone: string;
  wide?: boolean;
};

const cards: SoloCardData[] = [
  { id: "pickaxe", title: "Кирка", subtitle: "Спускайся за редкими рудами", icon: "⛏️", tag: "MINING", tone: "#d6a84b", wide: true },
  { id: "mines", title: "Mines", subtitle: "Открывай клетки и ищи кристаллы", icon: "💎", tag: "HIGH RISK", tone: "#38d6a5" },
  { id: "crash", title: "Crash", subtitle: "Забери выигрыш до падения", icon: "🚀", tag: "MULTIPLIER", tone: "#ff9258" },
  { id: "plinko", title: "Plinko", subtitle: "Отпусти шар и лови множитель", icon: "🔮", tag: "ARCADE", tone: "#55b9ff" },
  { id: "coin", title: "Coinflip", subtitle: "Орёл или решка — один бросок", icon: "🪙", tag: "50 / 50", tone: "#f0c45c" },
  { id: "upgrade", title: "Upgrade", subtitle: "Испытай шанс улучшить NFT", icon: "💠", tag: "NFT UPGRADE", tone: "#b68cff" },
  { id: "dice", title: "Dice", subtitle: "Выбери порог и брось кубик", icon: "🎲", tag: "CLASSIC", tone: "#e8c16f" },
  { id: "roulette", title: "Roulette", subtitle: "Красное, чёрное или зеро", icon: "🎯", tag: "EUROPEAN", tone: "#ef7777" },
];

function SoloCard({ card, onClick, index }: { card: SoloCardData; onClick: () => void; index: number }) {
  return (
    <button type="button" onClick={onClick} style={{
      position: "relative", minHeight: card.wide ? 150 : 164, overflow: "hidden",
      display: "flex", flexDirection: card.wide ? "row" : "column", justifyContent: "space-between",
      alignItems: card.wide ? "center" : "stretch", textAlign: "left", padding: card.wide ? "18px 22px" : "15px",
      borderRadius: 20, border: `1px solid ${card.tone}55`,
      background: `radial-gradient(ellipse at 85% 15%,${card.tone}30 0%,transparent 55%),linear-gradient(145deg,#211b13 0%,#111319 65%,#0c0e13 100%)`,
      color: "#fff5e3", cursor: "pointer", fontFamily: "inherit",
      boxShadow: `0 8px 24px #0007,inset 0 1px 0 #ffffff10,0 0 20px ${card.tone}10`,
      animation: `soloCardIn .42s ease ${index * 45}ms both`,
      gridColumn: card.wide ? "1 / -1" : undefined,
    }}>
      <div style={{ position: "absolute", right: -18, bottom: -34, fontSize: card.wide ? 116 : 90, opacity: .13, transform: "rotate(-13deg)", filter: "drop-shadow(0 0 18px currentColor)", pointerEvents: "none" }}>{card.icon}</div>
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 6, height: 6, borderRadius: 10, background: card.tone, boxShadow: `0 0 10px ${card.tone}` }} />
          <span style={{ color: card.tone, fontSize: 9, fontWeight: 900, letterSpacing: ".18em" }}>{card.tag}</span>
          <span style={{ color: "#817866", fontSize: 8, fontWeight: 900, marginLeft: "auto" }}>SOLO</span>
        </div>
        <div style={{ marginTop: card.wide ? 15 : 13, fontSize: card.wide ? 23 : 19, fontWeight: 950, letterSpacing: "-.035em" }}>{card.title}</div>
        <div style={{ color: "#a89d8b", fontSize: 10, lineHeight: 1.45, marginTop: 5, maxWidth: card.wide ? 240 : 155 }}>{card.subtitle}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: "auto", paddingTop: 13, color: card.tone, fontSize: 9, fontWeight: 900, letterSpacing: ".12em" }}>
          ИГРАТЬ <span style={{ fontSize: 14 }}>↗</span>
        </div>
      </div>
      <div style={{
        position: "relative", zIndex: 1, flexShrink: 0, width: card.wide ? 100 : 66, height: card.wide ? 100 : 66,
        marginLeft: card.wide ? 18 : 0, marginTop: card.wide ? 0 : 14, alignSelf: card.wide ? "center" : "flex-end",
        borderRadius: card.wide ? 28 : 20, display: "grid", placeItems: "center",
        fontSize: card.wide ? 57 : 39, background: `linear-gradient(145deg,${card.tone}28,#111319 78%)`,
        border: `1px solid ${card.tone}66`, boxShadow: `inset 0 1px 12px ${card.tone}20,0 0 25px ${card.tone}18`,
      }}>{card.icon}</div>
    </button>
  );
}

function SoloShell({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  return (
    <div style={{ minHeight: "100dvh", padding: "12px 12px 110px", color: "#fff4df", background: "radial-gradient(ellipse at 50% -10%,#3b2a14 0%,#17130e 32%,#090b10 75%)" }}>
      <button type="button" onClick={onBack} style={back}>← НАЗАД К SOLO</button>
      {children}
    </div>
  );
}

export default function SoloPage() {
  const { telegramId } = useTelegram();
  const { lang } = useLang();
  const [tab, setTab] = useState<Tab>("pick");
  const queryClient = useQueryClient();

  const { data: profile, refetch } = useGetUserProfile(telegramId ?? "", {
    query: { enabled: !!telegramId, refetchOnWindowFocus: true },
  } as Parameters<typeof useGetUserProfile>[1]);

  // Solo games settle against demoCredits, never the TON wallet.
  const demoBalance = profile ? Number((profile as { demoCredits?: string | number }).demoCredits ?? 0) : 0;

  const refreshBalance = async () => {
    if (!telegramId) return;
    await refetch();
    void queryClient.invalidateQueries({ queryKey: getGetUserProfileQueryKey(telegramId) });
  };

  useEffect(() => { if (telegramId) void refetch(); }, [telegramId]);

  const common = { telegramId: telegramId ?? "", balance: demoBalance, onBalanceChange: refreshBalance };

  if (tab === "mines") return <SoloShell onBack={() => setTab("pick")}><MinesGame {...common} lang={lang} /></SoloShell>;
  if (tab === "coin") return <SoloShell onBack={() => setTab("pick")}><CoinFlipGame {...common} /></SoloShell>;
  if (tab === "crash") return <SoloShell onBack={() => setTab("pick")}><CrashGame {...common} /></SoloShell>;
  if (tab === "plinko") return <SoloShell onBack={() => setTab("pick")}><PlinkoGame {...common} /></SoloShell>;
  if (tab === "upgrade") return <SoloShell onBack={() => setTab("pick")}><UpgradeGame {...common} /></SoloShell>;
  if (tab === "pickaxe") return <SoloShell onBack={() => setTab("pick")}><PickaxeGame {...common} /></SoloShell>;
  if (tab === "dice" || tab === "roulette") return <SoloShell onBack={() => setTab("pick")}><QuickGames game={tab} {...common} /></SoloShell>;

  return (
    <div style={page}>
      <style>{`
        @keyframes soloCardIn { from{opacity:0;transform:translateY(12px) scale(.985)} to{opacity:1;transform:translateY(0) scale(1)} }
        .solo-card-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:11px; }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <div style={{ color: "#d9b66e", fontSize: 9, fontWeight: 900, letterSpacing: ".23em", marginBottom: 7 }}>✦ TONYX CASINO</div>
          <div style={{ fontSize: 25, fontWeight: 950, letterSpacing: "-.045em", color: "#fff4df" }}>SOLO GAMES</div>
          <div style={{ color: "#9e927f", fontSize: 11, marginTop: 5 }}>Выбирай игру и испытай удачу</div>
        </div>
        <div style={{ textAlign: "right", padding: "9px 11px", borderRadius: 12, background: "linear-gradient(145deg,#2b2113,#15130f)", border: "1px solid #7c6034" }}>
          <div style={{ color: "#a18d68", fontSize: 8, fontWeight: 900, letterSpacing: ".12em" }}>DEMO BALANCE</div>
          <div style={{ color: "#f1ce86", fontSize: 15, fontWeight: 900 }}>{demoBalance.toFixed(2)}</div>
        </div>
      </div>
      <div className="solo-card-grid">
        {cards.map((card, index) => <SoloCard key={card.id} card={card} index={index} onClick={() => setTab(card.id)} />)}
      </div>
      <div style={{ color: "#6f675a", fontSize: 9, textAlign: "center", marginTop: 16, letterSpacing: ".06em" }}>
        ИГРЫ РАБОТАЮТ НА ДЕМО-КРЕДИТАХ · НЕ TON
      </div>
    </div>
  );
}

const page: CSSProperties = {
  minHeight: "100dvh", padding: "18px 14px 120px",
  color: "#fff", background: "radial-gradient(ellipse at 50% -10%,#3b2a14 0%,#17130e 32%,#090b10 75%)",
  fontFamily: "Inter, system-ui, sans-serif",
};
const back: CSSProperties = {
  marginBottom: 13, height: 38, padding: "0 14px", borderRadius: 11,
  border: "1px solid rgba(205,164,91,.4)",
  background: "linear-gradient(145deg,#2b2113,#15130f)", color: "#e8c982",
  fontSize: 10, fontWeight: 900, letterSpacing: ".1em", cursor: "pointer", fontFamily: "inherit",
};
