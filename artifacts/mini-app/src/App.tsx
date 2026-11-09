import { useEffect, useState, useCallback, useRef, type CSSProperties } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import BottomNav from "@/components/bottom-nav";
import LanguageModal from "@/components/LanguageModal";
import Header from "@/components/Header";
import HomePage from "@/pages/home";
import MarketPage from "@/pages/market";
import NftMarketPage from "@/pages/nft-market";
import InventoryPage from "@/pages/inventory";
import GamesPage from "@/pages/games";
import CasesPage from "@/pages/cases";
import PvpPage from "@/pages/pvp";
import SoloPage from "@/pages/solo";
import TasksPage from "@/pages/tasks";
import ProfileWithTasksPage from "@/pages/profile-with-tasks";
import LeaderboardPage from "@/pages/leaderboard";
import AdminPage from "@/pages/admin";
import { initTelegram, useTelegram } from "@/lib/telegram";
import { getDeviceId } from "@/lib/deviceId";
import { LanguageProvider } from "@/lib/LanguageContext";
import { useRegisterUser, getGetUserProfileQueryKey } from "@workspace/api-client-react";
import { SplashScreen } from "@/components/SplashScreen";
import { RocketScene } from "@/components/RocketScene";
import { OnboardingTour } from "@/components/OnboardingTour";
import { useGameStore } from "@/store/gameStore";
import { prefetchAllSectionData } from "@/lib/dataCache";

const MANIFEST_URL = typeof window !== "undefined"
  ? `${window.location.origin}/tonconnect-manifest.json`
  : "/tonconnect-manifest.json";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      gcTime: 10 * 60_000,
    },
  },
});

function BannedScreen({ reason }: { reason: string | null }) {
  return (
    <div style={{
      height: "100dvh", display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", background: "hsl(240 16% 4%)", color: "#f1f5f9",
      fontFamily: "'Space Grotesk','Inter',system-ui,sans-serif", padding: "0 32px", textAlign: "center", gap: 0,
    }}>
      <div style={{ fontSize: 64, marginBottom: 24 }}>🚫</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#f87171", marginBottom: 12 }}>Аккаунт заблокирован</div>
      <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, maxWidth: 300 }}>
        {reason || "Нарушение правил платформы."}<br /><br />
        Если это ошибка — обратитесь в поддержку.
      </div>
    </div>
  );
}

function SoftDeletedScreen() {
  return (
    <div style={{
      height: "100dvh", display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", background: "hsl(240 16% 4%)", color: "#f1f5f9",
      fontFamily: "'Space Grotesk','Inter',system-ui,sans-serif", padding: "0 32px", textAlign: "center", gap: 0,
    }}>
      <div style={{ fontSize: 64, marginBottom: 24 }}>🗑</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#94a3b8", marginBottom: 12 }}>Аккаунт деактивирован</div>
      <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, maxWidth: 300 }}>
        Ваш аккаунт был деактивирован администратором.<br /><br />
        Обратитесь в поддержку для восстановления.
      </div>
    </div>
  );
}

function panelStyle(active: boolean): CSSProperties {
  return active
    ? { display: "block", height: "100%", minHeight: 0 }
    : { display: "none" };
}

/** Keep main sections mounted so switching tabs is instant (data + DOM already warm). */
function KeepAliveMain() {
  const [loc] = useLocation();
  const path = loc.split("?")[0] || "/";
  return (
    <main style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", paddingBottom: 90 }}>
      <div style={panelStyle(path === "/" || path === "")}><HomePage /></div>
      <div style={panelStyle(path === "/market")}><MarketPage /></div>
      <div style={panelStyle(path === "/nft-market")}><NftMarketPage /></div>
      <div style={panelStyle(path === "/inventory")}><InventoryPage /></div>
      <div style={panelStyle(path === "/games")}><GamesPage /></div>
      <div style={panelStyle(path === "/cases")}><CasesPage /></div>
      <div style={panelStyle(path === "/pvp")}><PvpPage /></div>
      <div style={panelStyle(path === "/solo")}><SoloPage /></div>
      <div style={panelStyle(path === "/tasks")}><TasksPage /></div>
      <div style={panelStyle(path === "/profile")}><ProfileWithTasksPage /></div>
      <div style={panelStyle(path === "/leaderboard")}><LeaderboardPage /></div>
      <div style={panelStyle(path === "/admin")}><AdminPage /></div>
    </main>
  );
}

