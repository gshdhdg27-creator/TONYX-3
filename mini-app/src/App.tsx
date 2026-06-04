import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BottomNav from "@/components/bottom-nav";
import LanguageModal from "@/components/LanguageModal";
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

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function AppShell() {
  const { telegramId, username, firstName, lastName, photoUrl, startParam } = useTelegram();
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
      {/* Language selection modal — shown only on first launch */}
      <LanguageModal />

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
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppShell />
        </WouterRouter>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
