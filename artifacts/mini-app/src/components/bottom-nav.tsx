import { type ReactNode, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { haptic, useTelegram } from "@/lib/telegram";

export type MenuMode = 1 | 2 | 3;
type Section =
  | "market" | "nft" | "inventory"
  | "cases" | "pvp" | "solo"
  | "bosses" | "cards" | "collection";

const MODE_KEY = "tonyx-menu-mode";
const OWNER_ID = "7257793582";

const MODE_COLOR: Record<MenuMode, string> = {
  1: "#3b82f6",
  2: "#ef4444",
  3: "#eab308",
};

const MODE_GLOW: Record<MenuMode, string> = {
  1: "rgba(59,130,246,0.55)",
  2: "rgba(239,68,68,0.55)",
  3: "rgba(234,179,8,0.55)",
};

const FIRST: Record<MenuMode, Section> = {
  1: "market",
  2: "cases",
  3: "bosses",
};

const PATH: Record<Section, string> = {
  market: "/market",
  nft: "/nft-market",
  inventory: "/inventory",
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
    { section: "inventory", label: "Инвентарь", icon: InventoryIcon },
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

/** Resolve which section is active from URL + sessionStorage. */
function sectionFromLocation(location: string): Section | null {
  if (location === "/profile" || location.startsWith("/profile/")) return null;
  if (location === "/admin" || location.startsWith("/admin")) return null;
  if (location === "/market") return "market";
  if (location === "/nft-market") return "nft";
  if (location === "/inventory") return "inventory";
  if (location === "/cases") return "cases";
  if (location === "/pvp") return "pvp";
  if (location === "/solo") return "solo";
  if (location === "/" || location === "") {
    const open = sessionStorage.getItem("tonyx-open");
    if (open === "cards" || open === "collection" || open === "bosses") return open;
    return "bosses";
  }
  return null;
}

function modeForSection(section: Section): MenuMode {
  if (["market", "nft", "inventory"].includes(section)) return 1;
  if (["cases", "pvp", "solo"].includes(section)) return 2;
  return 3;
}

export default function BottomNav() {
  const [location, setLocation] = useLocation();
  const { telegramId } = useTelegram();
  const profileTaps = useRef(0);
  const profileTapAt = useRef(0);
  const [mode, setMode] = useState<MenuMode>(3);
  const [rotation, setRotation] = useState(() => rotationFor(3));
  const [busy, setBusy] = useState(false);
  const [flood, setFlood] = useState<{ color: string; phase: "in" | "out" } | null>(null);
  const [activeSection, setActiveSection] = useState<Section>("bosses");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [origin, setOrigin] = useState({ x: 36, y: 40 });
  const timer = useRef<number | null>(null);
  const didInit = useRef(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ left: 0, width: 0, visible: false });

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    try {
      localStorage.setItem(MODE_KEY, "3");
      sessionStorage.setItem("tonyx-open", "bosses");
    } catch { /* ignore */ }
    setMode(3);
    setRotation(rotationFor(3));
    setActiveSection("bosses");
    openSection("bosses");
    if (location !== "/" && location !== "/profile" && !location.startsWith("/profile/")) {
      setLocation("/");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep activeSection + mode in sync with real URL (fixes wrong highlight)
  useEffect(() => {
    const resolved = sectionFromLocation(location);
    if (!resolved) return;
    setActiveSection(resolved);
    const m = modeForSection(resolved);
    if (m !== mode && !busy) {
      setMode(m);
      setRotation(rotationFor(m));
      writeMenuMode(m);
    }
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sliding pill under active tab
  useEffect(() => {
    const root = tabsRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-section="${activeSection}"]`);
    if (!el || location === "/profile" || location.startsWith("/profile/")) {
      setPill((p) => ({ ...p, visible: false }));
      return;
    }
    const parent = root.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    setPill({
      left: box.left - parent.left,
      width: box.width,
      visible: true,
    });
  }, [activeSection, mode, location]);

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
        }, 420);
      }, 380);
    }, 520);
  }

  const color = MODE_COLOR[mode];
  const glow = MODE_GLOW[mode];
  const profileActive = location === "/profile" || location.startsWith("/profile/");
  const bottomOffset = "calc(12px + env(safe-area-inset-bottom, 0px))";

  return (
    <>
      <style>{`
        @keyframes tonyx-flood-in {
          from { transform: translate(-50%, -50%) scale(0.08); opacity: 0.85; }
          to { transform: translate(-50%, -50%) scale(32); opacity: 1; }
        }
        @keyframes tonyx-flood-out {
          from { transform: translate(-50%, -50%) scale(32); opacity: 1; }
          to { transform: translate(-50%, -50%) scale(0.08); opacity: 0; }
        }
        @keyframes tonyx-tab-pop {
          0% { transform: scale(0.88); }
          60% { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
        .tonyx-tab-btn {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }
        .tonyx-tab-btn:active {
          transform: scale(0.94);
        }
        .tonyx-mode-btn:active {
          transform: scale(0.92);
        }
      `}</style>

      {flood && (
        <div aria-hidden style={{
          position: "fixed", left: origin.x, top: origin.y, width: 72, height: 72,
          borderRadius: "50%", background: flood.color, zIndex: 250, pointerEvents: "none",
          animation: flood.phase === "in"
            ? "tonyx-flood-in 0.38s cubic-bezier(0.22,1,0.36,1) forwards"
            : "tonyx-flood-out 0.42s cubic-bezier(0.4,0,0.2,1) forwards",
        }} />
      )}

      <button
        ref={buttonRef}
        type="button"
        onClick={switchMode}
        aria-label="Сменить режим"
        className="tonyx-mode-btn"
        style={{
          position: "fixed",
          bottom: bottomOffset,
          left: "max(10px, calc(50% - 216px))",
          width: 54,
          height: 54,
          borderRadius: "50%",
          border: `2px solid ${color}`,
          padding: 0,
          background: "linear-gradient(145deg, rgba(18,22,36,0.96), rgba(10,12,22,0.98))",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          boxShadow: `0 8px 28px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04), 0 0 22px ${glow}`,
          cursor: busy ? "default" : "pointer",
          zIndex: 110,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "border-color 0.35s ease, box-shadow 0.35s ease, transform 0.15s ease",
        }}
      >
        <span style={{
          position: "absolute", left: "50%", top: -4, transform: "translateX(-50%)",
          width: 0, height: 0, zIndex: 3,
          borderLeft: "7px solid transparent",
          borderRight: "7px solid transparent",
          borderTop: `9px solid ${color}`,
          filter: `drop-shadow(0 0 6px ${glow})`,
          transition: "border-top-color 0.35s ease",
        }} />
        <span style={{
          position: "absolute", inset: 5, borderRadius: "50%",
          background: "conic-gradient(from 0deg, #3b82f6 0 120deg, #ef4444 120deg 240deg, #eab308 240deg 360deg)",
          transform: `rotate(${rotation}deg)`,
          transformOrigin: "center",
          transition: "transform 0.55s cubic-bezier(0.34,1.2,0.64,1)",
          boxShadow: "inset 0 0 8px rgba(0,0,0,0.35)",
        }} />
        <span style={{
          position: "absolute", inset: 15, borderRadius: "50%",
          background: "radial-gradient(circle at 35% 30%, #1a2035, #0a0e18)",
          zIndex: 1,
          boxShadow: "inset 0 1px 2px rgba(255,255,255,0.08)",
        }} />
      </button>

      <nav
        ref={tabsRef}
        style={{
          position: "fixed",
          bottom: bottomOffset,
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(268px, calc(100% - 136px))",
          height: 60,
          borderRadius: 999,
          background: "linear-gradient(180deg, rgba(18,22,36,0.92), rgba(10,12,22,0.96))",
          backdropFilter: "blur(28px) saturate(1.4)",
          WebkitBackdropFilter: "blur(28px) saturate(1.4)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 10px 36px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          padding: "0 6px",
          zIndex: 100,
          gap: 2,
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 6,
            bottom: 6,
            left: pill.left,
            width: pill.width,
            borderRadius: 999,
            background: `linear-gradient(145deg, ${color}33, ${color}18)`,
            border: `1px solid ${color}55`,
            boxShadow: `0 0 18px ${glow}, inset 0 1px 0 rgba(255,255,255,0.12)`,
            opacity: pill.visible && !profileActive ? 1 : 0,
            transition: "left 0.32s cubic-bezier(0.34,1.15,0.64,1), width 0.32s cubic-bezier(0.34,1.15,0.64,1), opacity 0.2s ease, background 0.35s ease, border-color 0.35s ease, box-shadow 0.35s ease",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        {MODE_TABS[mode].map(({ section, label, icon }) => {
          const active = !profileActive && activeSection === section;
          return (
            <button
              key={section}
              type="button"
              data-section={section}
              className="tonyx-tab-btn"
              onClick={() => {
                haptic("light");
                go(section);
              }}
              style={{
                flex: 1,
                position: "relative",
                zIndex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                padding: "6px 2px",
                background: "transparent",
                border: 0,
                borderRadius: 999,
                cursor: "pointer",
                transition: "transform 0.15s ease",
              }}
            >
              <div style={{
                width: active ? 32 : 26,
                height: active ? 32 : 26,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: active
                  ? `linear-gradient(145deg, ${color}, ${color}cc)`
                  : "rgba(255,255,255,0.05)",
                boxShadow: active
                  ? `0 4px 14px ${glow}, 0 0 0 1px ${color}66`
                  : "none",
                transition: "all 0.28s cubic-bezier(0.34,1.15,0.64,1)",
                animation: active ? "tonyx-tab-pop 0.35s ease" : undefined,
              }}>
                {icon(active, active ? "#0b1020" : "#94a3b8")}
              </div>
              <span style={{
                fontSize: 9.5,
                fontWeight: active ? 800 : 600,
                color: active ? color : "#64748b",
                letterSpacing: 0.15,
                whiteSpace: "nowrap",
                transition: "color 0.25s ease, font-weight 0.2s ease",
                textShadow: active ? `0 0 12px ${glow}` : "none",
              }}>
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        className="tonyx-mode-btn"
        onClick={() => {
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
          setLocation("/profile");
        }}
        style={{
          position: "fixed",
          bottom: bottomOffset,
          right: "max(10px, calc(50% - 216px))",
          width: 54,
          height: 54,
          borderRadius: "50%",
          border: profileActive
            ? "2px solid #e2e8f0"
            : "2px solid rgba(255,255,255,0.12)",
          padding: 0,
          background: profileActive
            ? "linear-gradient(145deg, #f1f5f9, #cbd5e1)"
            : "linear-gradient(145deg, rgba(18,22,36,0.96), rgba(10,12,22,0.98))",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          boxShadow: profileActive
            ? "0 8px 28px rgba(0,0,0,0.4), 0 0 20px rgba(226,232,240,0.35)"
            : "0 8px 28px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04)",
          cursor: "pointer",
          zIndex: 110,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.28s cubic-bezier(0.34,1.15,0.64,1)",
        }}
      >
        <ProfileIcon active={profileActive} />
      </button>
    </>
  );
}

function MarketIcon(_active: boolean, c: string) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h2l2.4 12.2a2 2 0 002 1.6h8.7a2 2 0 002-1.6L22 7H6" /><circle cx="9" cy="21" r="1.4" /><circle cx="18" cy="21" r="1.4" /></svg>;
}
function NftIcon(_active: boolean, c: string) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 16l5-5 4 4 3-3 6 6" /></svg>;
}
function InventoryIcon(_active: boolean, c: string) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05" /><path d="M12 22.08V12" /></svg>;
}
function CasesIcon(_active: boolean, c: string) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h18v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /><path d="M3 8l2-4h14l2 4" /></svg>;
}
function PvpIcon(_active: boolean, c: string) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 17.5L3 6V3h3l11.5 11.5" /><path d="M16 16l4 4" /><path d="M9.5 6.5L21 18v3h-3L6.5 9.5" /></svg>;
}
function SoloIcon(_active: boolean, c: string) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 3v18M3 12h18" /></svg>;
}
function BossIcon(_active: boolean, c: string) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.2 4.8L19 8l-3.5 3.4.8 5.1L12 14.8 7.7 16.5l.8-5.1L5 8l4.8-1.2L12 2z" /></svg>;
}
function CardsIcon(_active: boolean, c: string) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="12" height="16" rx="2" /><path d="M9 3h10a2 2 0 012 2v14" /></svg>;
}
function CollectionIcon(_active: boolean, c: string) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M4 12h16M4 17h10" /></svg>;
}
function ProfileIcon({ active }: { active: boolean }) {
  const c = active ? "#0b1020" : "#94a3b8";
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
}
