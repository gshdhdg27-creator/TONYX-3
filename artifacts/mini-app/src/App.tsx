import { useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Switch, Route, Router as WouterRouter } from "wouter";
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

const MANIFEST_URL = typeof window !== "undefined"
  ? `${window.location.origin}/tonconnect-manifest.json`
  : "/tonconnect-manifest.json";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
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

type BlockStatus = "loading" | "ok" | "banned" | "soft_deleted";

function AppShell({
  initialBlockStatus,
  initialBannedReason,
}: {
  initialBlockStatus: BlockStatus;
  initialBannedReason: string | null;
}) {
  const { telegramId, username, firstName, lastName, photoUrl, startParam } = useTelegram();
  const register = useRegisterUser();
  const qc = useQueryClient();
  // Already resolved during Splash — no second spinner
  const [blockStatus] = useState<BlockStatus>(
    initialBlockStatus === "loading" ? "ok" : initialBlockStatus
  );
  const [bannedReason] = useState<string | null>(initialBannedReason);

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
      <main style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", paddingBottom: 90 }}>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/market" component={MarketPage} />
          <Route path="/nft-market" component={NftMarketPage} />
          <Route path="/inventory" component={InventoryPage} />
          <Route path="/games" component={GamesPage} />
          <Route path="/cases" component={CasesPage} />
          <Route path="/pvp" component={PvpPage} />
          <Route path="/solo" component={SoloPage} />
          <Route path="/tasks" component={TasksPage} />
          <Route path="/profile" component={ProfileWithTasksPage} />
          <Route path="/leaderboard" component={LeaderboardPage} />
          <Route path="/admin" component={AdminPage} />
        </Switch>
      </main>
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

  // Critical data resolved during Splash so AppShell never shows a spinner
  const [blockStatus, setBlockStatus] = useState<BlockStatus>("loading");
  const [bannedReason, setBannedReason] = useState<string | null>(null);
  const criticalReady = useRef(false);
  const splashDone = useRef(false);

  // === BACKGROUND PRELOAD WHILE SPLASH PLAYS ===
  useEffect(() => {
    // 1) Game state immediately → view becomes "home", no Boss Dogg Loading
    useGameStore.getState().init();

    // 2) Telegram + ban check in parallel
    const run = async () => {
      try {
        initTelegram();
        const tg = (window as any).Telegram?.WebApp;
        const telegramId = tg?.initDataUnsafe?.user?.id
          ? String(tg.initDataUnsafe.user.id)
          : null;

        if (!telegramId) {
          setBlockStatus("ok");
          criticalReady.current = true;
          tryAdvance();
          return;
        }

        const res = await fetch(`/api/mini/admin/user-status?telegramId=${telegramId}`);
        const d = (await res.json()) as { status: string; bannedReason: string | null };
        setBannedReason(d.bannedReason ?? null);
        if (d.status === "banned") setBlockStatus("banned");
        else if (d.status === "soft_deleted") setBlockStatus("soft_deleted");
        else setBlockStatus("ok");
      } catch {
        setBlockStatus("ok");
      } finally {
        criticalReady.current = true;
        tryAdvance();
      }
    };

    const t = setTimeout(run, 80);
    return () => clearTimeout(t);
  }, []);

  function tryAdvance() {
    if (!splashDone.current || !criticalReady.current) return;
    setStage(needsOnboarding.current ? "rocket" : "app");
  }

  const handleSplashDone = useCallback(() => {
    splashDone.current = true;
    // If network already finished → go straight to app/rocket
    // If not yet → wait a bit more (tryAdvance called from fetch finally)
    if (criticalReady.current) {
      setStage(needsOnboarding.current ? "rocket" : "app");
    } else {
      // Safety: never stick on splash more than ~1.2s extra
      setTimeout(() => {
        criticalReady.current = true;
        if (blockStatus === "loading") setBlockStatus("ok");
        setStage(needsOnboarding.current ? "rocket" : "app");
      }, 1200);
    }
  }, [blockStatus]);

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
                <AppShell
                  initialBlockStatus={blockStatus}
                  initialBannedReason={bannedReason}
                />
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
