import { type ReactNode, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { haptic } from "@/lib/telegram";

export type MenuMode = 1 | 2 | 3;
type Section =
  | "market" | "nft" | "tasks"
  | "cases" | "pvp" | "solo"
  | "bosses" | "cards" | "collection";

const MODE_KEY = "tonyx-menu-mode";
const MODE_COLOR: Record<MenuMode, string> = {
  1: "#2563eb",
  2: "#dc2626",
  3: "#eab308",
};
const FIRST: Record<MenuMode, Section> = {
  1: "market",
  2: "cases",
  3: "bosses",
};
const PATH: Record<Section, string> = {
  market: "/market",
  nft: "/nft-market",
  tasks: "/tasks",
  cases: "/cases",
  pvp: "/pvp",
  solo: "/solo",
  bosses: "/",
  cards: "/",
  collection: "/",
};

interface TabDef {
  section: Section;
  label: string;
  icon: (active: boolean) => ReactNode;
}

const MODE_TABS: Record<MenuMode, TabDef[]> = {
  1: [
    { section: "market", label: "Market", icon: MarketIcon },
    { section: "nft", label: "NFT", icon: NftIcon },
    { section: "tasks", label: "Задания", icon: TasksIcon },
  ],
  2: [
    { section: "cases", label: "Кейсы", icon: CasesIcon },
    { section: "pvp", label: "PvP", icon: PvpIcon },
    { section: "solo", label: "Solo", icon: SoloIcon },
  ],
  3: [
    { section: "bosses", label: "Боссы", icon: BossIcon },
    { section: "cards", label: "Карточки", icon: CardsIcon },
    { section: "collection", label: "Коллекция", icon: CollectionIcon },
  ],
};

function readMenuMode(): MenuMode {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    if (raw === "2") return 2;
    if (raw === "3") return 3;
  } catch { /* ignore */ }
  return 1;
}
function writeMenuMode(mode: MenuMode) {
  try { localStorage.setItem(MODE_KEY, String(mode)); } catch { /* ignore */ }
}
function nextMode(mode: MenuMode): MenuMode {
  return mode === 1 ? 2 : mode === 2 ? 3 : 1;
}
function rotationFor(mode: MenuMode) {
  return -60 - (mode - 1) * 120;
}
function openSection(section: Section) {
  sessionStorage.setItem("tonyx-open", section);
  window.dispatchEvent(new Event("tonyx-open"));
}

