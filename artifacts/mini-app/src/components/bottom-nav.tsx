import { type ReactNode, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { haptic, useTelegram } from "@/lib/telegram";

export type MenuMode = 1 | 2 | 3;
type Section =
  | "market" | "nft" | "tasks"
  | "cases" | "pvp" | "solo"
  | "bosses" | "cards" | "collection";

const MODE_KEY = "tonyx-menu-mode";
const OWNER_ID = "7257793582";
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
  icon: (active: boolean, color: string) => ReactNode;
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
    if (raw === "1") return 1;
    if (raw === "2") return 2;
    if (raw === "3") return 3;
  } catch { /* ignore */ }
  // Always default to yellow Bosses mode when entering
  return 3;
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
  const [location, setLocation] = useLocation();
  const { telegramId } = useTelegram();
  const profileTaps = useRef(0);
  const profileTapAt = useRef(0);
  const [mode, setMode] = useState<MenuMode>(readMenuMode);
  const [rotation, setRotation] = useState(() => rotationFor(readMenuMode()));
  const [busy, setBusy] = useState(false);
  const [flood, setFlood] = useState<{ color: string; phase: "in" | "out" } | null>(null);
  const [activeSection, setActiveSection] = useState<Section>(() => {
    try {
      const s = sessionStorage.getItem("tonyx-open") as Section | null;
      if (s && ["market","nft","tasks","cases","pvp","solo","bosses","cards","collection"].includes(s)) return s;
    } catch { /* ignore */ }
    return FIRST[readMenuMode()];
  });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [origin, setOrigin] = useState({ x: 36, y: 40 });
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  // On first mount always land on bosses if we are in yellow mode
  useEffect(() => {
    if (mode === 3 && activeSection === "bosses") {
      openSection("bosses");
      if (location !== "/") setLocation("/");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function go(section: Section) {
    openSection(section);
    setActiveSection(section);
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
        const first = FIRST[upcoming];
        setActiveSection(first);
        go(first);
        setFlood({ color: MODE_COLOR[upcoming], phase: "out" });
        timer.current = window.setTimeout(() => {
          setFlood(null);
          setBusy(false);
        }, 560);
      }, 560);
    }, 820);
  }

  const color = MODE_COLOR[mode];
  const profileActive = location === "/profile" || location.startsWith("/profile/");

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

      {/* Floating pill menu — design like reference */}
      <nav style={{
        position: "fixed",
        bottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        left: "50%",
        transform: "translateX(-50%)",
        width: "calc(100% - 24px)",
        maxWidth: 420,
        height: 64,
        borderRadius: 999,
        background: "rgba(12, 14, 24, 0.78)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        padding: "0 6px",
        zIndex: 100,
        gap: 2,
      }}>
        {/* Mode switcher (mechanics unchanged) */}
        <div style={{ width: 56, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <button ref={buttonRef} type="button" onClick={switchMode} aria-label="Меню" style={{
            width: 42, height: 42, borderRadius: "50%", border: `2px solid ${color}`,
            padding: 0, position: "relative", background: "rgba(0,0,0,0.35)",
            cursor: busy ? "default" : "pointer",
            boxShadow: `0 0 12px ${color}55`,
          }}>
            <span style={{
              position: "absolute", left: "50%", top: -2, transform: "translateX(-50%)",
              width: 0, height: 0, zIndex: 3,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: `7px solid ${color}`,
            }} />
            <span style={{
              position: "absolute", inset: 3, borderRadius: "50%",
              background: "conic-gradient(from 0deg, #2563eb 0 120deg, #dc2626 120deg 240deg, #eab308 240deg 360deg)",
              transform: `rotate(${rotation}deg)`,
              transformOrigin: "center",
              transition: "transform 0.8s linear",
            }} />
            <span style={{
              position: "absolute", inset: 13, borderRadius: "50%", background: "#0b1020", zIndex: 1,
            }} />
          </button>
        </div>

        {/* Tabs */}
        {MODE_TABS[mode].map(({ section, label, icon }) => {
          const active = activeSection === section && !profileActive;
          return (
            <button
              key={section}
              type="button"
              onClick={() => { haptic("light"); go(section); }}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                padding: "6px 2px",
                background: active ? `${color}22` : "transparent",
                border: 0,
                borderRadius: 999,
                cursor: "pointer",
                transition: "background 0.2s ease",
                position: "relative",
              }}
            >
              <div style={{
                width: active ? 36 : 28,
                height: active ? 36 : 28,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: active ? color : "rgba(255,255,255,0.06)",
                boxShadow: active ? `0 0 14px ${color}88` : "none",
                transition: "all 0.2s ease",
              }}>
                {icon(active, active ? "#0b1020" : "#94a3b8")}
              </div>
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                color: active ? color : "#94a3b8",
                letterSpacing: 0.2,
                whiteSpace: "nowrap",
              }}>
                {label}
              </span>
            </button>
          );
        })}

        {/* Profile */}
        <button type="button" onClick={() => {
          haptic("light");
          const now = Date.now();
          if (now - profileTapAt.current > 700) profileTaps.current = 0;
          profileTapAt.current = now;
          profileTaps.current += 1;
          if (profileTaps.current >= 3) {
            profileTaps.current = 0;
            if (telegramId === OWNER_ID) {
              haptic("medium");
              setLocation("/admin");
              return;
            }
          }
          setActiveSection("bosses"); // keep section state consistent
          setLocation("/profile");
        }} style={{
          width: 56,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          background: profileActive ? "rgba(255,255,255,0.08)" : "transparent",
          border: 0,
          borderRadius: 999,
          cursor: "pointer",
          flexShrink: 0,
          padding: "6px 2px",
        }}>
          <div style={{
            width: profileActive ? 36 : 28,
            height: profileActive ? 36 : 28,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: profileActive ? "#e2e8f0" : "rgba(255,255,255,0.06)",
            boxShadow: profileActive ? "0 0 12px rgba(226,232,240,0.4)" : "none",
            transition: "all 0.2s ease",
          }}>
            <ProfileIcon active={profileActive} />
          </div>
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            color: profileActive ? "#e2e8f0" : "#94a3b8",
          }}>
            Профиль
          </span>
        </button>
      </nav>
    </>
  );
}

