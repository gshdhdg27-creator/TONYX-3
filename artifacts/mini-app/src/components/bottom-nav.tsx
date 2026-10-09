import { type ReactNode, useEffect, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { haptic } from "@/lib/telegram";

export type MenuMode = 1 | 2 | 3;

const MODE_KEY = "tonyx-menu-mode";

const MODE_COLOR: Record<MenuMode, string> = {
  1: "#2563eb",
  2: "#dc2626",
  3: "#eab308",
};

const FIRST_PATH: Record<MenuMode, string> = {
  1: "/market",
  2: "/cases",
  3: "/bosses",
};

interface TabDef {
  path: string;
  label: string;
  icon: (active: boolean) => ReactNode;
}

const MODE_TABS: Record<MenuMode, TabDef[]> = {
  1: [
    { path: "/market", label: "Market", icon: MarketIcon },
    { path: "/nft-market", label: "NFT", icon: NftIcon },
    { path: "/tasks", label: "Задания", icon: TasksIcon },
  ],
  2: [
    { path: "/cases", label: "Кейсы", icon: CasesIcon },
    { path: "/pvp", label: "PvP", icon: PvpIcon },
    { path: "/solo", label: "Solo", icon: SoloIcon },
  ],
  3: [
    { path: "/bosses", label: "Боссы", icon: BossIcon },
    { path: "/cards", label: "Карточки", icon: CardsIcon },
    { path: "/collection", label: "Коллекция", icon: CollectionIcon },
  ],
};

function readMenuMode(): MenuMode {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    if (raw === "2") return 2;
    if (raw === "3") return 3;
  } catch {
    /* ignore */
  }
  return 1;
}

function writeMenuMode(mode: MenuMode) {
  try {
    localStorage.setItem(MODE_KEY, String(mode));
  } catch {
    /* ignore */
  }
}

function nextMode(mode: MenuMode): MenuMode {
  if (mode === 1) return 2;
  if (mode === 2) return 3;
  return 1;
}

