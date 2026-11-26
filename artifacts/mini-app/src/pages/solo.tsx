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
  { id: "pickaxe", title: "Pickaxe Drop", subtitle: "Пробивайся вниз и собирай редкие ресурсы", icon: "⛏️", tag: "MINING", tone: "#d6a84b", wide: true },
  { id: "mines", title: "Mines", subtitle: "Открывай клетки и ищи кристаллы", icon: "💎", tag: "HIGH RISK", tone: "#38d6a5" },
  { id: "crash", title: "Crash", subtitle: "Забери выигрыш до падения", icon: "🚀", tag: "MULTIPLIER", tone: "#ff9258" },
  { id: "plinko", title: "Plinko", subtitle: "Отпусти шар и лови множитель", icon: "🔮", tag: "ARCADE", tone: "#55b9ff" },
  { id: "coin", title: "Coinflip", subtitle: "Орёл или решка — один бросок", icon: "🪙", tag: "50 / 50", tone: "#f0c45c" },
  { id: "upgrade", title: "Upgrade", subtitle: "Испытай шанс улучшить NFT", icon: "💠", tag: "NFT UPGRADE", tone: "#b68cff" },
  { id: "dice", title: "Dice", subtitle: "Выбери порог и брось кубик", icon: "🎲", tag: "CLASSIC", tone: "#e8c16f" },
  { id: "roulette", title: "Roulette", subtitle: "Красное, чёрное или зеро", icon: "🎯", tag: "EUROPEAN", tone: "#ef7777" },
];


const GAME_SKIN_CSS = `
.tx-game-shell{width:100%;max-width:1120px;margin:0 auto;color:#e8edf3;font-family:Inter,system-ui,sans-serif}
.tx-game-shell button{transition:filter .16s ease,transform .16s ease,border-color .16s ease,box-shadow .16s ease}
.tx-game-shell button:not(:disabled):active{transform:translateY(1px) scale(.985)}
.tx-game-shell button:disabled{filter:saturate(.55);cursor:not-allowed}
.tx-game-shell input{accent-color:#18c987}
.tx-mines,.tx-crash,.tx-plinko,.tx-coinflip,.tx-quickgames{max-width:100%!important;margin:0 auto!important;color:#e8edf3!important}
.tx-mines{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:12px}
.tx-mines>style{display:none}
.tx-mines>div:nth-of-type(1){grid-column:1/-1}
.tx-mines>div:nth-of-type(2){grid-column:1/-1;background:linear-gradient(135deg,#1b2935,#101820)!important;border:1px solid #2c3b49!important;border-radius:12px!important;padding:14px!important}
.tx-mines>div:nth-of-type(3){grid-column:1;grid-row:3/span 2;align-self:start}
.tx-mines>div:nth-of-type(4){grid-column:1;grid-row:5;display:flex;flex-wrap:wrap;gap:6px}
.tx-mines>div:nth-of-type(5){grid-column:2;grid-row:3/span 3;align-self:start;background:#151e28!important;border:1px solid #2a3948!important;border-radius:12px!important}
.tx-mines .mn-cell{background:linear-gradient(145deg,#293746,#1b2631)!important;border:0!important;border-bottom:4px solid #101820!important;border-radius:8px!important;box-shadow:0 3px 0 #0a1118,inset 0 1px 0 #ffffff12!important}
.tx-mines .mn-cell.mn-hidden{background:linear-gradient(145deg,#344556,#202c38)!important}
.tx-mines .mn-cell.mn-safe{background:linear-gradient(145deg,#155d49,#0f3e34)!important}
.tx-mines .mn-cell.mn-mine{background:linear-gradient(145deg,#71323a,#3e2028)!important}
.tx-mines .mn-cashout{background:linear-gradient(180deg,#23d58e,#12a96c)!important;border-radius:8px!important;box-shadow:0 3px 0 #08734b!important}
.tx-crash{display:grid!important;grid-template-columns:minmax(0,1fr) 340px;gap:12px}
.tx-crash>div:nth-child(1){grid-column:1;grid-row:1/span 2;background:linear-gradient(180deg,#151e27,#10171f)!important;border:1px solid #2b3947!important;border-radius:12px!important}
.tx-crash>div:nth-child(1) canvas{background:radial-gradient(ellipse at 50% 100%,#173e39,#0b1118 70%)!important;border:1px solid #263744}
.tx-crash>div:nth-child(2){grid-column:1;grid-row:3}
.tx-crash>div:nth-child(3){grid-column:2;grid-row:1/span 3;background:#151e28!important;border:1px solid #2b3947!important;border-radius:12px!important}
.tx-plinko{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:12px}
.tx-plinko>div:first-child{grid-column:1;grid-row:1/span 5;height:500px!important;border-radius:12px!important;background:radial-gradient(ellipse at 50% 0%,#1d3b3b,#101820 70%)!important;border:1px solid #2c414b!important}
.tx-plinko>div:nth-child(2){grid-column:1;grid-row:6}
.tx-plinko>div:nth-child(3),.tx-plinko>div:nth-child(4),.tx-plinko>div:nth-child(5),.tx-plinko>div:nth-child(6){grid-column:2;background:#151e28!important;border:1px solid #2b3947!important;border-radius:12px!important;padding:13px!important}
.tx-coinflip{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:12px}
.tx-coinflip>.cf-ambient{position:absolute;inset:0;pointer-events:none}
.tx-coinflip .cf-arena{grid-column:1;grid-row:2/span 3;min-height:390px;border-radius:14px;background:radial-gradient(ellipse at 50% 55%,#253747,#111922 70%);border:1px solid #2b3b4a}
.tx-coinflip .cf-result{grid-column:1/-1}
.tx-quickgames{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:12px}
.tx-quickgames>div:first-child{grid-column:1/-1}
.tx-quickgames>div:nth-child(2){grid-column:1;grid-row:2/span 3;min-height:360px;border-radius:12px!important;background:radial-gradient(ellipse at 50% 40%,#263d45,#111920 72%)!important;border:1px solid #30404b!important}
.tx-quickgames>div:nth-child(3),.tx-quickgames>div:nth-child(4){grid-column:2;background:#151e28!important;border:1px solid #2b3947!important;border-radius:12px!important}
.tx-quickgames>div:nth-child(5),.tx-quickgames>div:nth-child(6),.tx-quickgames>div:nth-child(7){grid-column:1/-1}
.tx-pickaxe{max-width:620px!important;margin:0 auto!important;border-radius:14px;padding:10px!important;background:linear-gradient(180deg,#17242d,#0c1218)!important;border:1px solid #2b3b48;box-shadow:0 14px 40px #0006}
@media(max-width:720px){
 .tx-mines,.tx-crash,.tx-plinko,.tx-coinflip,.tx-quickgames{display:flex!important;flex-direction:column!important;gap:10px!important}
 .tx-mines>div,.tx-crash>div,.tx-plinko>div,.tx-coinflip>div,.tx-quickgames>div{width:100%;box-sizing:border-box}
 .tx-plinko>div:first-child{height:420px!important}
 .tx-coinflip .cf-arena{min-height:300px}
 .tx-pickaxe{padding:5px!important}
}
`;

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
    <div style={{ minHeight: "100dvh", padding: "12px 12px 110px", color: "#e8edf3", background: "radial-gradient(ellipse at 50% -10%,#1d2934 0%,#111820 34%,#080c11 78%)" }}>
      <style>{GAME_SKIN_CSS}</style>
      <button type="button" onClick={onBack} style={back}>← НАЗАД К SOLO</button>
      <div className="tx-game-shell">{children}</div>
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
