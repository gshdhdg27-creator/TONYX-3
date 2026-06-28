import { useEffect } from "react";
import { useGameStore } from "@/store/gameStore";
import HomeScreen from "@/components/HomeScreen";
import SectionBar from "@/components/ui/SectionBar";
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
      <SectionBar gradient="linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)" />
      {view === "loading" && <LoadingScreen />}
      {view === "home" && <HomeScreen />}
      {view === "battle" && <BattleScreen />}
      {view === "chest" && <ChestScreen />}
      {view === "collection" && <CollectionScreen />}
    </>
  );
}