export default function BottomNav() {
  const [location, setLocation] = useLocation();
  const [mode, setMode] = useState<MenuMode>(readMenuMode);
  const [spinDeg, setSpinDeg] = useState(() => (readMenuMode() - 1) * 120);
  const [busy, setBusy] = useState(false);
  const [flood, setFlood] = useState<{ color: string; phase: "in" | "out" } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [origin, setOrigin] = useState({ x: 36, y: 40 });
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  function switchMode() {
    if (busy) return;
    const upcoming = nextMode(mode);
    haptic("medium");
    setBusy(true);

    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }

    setSpinDeg((deg) => deg + 120);
    setFlood({ color: MODE_COLOR[upcoming], phase: "in" });

    timer.current = window.setTimeout(() => {
      setMode(upcoming);
      writeMenuMode(upcoming);
      setLocation(FIRST_PATH[upcoming]);
      setFlood({ color: MODE_COLOR[upcoming], phase: "out" });
      timer.current = window.setTimeout(() => {
        setFlood(null);
        setBusy(false);
      }, 700);
    }, 900);
  }

  const tabs = MODE_TABS[mode];
  const profileActive = location === "/profile" || location.startsWith("/profile/");

  return (
    <>
      <style>{`
        @keyframes tonyx-flood-in {
          from { transform: translate(-50%, -50%) scale(0.15); opacity: 0.85; }
          to { transform: translate(-50%, -50%) scale(28); opacity: 1; }
        }
        @keyframes tonyx-flood-out {
          from { transform: translate(-50%, -50%) scale(28); opacity: 1; }
          to { transform: translate(-50%, -50%) scale(0.2); opacity: 0; }
        }
      `}</style>

      {flood && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: origin.x,
            top: origin.y,
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: flood.color,
            zIndex: 250,
            pointerEvents: "none",
            animation: flood.phase === "in"
              ? "tonyx-flood-in 0.85s ease-out forwards"
              : "tonyx-flood-out 0.7s ease-in forwards",
          }}
        />
      )}

      <nav style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: 480,
        background: "rgba(10, 11, 20, 0.92)",
        borderTop: "1px solid rgba(30, 58, 143, 0.35)",
        display: "flex",
        alignItems: "stretch",
        backdropFilter: "blur(20px)",
        zIndex: 100,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        boxShadow: "0 -8px 30px rgba(0,0,0,0.5)",
      }}>
        <div style={{
          width: 72,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRight: "1px solid rgba(30, 58, 143, 0.35)",
        }}>
          <button
            ref={buttonRef}
            type="button"
            onClick={switchMode}
            aria-label="Меню"
            style={{
              width: 46,
              height: 46,
              borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.2)",
              padding: 0,
              position: "relative",
              background: "transparent",
              cursor: busy ? "default" : "pointer",
            }}
          >
            <span style={{
              position: "absolute",
              left: 3,
              right: 3,
              top: 3,
              bottom: 3,
              borderRadius: "50%",
              background: "conic-gradient(#2563eb 0 120deg, #dc2626 120deg 240deg, #eab308 240deg 360deg)",
              transform: `rotate(${spinDeg - 60}deg)`,
              transition: "transform 0.8s cubic-bezier(.2,.8,.2,1)",
            }} />
            <span style={{
              position: "absolute",
              left: "50%",
              top: -6,
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: "7px solid #f8fafc",
            }} />
            <span style={{
              position: "absolute",
              inset: 14,
              borderRadius: "50%",
              background: "#0b1020",
              color: "#f8fafc",
              fontSize: 11,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              {mode}
            </span>
          </button>
        </div>

        {tabs.map(({ path, label, icon }) => {
          const active = location === path || location.startsWith(path + "/");
          return (
            <Link key={path} href={path} onClick={() => haptic("light")} style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "8px 2px 6px",
              textDecoration: "none",
              opacity: active ? 1 : 0.7,
            }}>
              {icon(active)}
              <span style={{ marginTop: 3, fontSize: 10, fontWeight: 700, color: active ? MODE_COLOR[mode] : "#64748b" }}>
                {label}
              </span>
            </Link>
          );
        })}

        <Link href="/profile" onClick={() => haptic("light")} style={{
          width: 68,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 2px 6px",
          textDecoration: "none",
          borderLeft: "1px solid rgba(30, 58, 143, 0.35)",
          opacity: profileActive ? 1 : 0.7,
        }}>
          <ProfileIcon active={profileActive} />
          <span style={{ marginTop: 3, fontSize: 10, fontWeight: 700, color: profileActive ? "#93c5fd" : "#64748b" }}>
            Профиль
          </span>
        </Link>
      </nav>
    </>
  );
}

function stroke(active: boolean) {
  return active ? "#e2e8f0" : "#475569";
}
function MarketIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h2l2.4 12.2a2 2 0 002 1.6h8.7a2 2 0 002-1.6L22 7H6" />
      <circle cx="9" cy="21" r="1.5" /><circle cx="18" cy="21" r="1.5" />
    </svg>
  );
}
function NftIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 16l5-5 4 4 3-3 6 6" />
    </svg>
  );
}
function TasksIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}
function CasesIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h18v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /><path d="M3 8l2-4h14l2 4" /><path d="M12 8v13" />
    </svg>
  );
}
function PvpIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 17.5L3 6V3h3l11.5 11.5" /><path d="M13 19l6-6" /><path d="M16 16l4 4" />
    </svg>
  );
}
function SoloIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 3v18" />
    </svg>
  );
}
function BossIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.2 4.8L19 8l-3.5 3.4.8 5.1L12 14.8 7.7 16.5l.8-5.1L5 8l4.8-1.2L12 2z" />
    </svg>
  );
}
function CardsIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="12" height="16" rx="2" /><path d="M9 3h10a2 2 0 012 2v14" />
    </svg>
  );
}
function CollectionIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h10" />
    </svg>
  );
}
function ProfileIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}
