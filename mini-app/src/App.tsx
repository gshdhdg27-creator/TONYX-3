import { useEffect, useState, useCallback } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import BottomNav from "@/components/bottom-nav";
import LanguageModal from "@/components/LanguageModal";
import Header from "@/components/Header";
import HomePage from "@/pages/home";
import MarketPage from "@/pages/market";
import GamesPage from "@/pages/games";
import TasksPage from "@/pages/tasks";
import ProfilePage from "@/pages/profile";
import LeaderboardPage from "@/pages/leaderboard";
import AdminPage from "@/pages/admin";
import { initTelegram, useTelegram } from "@/lib/telegram";
import { LanguageProvider } from "@/lib/LanguageContext";
import { useRegisterUser } from "@workspace/api-client-react";
import { SplashScreen } from "@/components/SplashScreen";
import { RocketScene } from "@/components/RocketScene";
import { OnboardingTour } from "@/components/OnboardingTour";

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

function TelegramOnlyScreen() {
  return (
    <div style={{
      height: "100dvh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "radial-gradient(circle at 50% -10%, rgba(37,99,235,0.18), transparent 55%), hsl(240 16% 4%)",
      color: "hsl(210 40% 96%)",
      fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
      padding: "0 32px",
      textAlign: "center",
      gap: 0,
    }}>
      <div style={{ fontSize: 64, marginBottom: 24 }}>✈️</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#f1f5f9", marginBottom: 12 }}>
        Откройте в Telegram
      </div>
      <div style={{ fontSize: 14, color: "#475569", lineHeight: 1.6, maxWidth: 300 }}>
        Это приложение работает только внутри официального Telegram WebApp.
        Пожалуйста, запустите его через бота в Telegram.
      </div>
      <div style={{ marginTop: 32, padding: "12px 28px", borderRadius: 14, background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.35)", fontSize: 13, color: "#60a5fa", fontWeight: 700 }}>
        @TONYX_Bot
      </div>
    </div>
  );
}

function AppShell() {
  const { telegramId, isInTelegram, username, firstName, lastName, photoUrl, startParam } = useTelegram();
  const register = useRegisterUser();
  const [blockStatus, setBlockStatus] = useState<"loading"|"ok"|"banned"|"soft_deleted">("loading");
  const [bannedReason, setBannedReason] = useState<string|null>(null);

  useEffect(() => {
    initTelegram();
  }, []);

  useEffect(() => {
    if (telegramId) {
      register.mutate({
        data: {
          telegramId,
          username: username ?? undefined,
          firstName: firstName ?? undefined,
          lastName: lastName ?? undefined,
          photoUrl: photoUrl ?? undefined,
          referredBy: startParam ?? undefined,
        },
      });
    }
  }, [telegramId]);

  useEffect(() => {
    if (!telegramId) return;
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

  if (!isInTelegram || !telegramId) {
    return <TelegramOnlyScreen />;
  }

  if (blockStatus === "banned") return <BannedScreen reason={bannedReason} />;
  if (blockStatus === "soft_deleted") return <SoftDeletedScreen />;
  if (blockStatus === "loading") {
    return (
      <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "hsl(240 16% 4%)" }}>
        <div style={{ width: 32, height: 32, border: "3px solid rgba(99,102,241,0.3)", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

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
      <main style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingBottom: 74 }}>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/market" component={MarketPage} />
          <Route path="/games" component={GamesPage} />
          <Route path="/tasks" component={TasksPage} />
          <Route path="/profile" component={ProfilePage} />
          <Route path="/leaderboard" component={LeaderboardPage} />
          <Route path="/admin" component={AdminPage} />
        </Switch>
      </main>
      <BottomNav />
    </div>
  );
}

type AppStage = "splash" | "rocket" | "onboarding" | "app";

const ONBOARD_KEY = "tonyx_onboarded_v1";

function App() {
  const [stage, setStage] = useState<AppStage>("splash");

  const handleSplashDone = useCallback(() => {
    const done = localStorage.getItem(ONBOARD_KEY);
    setStage(done ? "app" : "rocket");
  }, []);

  const handleRocketDone = useCallback(() => {
    setStage("onboarding");
  }, []);

  const handleOnboardDone = useCallback(() => {
    localStorage.setItem(ONBOARD_KEY, "1");
    setStage("app");
  }, []);

  return (
    <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            {stage === "splash" && <SplashScreen onDone={handleSplashDone} />}
            {stage === "rocket" && <RocketScene onDone={handleRocketDone} />}
            {stage === "onboarding" && <OnboardingTour onDone={handleOnboardDone} />}
            {stage === "app" && <AppShell />}
          </WouterRouter>
        </LanguageProvider>
      </QueryClientProvider>
    </TonConnectUIProvider>
  );
}

export default App;
