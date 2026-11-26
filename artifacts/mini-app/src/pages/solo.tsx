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
  { id: "pickaxe", title: "Pickaxe Drop", subtitle: "Спускайся за редкими рудами", icon: "⛏️", tag: "MINING", tone: "#d6a84b", wide: true },
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
      borderRadius: 12, border: "1px solid #293746",
      background: "linear-gradient(180deg,#1b2733 0%,#141e28 100%)",
      color: "#f2f6f9", cursor: "pointer", fontFamily: "inherit",
      boxShadow: "0 5px 16px #0005,inset 0 1px 0 #ffffff08",
      animation: `soloCardIn .42s ease ${index * 45}ms both`,
      gridColumn: card.wide ? "1 / -1" : undefined,
    }}>
      <div style={{ position: "absolute", right: -18, bottom: -34, fontSize: card.wide ? 116 : 90, opacity: .13, transform: "rotate(-13deg)", filter: "drop-shadow(0 0 18px currentColor)", pointerEvents: "none" }}>{card.icon}</div>
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 6, height: 6, borderRadius: 10, background: "#35b8d2" }} />
          <span style={{ color: "#7f9aaa", fontSize: 9, fontWeight: 900, letterSpacing: ".14em" }}>{card.tag}</span>
          <span style={{ color: "#617382", fontSize: 8, fontWeight: 900, marginLeft: "auto" }}>TONYX</span>
        </div>
        <div style={{ marginTop: card.wide ? 15 : 13, fontSize: card.wide ? 23 : 19, fontWeight: 950, letterSpacing: "-.035em" }}>{card.title}</div>
        <div style={{ color: "#8fa0ad", fontSize: 10, lineHeight: 1.45, marginTop: 5, maxWidth: card.wide ? 240 : 155 }}>{card.subtitle}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: "auto", paddingTop: 13, color: card.tone, fontSize: 9, fontWeight: 900, letterSpacing: ".12em" }}>
          ИГРАТЬ <span style={{ fontSize: 14 }}>↗</span>
        </div>
      </div>
      <div style={{
        position: "relative", zIndex: 1, flexShrink: 0, width: card.wide ? 100 : 66, height: card.wide ? 100 : 66,
        marginLeft: card.wide ? 18 : 0, marginTop: card.wide ? 0 : 14, alignSelf: card.wide ? "center" : "flex-end",
        borderRadius: 12, display: "grid", placeItems: "center",
        fontSize: card.wide ? 57 : 39, background: "linear-gradient(145deg,#263d4b,#172530)",
        border: "1px solid #355263", boxShadow: "inset 0 1px 12px #5ccbe51a",
      }}>{card.icon}</div>
    </button>
  );
}

