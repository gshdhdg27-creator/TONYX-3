import { useEffect } from "react";
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

const MANIFEST_URL = typeof window !== "undefined"
  ? `${window.location.origin}/tonconnect-manifest.json`
  : "/tonconnect-manifest.json";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

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

  if (!isInTelegram || !telegramId) {
    return <TelegramOnlyScreen />;
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

function App() {
  return (
    <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppShell />
          </WouterRouter>
        </LanguageProvider>
      </QueryClientProvider>
    </TonConnectUIProvider>
  );
}

export default App;
