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

/** Per-section avatar gradients (inactive ring + active fill) */
const SECTION_AVATAR: Record<Section, { from: string; to: string; glow: string; icon: string }> = {
  market:     { from: "#3b82f6", to: "#1d4ed8", glow: "rgba(59,130,246,0.55)", icon: "#dbeafe" },
  nft:        { from: "#a855f7", to: "#7c3aed", glow: "rgba(168,85,247,0.55)", icon: "#f3e8ff" },
  inventory:  { from: "#06b6d4", to: "#0891b2", glow: "rgba(6,182,212,0.5)",  icon: "#cffafe" },
  cases:      { from: "#f59e0b", to: "#d97706", glow: "rgba(245,158,11,0.55)", icon: "#fef3c7" },
  pvp:        { from: "#ef4444", to: "#b91c1c", glow: "rgba(239,68,68,0.55)",  icon: "#fee2e2" },
  solo:       { from: "#22c55e", to: "#15803d", glow: "rgba(34,197,94,0.5)",   icon: "#dcfce7" },
  bosses:     { from: "#eab308", to: "#ca8a04", glow: "rgba(234,179,8,0.55)",  icon: "#fef9c3" },
  cards:      { from: "#ec4899", to: "#be185d", glow: "rgba(236,72,153,0.5)",  icon: "#fce7f3" },
  collection: { from: "#8b5cf6", to: "#6d28d9", glow: "rgba(139,92,246,0.55)", icon: "#ede9fe" },
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
          const av = SECTION_AVATAR[section];
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
                width: active ? 34 : 28,
                height: active ? 34 : 28,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: active
                  ? `linear-gradient(145deg, ${av.from}, ${av.to})`
                  : `linear-gradient(145deg, ${av.from}22, ${av.to}18)`,
                boxShadow: active
                  ? `0 4px 16px ${av.glow}, 0 0 0 1.5px ${av.from}88, inset 0 1px 0 rgba(255,255,255,0.35)`
                  : `0 0 0 1px ${av.from}33, inset 0 1px 0 rgba(255,255,255,0.06)`,
                transition: "all 0.28s cubic-bezier(0.34,1.15,0.64,1)",
                animation: active ? "tonyx-tab-pop 0.35s ease" : undefined,
              }}>
                {icon(active, active ? "#0b1020" : av.icon)}
              </div>
              <span style={{
                fontSize: 9.5,
                fontWeight: active ? 800 : 600,
                color: active ? av.from : "#64748b",
                letterSpacing: 0.15,
                whiteSpace: "nowrap",
                transition: "color 0.25s ease, font-weight 0.2s ease",
                textShadow: active ? `0 0 12px ${av.glow}` : "none",
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

function MarketIcon(active: boolean, _c: string) {
  const f = active ? "#0b1020" : "#93c5fd";
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M4 10h16v9a2 2 0 01-2 2H6a2 2 0 01-2-2v-9z" fill={f} opacity="0.9"/>
      <path d="M3 10l2.2-5.2A2 2 0 017.05 3.5h9.9a2 2 0 011.85 1.3L21 10H3z" fill={f} opacity="0.55"/>
      <path d="M9 14.5h6" stroke={active ? "#1d4ed8" : "#1e3a8a"} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}
function NftIcon(active: boolean, _c: string) {
  const f = active ? "#0b1020" : "#d8b4fe";
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" fill={f} opacity="0.85"/>
      <path d="M8 15.5l2.2-2.8 2 1.6 3.3-3.8" stroke={active ? "#6d28d9" : "#5b21b6"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="9.2" cy="9" r="1.4" fill={active ? "#6d28d9" : "#5b21b6"}/>
    </svg>
  );
}
function InventoryIcon(active: boolean, _c: string) {
  const f = active ? "#0b1020" : "#67e8f9";
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M5 8.5h14v10.5a2 2 0 01-2 2H7a2 2 0 01-2-2V8.5z" fill={f} opacity="0.9"/>
      <path d="M8 8.5V7a4 4 0 018 0v1.5" stroke={f} strokeWidth="1.9" strokeLinecap="round"/>
      <path d="M9.5 13h5" stroke={active ? "#0e7490" : "#155e75"} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}
function CasesIcon(active: boolean, _c: string) {
  const f = active ? "#0b1020" : "#fcd34d";
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="8" width="17" height="12" rx="2.5" fill={f} opacity="0.9"/>
      <path d="M3.5 11.5h17" stroke={active ? "#b45309" : "#92400e"} strokeWidth="1.6"/>
      <path d="M9 8V6.2A2.2 2.2 0 0111.2 4h1.6A2.2 2.2 0 0115 6.2V8" stroke={f} strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="12" cy="14.5" r="1.6" fill={active ? "#b45309" : "#92400e"}/>
    </svg>
  );
}
function PvpIcon(active: boolean, _c: string) {
  const f = active ? "#0b1020" : "#fca5a5";
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M13.8 16.2L4.5 6.9V4h2.9l9.3 9.3-2.9 2.9z" fill={f} opacity="0.95"/>
      <path d="M10.2 7.8L19.5 17.1v2.9h-2.9L7.3 10.7l2.9-2.9z" fill={f} opacity="0.7"/>
      <path d="M15.5 15.5l3.2 3.2" stroke={f} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
function SoloIcon(active: boolean, _c: string) {
  const f = active ? "#0b1020" : "#86efac";
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.5" fill={f} opacity="0.35"/>
      <circle cx="12" cy="12" r="8.5" stroke={f} strokeWidth="2"/>
      <circle cx="12" cy="12" r="2.2" fill={f}/>
      <path d="M12 5.5v2.2M12 16.3v2.2M5.5 12h2.2M16.3 12h2.2" stroke={f} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}
function BossIcon(active: boolean, _c: string) {
  const f = active ? "#0b1020" : "#fde047";
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 2.8l2.4 5.1 5.6.8-4.1 4 1 5.5L12 15.6 7.1 18.2l1-5.5-4.1-4 5.6-.8L12 2.8z" fill={f} opacity="0.95"/>
      <path d="M12 8.2l.9 1.9 2.1.3-1.5 1.5.4 2.1L12 12.9l-1.9 1.1.4-2.1-1.5-1.5 2.1-.3.9-1.9z" fill={active ? "#a16207" : "#854d0e"} opacity="0.85"/>
    </svg>
  );
}
function CardsIcon(active: boolean, _c: string) {
  const f = active ? "#0b1020" : "#f9a8d4";
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="4.5" width="11" height="15" rx="2" fill={f} opacity="0.55" transform="rotate(-8 10.5 12)"/>
      <rect x="7.5" y="4" width="11" height="15.5" rx="2" fill={f} opacity="0.95"/>
      <path d="M10.5 9.5h5M10.5 12.5h4" stroke={active ? "#9d174d" : "#9f1239"} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function CollectionIcon(active: boolean, _c: string) {
  const f = active ? "#0b1020" : "#c4b5fd";
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="5" width="7" height="7" rx="1.8" fill={f} opacity="0.95"/>
      <rect x="13.5" y="5" width="7" height="7" rx="1.8" fill={f} opacity="0.7"/>
      <rect x="3.5" y="14" width="7" height="7" rx="1.8" fill={f} opacity="0.7"/>
      <rect x="13.5" y="14" width="7" height="7" rx="1.8" fill={f} opacity="0.95"/>
    </svg>
  );
}
function ProfileIcon({ active }: { active: boolean }) {
  const c = active ? "#0b1020" : "#94a3b8";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
