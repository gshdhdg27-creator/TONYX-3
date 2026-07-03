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

  const { telegramId } = useTelegram();
  const { data: profile } = useGetUserProfile(telegramId ?? "", {
    query: { enabled: !!telegramId, refetchInterval: 30000 },
  } as Parameters<typeof useGetUserProfile>[1]);

  // Sync real TON balance from backend into game store
  useEffect(() => {
    const ton = Number((profile as { ton?: string | number } | undefined)?.ton ?? 0);
    if (ton > 0) setTonBalance(ton);
  }, [profile, setTonBalance]);

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