function SoloShell({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  return (
    <div className="tonyx-game-shell" style={{ minHeight: "100dvh", padding: "14px 14px 110px", color: "#edf4f8", background: "#0d151d", fontFamily: "Inter,system-ui,sans-serif" }}>
      <style>{`
        .tonyx-game-shell{background:radial-gradient(ellipse at 50% -25%,#1b3444 0%,#101b25 38%,#0b1219 78%)!important}
        .tonyx-game-top{max-width:1180px;margin:0 auto 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 0 12px;border-bottom:1px solid #263746}
        .tonyx-game-back{height:36px;padding:0 13px;border:1px solid #314858;border-radius:8px;background:#1a2a36;color:#b8d3df;font:800 10px Inter,system-ui;letter-spacing:.08em}
        .tonyx-game-brand{color:#45bad2;font-size:10px;font-weight:900;letter-spacing:.16em}
        .tonyx-game-note{color:#718696;font-size:9px;font-weight:700;letter-spacing:.08em}
        .tonyx-game-shell .mn-game,.tonyx-game-shell .crash-game,.tonyx-game-shell .qg-game,.tonyx-game-shell .plinko-game,.tonyx-game-shell .cf-game,.tonyx-game-shell .pickaxe-drop{color:#edf4f8!important}
        /* Shared 1win-inspired game skin: graphite surfaces, restrained cyan accents, compact controls */
        .tonyx-game-shell .mn-game-header,.tonyx-game-shell .crash-game .crash-header,.tonyx-game-shell .qg-header,.tonyx-game-shell .cf-header{border-color:#293c49!important}
        .tonyx-game-shell .mn-game-controls,.tonyx-game-shell .crash-controls,.tonyx-game-shell .qg-panel,.tonyx-game-shell .plinko-controls,.tonyx-game-shell .cf-controls,.tonyx-game-shell .pickaxe-controls{background:#18242e!important;border:1px solid #2c414f!important;border-radius:10px!important;box-shadow:0 8px 22px #0005!important}
        .tonyx-game-shell .mn-game-board,.tonyx-game-shell .crash-stage,.tonyx-game-shell .crash-chart,.tonyx-game-shell .qg-stage,.tonyx-game-shell .plinko-board,.tonyx-game-shell .cf-game-stage{background:#111d26!important;border:1px solid #2a414f!important;border-radius:10px!important;box-shadow:inset 0 1px #ffffff08!important}
        .tonyx-game-shell .mn-cell{border-radius:7px!important;background:linear-gradient(180deg,#31556a,#244254)!important;box-shadow:0 3px 0 #152d3a,inset 0 1px #ffffff18!important}
        .tonyx-game-shell .mn-safe{background:linear-gradient(180deg,#167d69,#105b4f)!important}
        .tonyx-game-shell .mn-mine{background:linear-gradient(180deg,#9d3d45,#692b34)!important}
        .tonyx-game-shell .mn-cashout,.tonyx-game-shell .crash-controls button[class*="bet"],.tonyx-game-shell .cf-controls button[class*="play"]{background:linear-gradient(180deg,#22b98a,#159b72)!important;color:#061b16!important;border:0!important;border-radius:7px!important;box-shadow:0 3px 0 #0d6b50!important}
        .tonyx-game-shell input,.tonyx-game-shell select{background:#0e1820!important;border:1px solid #344b59!important;border-radius:7px!important;color:#edf6fa!important}
        .tonyx-game-shell .mn-ladder-active{background:#1b4a57!important;border-color:#2a8194!important;color:#9be8f5!important;box-shadow:none!important}
        .tonyx-game-shell .cf-game-stage{min-height:390px!important}
        .tonyx-game-shell .cf-ring{border-color:#2c6679!important}
        .tonyx-game-shell .pickaxe-controls{padding:14px!important}
        .tonyx-game-shell .pickaxe-drop{background:#101b24!important;border:1px solid #293c49!important;border-radius:12px!important;overflow:hidden}
        .tonyx-game-shell .qg-history,.tonyx-game-shell .crash-history{background:#121e27!important;border-color:#2a3e4b!important}
        @media(max-width:700px){
          .tonyx-game-shell .mn-game,.tonyx-game-shell .crash-game,.tonyx-game-shell .qg-game,.tonyx-game-shell .plinko-game,.tonyx-game-shell .cf-game{grid-template-columns:minmax(0,1fr)!important}
          .tonyx-game-shell .mn-game-controls,.tonyx-game-shell .crash-controls,.tonyx-game-shell .qg-panel,.tonyx-game-shell .plinko-controls,.tonyx-game-shell .cf-controls{grid-column:1!important;grid-row:auto!important}
          .tonyx-game-shell .mn-game-board,.tonyx-game-shell .crash-stage,.tonyx-game-shell .qg-stage,.tonyx-game-shell .plinko-board,.tonyx-game-shell .cf-game-stage{grid-column:1!important;grid-row:auto!important}
        }
        @media(max-width:700px){.tonyx-game-shell{padding:10px 9px 100px!important}.tonyx-game-top{margin-bottom:10px}}
      `}</style>
      <div className="tonyx-game-top">
        <button type="button" onClick={onBack} className="tonyx-game-back">← ВСЕ ИГРЫ</button>
        <div className="tonyx-game-brand">TONYX <span style={{color:"#718696"}}>· ORIGINALS</span></div>
        <div className="tonyx-game-note">DEMO PLAY</div>
      </div>
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
        .solo-card-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; max-width:1180px; margin:0 auto; }
        @media(max-width:760px){.solo-card-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}}
        @media(max-width:420px){.solo-card-grid{grid-template-columns:1fr}.solo-card-grid>button{min-height:122px!important}}
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <div style={{ color: "#39b9d2", fontSize: 9, fontWeight: 900, letterSpacing: ".23em", marginBottom: 7 }}>TONYX · ORIGINALS</div>
          <div style={{ fontSize: 25, fontWeight: 950, letterSpacing: "-.045em", color: "#f0f5f8" }}>SOLO GAMES</div>
          <div style={{ color: "#8fa2b0", fontSize: 11, marginTop: 5 }}>Выбери игру и сделай ставку</div>
        </div>
        <div style={{ textAlign: "right", padding: "9px 11px", borderRadius: 12, background: "linear-gradient(145deg,#1d303d,#14222c)", border: "1px solid #355263" }}>
          <div style={{ color: "#8fa7b5", fontSize: 8, fontWeight: 900, letterSpacing: ".12em" }}>DEMO BALANCE</div>
          <div style={{ color: "#d9f5fb", fontSize: 15, fontWeight: 900 }}>{demoBalance.toFixed(2)}</div>
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
  color: "#edf4f8", background: "radial-gradient(ellipse at 50% -15%,#1a3444 0%,#101b25 38%,#0b1219 78%)",
  fontFamily: "Inter, system-ui, sans-serif",
};
const back: CSSProperties = {
  marginBottom: 13, height: 38, padding: "0 14px", borderRadius: 11,
  border: "1px solid #314858",
  background: "linear-gradient(145deg,#1d303d,#14222c)", color: "#b8d3df",
  fontSize: 10, fontWeight: 900, letterSpacing: ".1em", cursor: "pointer", fontFamily: "inherit",
};
