import { useEffect } from "react";
import { useGameStore } from "@/store/gameStore";
import { useTelegram } from "@/lib/telegram";
import { useGetUserProfile } from "@workspace/api-client-react";
import HomeScreen from "@/components/HomeScreen";
import ChestScreen from "@/components/chest/ChestScreen";
import CollectionScreen from "@/components/collection/CollectionScreen";
import HeroShopScreen from "@/components/hero-shop/HeroShopScreen";
import { useBattleLoop } from "@/hooks/useBattleLoop";
import { useBossAnimation } from "@/hooks/useBossAnimation";
import { loadLiveGameConfig } from "@/lib/liveGameConfig";
import "@/styles/game.css";

export default function HomePage() {
  // Battle loop and boss animation run here so they work regardless of sub-view
  useBattleLoop();
  useBossAnimation();

  const view = useGameStore((s) => s.view);
  const setView = useGameStore((s) => s.setView);

  // Instant section switch — no artificial delay
  useEffect(() => {
    const apply = () => {
      const open = sessionStorage.getItem("tonyx-open");
      if (open !== "bosses" && open !== "cards" && open !== "collection") return;
      sessionStorage.removeItem("tonyx-open");
      if (open === "bosses") setView("home");
      if (open === "cards") setView("hero-shop");
      if (open === "collection") setView("collection");
    };
    apply();
    window.addEventListener("tonyx-open", apply);
    return () => window.removeEventListener("tonyx-open", apply);
  }, [setView]);

  const setTonBalance = useGameStore((s) => s.setTonBalance);
  const setTonyxBalance = useGameStore((s) => s.setTonyxBalance);
  const markTonInitialized = useGameStore((s) => s.markTonInitialized);
  const bumpConfigVersion = useGameStore((s) => s.bumpConfigVersion);
  // Force a re-render once config loads so subscribers see it
  useGameStore((s) => s.configVersion);

  const { telegramId } = useTelegram();
  const { data: profile } = useGetUserProfile(telegramId ?? "", {
    query: {
      enabled: !!telegramId,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  } as Parameters<typeof useGetUserProfile>[1]);

  // Sync TON + TONYX balances from backend on every profile load
  useEffect(() => {
    if (!profile) return;
    const rawTon = (profile as { ton?: string | number }).ton;
    const ton = Number(rawTon ?? 0);
    const rawTonyx = (profile as { tonyxCoins?: number }).tonyxCoins;
    const tonyx = Number(rawTonyx ?? 0);
    if (Number.isFinite(ton) && ton >= 0) setTonBalance(ton);
    if (Number.isFinite(tonyx) && tonyx >= 0) setTonyxBalance(tonyx);
    markTonInitialized();
  }, [profile, setTonBalance, setTonyxBalance, markTonInitialized]);

  // init() is called early from App.tsx during SplashScreen.
  // Do NOT call it again here.

  // Admin-configured boss HP / revive / boost % — background, no UI block
  useEffect(() => {
    loadLiveGameConfig().then(() => bumpConfigVersion());
  }, [bumpConfigVersion]);

  return (
    <>
      {/* Never show Boss Dogg Loading after Splash — view starts as "home" and init runs in background */}
      {(view === "home" || view === "loading") && <HomeScreen />}
      {view === "chest" && <ChestScreen />}
      {view === "collection" && <CollectionScreen />}
      {view === "hero-shop" && <HeroShopScreen />}
    </>
  );
}
