import { useEffect } from "react";
import { useGameStore } from "@/store/gameStore";
import { useTelegram } from "@/lib/telegram";
import { useGetUserProfile } from "@workspace/api-client-react";
import HomeScreen from "@/components/HomeScreen";
import ChestScreen from "@/components/chest/ChestScreen";
import CollectionScreen from "@/components/collection/CollectionScreen";
import HeroShopScreen from "@/components/hero-shop/HeroShopScreen";
import LoadingScreen from "@/components/ui/LoadingScreen";
import { useBattleLoop } from "@/hooks/useBattleLoop";
import { useBossAnimation } from "@/hooks/useBossAnimation";
import "@/styles/game.css";

export default function HomePage() {
  // Battle loop and boss animation run here so they work regardless of sub-view
  useBattleLoop();
  useBossAnimation();

  const view = useGameStore((s) => s.view);
  const init = useGameStore((s) => s.init);
  const setTonBalance = useGameStore((s) => s.setTonBalance);
  const setTonyxBalance = useGameStore((s) => s.setTonyxBalance);
  const markTonInitialized = useGameStore((s) => s.markTonInitialized);

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

  useEffect(() => {
    const t = setTimeout(() => init(), 500);
    return () => clearTimeout(t);
  }, [init]);

  return (
    <>
      {view === "loading" && <LoadingScreen />}
      {view === "home" && <HomeScreen />}
      {view === "chest" && <ChestScreen />}
      {view === "collection" && <CollectionScreen />}
      {view === "hero-shop" && <HeroShopScreen />}
    </>
  );
}
