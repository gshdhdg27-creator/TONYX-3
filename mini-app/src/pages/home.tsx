import { useEffect } from "react";
import { useGameStore } from "@/store/gameStore";
import HomeScreen from "@/components/HomeScreen";
import BattleScreen from "@/components/battle/BattleScreen";
import ChestScreen from "@/components/chest/ChestScreen";
import CollectionScreen from "@/components/collection/CollectionScreen";
import LoadingScreen from "@/components/ui/LoadingScreen";
import "@/styles/game.css";

export default function HomePage() {
  const view = useGameStore((s) => s.view);
  const init = useGameStore((s) => s.init);

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
    </>
  );
}