function MarketIcon(active: boolean, c: string) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2"><path d="M3 3h2l2.4 12.2a2 2 0 002 1.6h8.7a2 2 0 002-1.6L22 7H6" /><circle cx="9" cy="21" r="1.5" /><circle cx="18" cy="21" r="1.5" /></svg>;
}
function NftIcon(active: boolean, c: string) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 16l5-5 4 4 3-3 6 6" /></svg>;
}
function TasksIcon(active: boolean, c: string) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>;
}
function CasesIcon(active: boolean, c: string) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2"><path d="M3 8h18v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /><path d="M3 8l2-4h14l2 4" /></svg>;
}
function PvpIcon(active: boolean, c: string) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2"><path d="M14.5 17.5L3 6V3h3l11.5 11.5" /><path d="M16 16l4 4" /></svg>;
}
function SoloIcon(active: boolean, c: string) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2"><circle cx="12" cy="12" r="9" /><path d="M12 3v18" /></svg>;
}
function BossIcon(active: boolean, c: string) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2"><path d="M12 2l2.2 4.8L19 8l-3.5 3.4.8 5.1L12 14.8 7.7 16.5l.8-5.1L5 8l4.8-1.2L12 2z" /></svg>;
}
function CardsIcon(active: boolean, c: string) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2"><rect x="3" y="5" width="12" height="16" rx="2" /><path d="M9 3h10a2 2 0 012 2v14" /></svg>;
}
function CollectionIcon(active: boolean, c: string) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2"><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h10" /></svg>;
}
function ProfileIcon({ active }: { active: boolean }) {
  const c = active ? "#0b1020" : "#94a3b8";
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
}