function AppShell() {
  const { telegramId, username, firstName, lastName, photoUrl, startParam } = useTelegram();
  const register = useRegisterUser();
  const qc = useQueryClient();
  const [blockStatus, setBlockStatus] = useState<"loading"|"ok"|"banned"|"soft_deleted">("loading");
  const [bannedReason, setBannedReason] = useState<string|null>(null);

  useEffect(() => {
    initTelegram();
  }, []);

  useEffect(() => {
    if (!telegramId) return;
    register.mutate(
      {
        data: {
          telegramId,
          username:   username   ?? undefined,
          firstName:  firstName  ?? undefined,
          lastName:   lastName   ?? undefined,
          photoUrl:   photoUrl   ?? undefined,
          referredBy: startParam ?? undefined,
          deviceId:   getDeviceId() || undefined,
        },
      },
      {
        onSuccess: (data) => {
          qc.setQueryData(getGetUserProfileQueryKey(telegramId), data);
        },
      },
    );
  }, [telegramId]);

  useEffect(() => {
    if (!telegramId) {
      setBlockStatus("ok");
      return;
    }
    fetch(`/api/mini/admin/user-status?telegramId=${telegramId}`)
      .then(r => r.json())
      .then((d: { status: string; bannedReason: string | null }) => {
        setBannedReason(d.bannedReason);
        if (d.status === "banned") setBlockStatus("banned");
        else if (d.status === "soft_deleted") setBlockStatus("soft_deleted");
        else setBlockStatus("ok");
      })
      .catch(() => setBlockStatus("ok"));
  }, [telegramId]);

  if (blockStatus === "banned") return <BannedScreen reason={bannedReason} />;
  if (blockStatus === "soft_deleted") return <SoftDeletedScreen />;

  return (
    <div style={{
      height: "100dvh",
      display: "flex",
      flexDirection: "column",
      background: "radial-gradient(circle at 50% -10%, rgba(37,99,235,0.18), transparent 55%), hsl(240 16% 4%)",
      color: "hsl(210 40% 96%)",
      fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
      position: "relative",
      maxWidth: 480,
      margin: "0 auto",
      overflow: "hidden",
    }}>
      <LanguageModal />
      <Header />
      <KeepAliveMain />
      <BottomNav />
    </div>
  );
}

type AppStage = "splash" | "rocket" | "app";

const ONBOARD_KEY = "tonyx_onboarded_v1";

function App() {
  const [stage, setStage] = useState<AppStage>("splash");
  const [whiteOpacity, setWhiteOpacity] = useState<number | null>(null);
  const [showTour, setShowTour] = useState(false);
  const needsOnboarding = useRef<boolean>(!localStorage.getItem(ONBOARD_KEY));

  // Preload game state + section data in background during SplashScreen.
  useEffect(() => {
    const t = setTimeout(() => {
      useGameStore.getState().init();
      void prefetchAllSectionData();
    }, 200);
    return () => clearTimeout(t);
  }, []);

  const handleSplashDone = useCallback(() => {
    setStage(needsOnboarding.current ? "rocket" : "app");
  }, []);

  const handleRocketDone = useCallback(() => {
    setStage("app");
    setWhiteOpacity(1);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setWhiteOpacity(0))
    );
  }, []);

  const handleOverlayEnd = useCallback(() => {
    setWhiteOpacity(null);
    if (needsOnboarding.current) setShowTour(true);
  }, []);

  const handleOnboardDone = useCallback(() => {
    localStorage.setItem(ONBOARD_KEY, "1");
    needsOnboarding.current = false;
    setShowTour(false);
  }, []);

  return (
    <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            {stage === "splash" && <SplashScreen onDone={handleSplashDone} />}
            {stage === "rocket" && <RocketScene onDone={handleRocketDone} />}
            {stage === "app" && (
              <>
                <AppShell />
                {showTour && <OnboardingTour onDone={handleOnboardDone} />}
                {whiteOpacity !== null && (
                  <div
                    style={{
                      position: "fixed",
                      inset: 0,
                      zIndex: 9999,
                      pointerEvents: "none",
                      background: "radial-gradient(circle at 50% 55%, #fff 0%, #eaf6ff 45%, #bfe2ff 100%)",
                      opacity: whiteOpacity,
                      transition: "opacity 0.85s ease",
                    }}
                    onTransitionEnd={handleOverlayEnd}
                  />
                )}
              </>
            )}
          </WouterRouter>
        </LanguageProvider>
      </QueryClientProvider>
    </TonConnectUIProvider>
  );
}

export default App;
