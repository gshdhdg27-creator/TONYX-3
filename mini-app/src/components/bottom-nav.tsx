import { type ReactNode, useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { haptic, useTelegram } from "@/lib/telegram";

interface TabDef {
  path: string;
  label: string;
  icon: (active: boolean) => ReactNode;
}

const BASE_TABS: TabDef[] = [
  { path: "/", label: "Home", icon: HomeIcon },
  { path: "/market", label: "Market", icon: MarketIcon },
  { path: "/games", label: "Games", icon: GamesIcon },
  { path: "/tasks", label: "Tasks", icon: TasksIcon },
  { path: "/profile", label: "Profile", icon: ProfileIcon },
];

const ADMIN_TAB: TabDef = { path: "/admin", label: "Админ", icon: AdminIcon };

function HomeIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#60a5fa" : "#475569"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12l9-9 9 9" /><path d="M5 10v10h14V10" />
    </svg>
  );
}
function MarketIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#60a5fa" : "#475569"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h2l2.4 12.2a2 2 0 002 1.6h8.7a2 2 0 002-1.6L22 7H6" />
      <circle cx="9" cy="21" r="1.5" /><circle cx="18" cy="21" r="1.5" />
    </svg>
  );
}
function GamesIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#60a5fa" : "#475569"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="13" rx="3" /><line x1="7" y1="13" x2="11" y2="13" /><line x1="9" y1="11" x2="9" y2="15" /><circle cx="16" cy="12" r="1" /><circle cx="18" cy="15" r="1" />
    </svg>
  );
}
function TasksIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#60a5fa" : "#475569"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}
function ProfileIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#60a5fa" : "#475569"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function AdminIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#fbbf24" : "#475569"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

/* Session-level cache so we don't re-fetch on every render */
const adminCache: Record<string, boolean> = {};

async function fetchIsAdmin(telegramId: string): Promise<boolean> {
  if (telegramId in adminCache) return adminCache[telegramId];
  try {
    const r = await fetch(`/api/mini/admin/check?telegramId=${telegramId}`);
    if (r.ok) {
      const d = (await r.json()) as { isAdmin: boolean };
      adminCache[telegramId] = d.isAdmin;
      return d.isAdmin;
    }
  } catch { /* network error — default false */ }
  adminCache[telegramId] = false;
  return false;
}

export default function BottomNav() {
  const [location] = useLocation();
  const { telegramId } = useTelegram();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!telegramId) return;
    fetchIsAdmin(telegramId).then(setIsAdmin);
  }, [telegramId]);

  const tabs = isAdmin ? [...BASE_TABS, ADMIN_TAB] : BASE_TABS;

  return (
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
      backdropFilter: "blur(20px)",
      zIndex: 100,
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
      boxShadow: "0 -8px 30px rgba(0,0,0,0.5)",
    }}>
      {tabs.map(({ path, label, icon }) => {
        const active = location === path || (path !== "/" && location.startsWith(path));
        const isAdminTab = path === "/admin";
        return (
          <Link key={path} href={path} onClick={() => haptic("light")} style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "10px 4px 8px",
            textDecoration: "none",
            cursor: "pointer",
            position: "relative",
            transition: "opacity 0.15s",
            opacity: active ? 1 : 0.7,
          }}>
            <div style={{
              filter: active
                ? `drop-shadow(0 0 6px rgba(${isAdminTab ? "251,191,36" : "96,165,250"},0.7))`
                : "none",
              transform: active ? "translateY(-1px)" : "translateY(0)",
              transition: "transform 0.2s",
            }}>
              {icon(active)}
            </div>
            <span style={{
              fontSize: 10,
              fontWeight: active ? 600 : 400,
              color: active ? (isAdminTab ? "#fbbf24" : "#60a5fa") : "#475569",
              marginTop: 3,
              letterSpacing: "0.03em",
            }}>{label}</span>
            {active && (
              <div style={{
                position: "absolute",
                top: 2,
                width: 36,
                height: 3,
                borderRadius: 2,
                background: isAdminTab
                  ? "linear-gradient(90deg, #b45309, #fbbf24)"
                  : "linear-gradient(90deg, #2563eb, #60a5fa)",
                boxShadow: `0 0 10px rgba(${isAdminTab ? "251,191,36" : "96,165,250"},0.7)`,
              }} />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
