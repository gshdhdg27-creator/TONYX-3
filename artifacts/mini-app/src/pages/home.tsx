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
  useBattleLoop();
  useBossAnimation();

  const view = useGameStore((s) => s.view);
  const setView = useGameStore((s) => s.setView);

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
  useGameStore((s) => s.configVersion);

  const { telegramId } = useTelegram();
  const { data: profile } = useGetUserProfile(telegramId ?? "", {
    query: {
      enabled: !!telegramId,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  } as Parameters<typeof useGetUserProfile>[1]);

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
    loadLiveGameConfig().then(() => bumpConfigVersion());
  }, [bumpConfigVersion]);

  return (
    <>
      {(view === "home" || view === "loading") && <HomeScreen />}
      {view === "chest" && <ChestScreen />}
      {view === "collection" && <CollectionScreen />}
      {view === "hero-shop" && <HeroShopScreen />}
    </>
  );
}
