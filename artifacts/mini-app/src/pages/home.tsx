import { useEffect } from "react";
import { useGameStore } from "@/store/gameStore";
import { useTelegram } from "@/lib/telegram";
import { useGetUserProfile } from "@workspace/api-client-react";
import HomeScreen from "@/components/HomeScreen";
import BattleScreen from "@/components/battle/BattleScreen";
import ChestScreen from "@/components/chest/ChestScreen";
import CollectionScreen from "@/components/collection/CollectionScreen";
import HeroShopScreen from "@/components/hero-shop/HeroShopScreen";
import LoadingScreen from "@/components/ui/LoadingScreen";
import "@/styles/game.css";

export default function HomePage() {
  const view = useGameStore((s) => s.view);
  const init = useGameStore((s) => s.init);
  const setTonBalance = useGameStore((s) => s.setTonBalance);
  const markTonInitialized = useGameStore((s) => s.markTonInitialized);
  const hasInitializedTonFromBackend = useGameStore((s) => s.hasInitializedTonFromBackend);

  const { telegramId } = useTelegram();
  const { data: profile } = useGetUserProfile(telegramId ?? "", {
    // Fetch once; disable periodic re-fetches so backend doesn't overwrite in-game spend
    query: {
      enabled: !!telegramId && !hasInitializedTonFromBackend,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  } as Parameters<typeof useGetUserProfile>[1]);

  // Sync real TON balance from backend — only once, on first successful profile load
  useEffect(() => {
    if (!profile || hasInitializedTonFromBackend) return;
    const raw = (profile as { ton?: string | number } | undefined)?.ton;
    const ton = Number(raw ?? 0);
    if (Number.isFinite(ton) && ton >= 0) {
      setTonBalance(ton);
      markTonInitialized();
    }
  }, [profile, hasInitializedTonFromBackend, setTonBalance, markTonInitialized]);

  useEffect(() => {
    const t = setTimeout(() => init(), 500);
    return () => clearTimeout(t);
  }, [init]);

  return (
    <>
      {view === "loading" && <LoadingScreen />}
      {view === "home" && <HomeScreen />}
      {view === "battle" && <BattleScreen />}
      {view === "chest" && <ChestScreen />}
      {view === "collection" && <CollectionScreen />}
      {view === "hero-shop" && <HeroShopScreen />}
    </>
  );
}