export default function BottomNav() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<MenuMode>(readMenuMode);
  const [rotation, setRotation] = useState(() => rotationFor(readMenuMode()));
  const [busy, setBusy] = useState(false);
  const [flood, setFlood] = useState<{ color: string; phase: "in" | "out" } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [origin, setOrigin] = useState({ x: 36, y: 40 });
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  function go(section: Section) {
    openSection(section);
    setLocation(PATH[section]);
  }

  function switchMode() {
    if (busy) return;
    const upcoming = nextMode(mode);
    haptic("medium");
    setBusy(true);
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

    setRotation((value) => value - 120);

    timer.current = window.setTimeout(() => {
      setFlood({ color: MODE_COLOR[upcoming], phase: "in" });
      timer.current = window.setTimeout(() => {
        setMode(upcoming);
        writeMenuMode(upcoming);
        go(FIRST[upcoming]);
        setFlood({ color: MODE_COLOR[upcoming], phase: "out" });
        timer.current = window.setTimeout(() => {
          setFlood(null);
          setBusy(false);
        }, 560);
      }, 560);
    }, 820);
  }

  return (
    <>
      <style>{`
        @keyframes tonyx-flood-in {
          from { transform: translate(-50%, -50%) scale(0.12); opacity: 0.9; }
          to { transform: translate(-50%, -50%) scale(28); opacity: 1; }
        }
        @keyframes tonyx-flood-out {
          from { transform: translate(-50%, -50%) scale(28); opacity: 1; }
          to { transform: translate(-50%, -50%) scale(0.12); opacity: 0; }
        }
      `}</style>
      {flood && (
        <div aria-hidden style={{
          position: "fixed", left: origin.x, top: origin.y, width: 80, height: 80,
          borderRadius: "50%", background: flood.color, zIndex: 250, pointerEvents: "none",
          animation: flood.phase === "in"
            ? "tonyx-flood-in 0.55s ease-out forwards"
            : "tonyx-flood-out 0.55s ease-in forwards",
        }} />
      )}
      <nav style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 480, background: "rgba(10, 11, 20, 0.92)",
        borderTop: "1px solid rgba(30, 58, 143, 0.35)", display: "flex",
        backdropFilter: "blur(20px)", zIndex: 100,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        <div style={{ width: 72, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <button ref={buttonRef} type="button" onClick={switchMode} aria-label="Меню" style={{
            width: 46, height: 46, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.25)",
            padding: 0, position: "relative", background: "transparent", cursor: busy ? "default" : "pointer",
          }}>
            <span style={{
              position: "absolute", left: "50%", top: -8, transform: "translateX(-50%)",
              width: 0, height: 0, zIndex: 3,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "9px solid #f8fafc",
            }} />
            <span style={{
              position: "absolute", inset: 3, borderRadius: "50%",
              background: "conic-gradient(#2563eb 0 120deg, #dc2626 120deg 240deg, #eab308 240deg 360deg)",
              transform: `rotate(${rotation}deg)`,
              transition: "transform 0.8s linear",
            }} />
            <span style={{
              position: "absolute", inset: 15, borderRadius: "50%", background: "#0b1020", zIndex: 1,
            }} />
          </button>
        </div>
        {MODE_TABS[mode].map(({ section, label, icon }) => (
          <button key={section} type="button" onClick={() => { haptic("light"); go(section); }} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", padding: "8px 2px 6px", background: "transparent",
            border: 0, cursor: "pointer",
          }}>
            {icon(false)}
            <span style={{ marginTop: 3, fontSize: 10, fontWeight: 700, color: "#94a3b8" }}>{label}</span>
          </button>
        ))}
        <button type="button" onClick={() => { haptic("light"); setLocation("/profile"); }} style={{
          width: 68, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", background: "transparent", border: 0,
          borderLeft: "1px solid rgba(30,58,143,0.35)", cursor: "pointer",
        }}>
          <ProfileIcon active={false} />
          <span style={{ marginTop: 3, fontSize: 10, fontWeight: 700, color: "#94a3b8" }}>Профиль</span>
        </button>
      </nav>
    </>
  );
}

function stroke() { return "#475569"; }
function MarketIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke()} strokeWidth="2"><path d="M3 3h2l2.4 12.2a2 2 0 002 1.6h8.7a2 2 0 002-1.6L22 7H6" /><circle cx="9" cy="21" r="1.5" /><circle cx="18" cy="21" r="1.5" /></svg>;
}
function NftIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke()} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 16l5-5 4 4 3-3 6 6" /></svg>;
}
function TasksIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke()} strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>;
}
function CasesIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke()} strokeWidth="2"><path d="M3 8h18v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /><path d="M3 8l2-4h14l2 4" /></svg>;
}
function PvpIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke()} strokeWidth="2"><path d="M14.5 17.5L3 6V3h3l11.5 11.5" /><path d="M16 16l4 4" /></svg>;
}
function SoloIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke()} strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 3v18" /></svg>;
}
function BossIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke()} strokeWidth="2"><path d="M12 2l2.2 4.8L19 8l-3.5 3.4.8 5.1L12 14.8 7.7 16.5l.8-5.1L5 8l4.8-1.2L12 2z" /></svg>;
}
function CardsIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke()} strokeWidth="2"><rect x="3" y="5" width="12" height="16" rx="2" /><path d="M9 3h10a2 2 0 012 2v14" /></svg>;
}
function CollectionIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke()} strokeWidth="2"><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h10" /></svg>;
}
function ProfileIcon({ active }: { active: boolean }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#e2e8f0" : "#475569"} strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
}
