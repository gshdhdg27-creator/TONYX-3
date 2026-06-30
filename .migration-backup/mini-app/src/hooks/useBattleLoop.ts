import { useEffect, useRef } from "react";
import { useGameStore } from "../store/gameStore";

const TICK_MS = 100;

export function useBattleLoop() {
  const battleActive = useGameStore((s) => s.battle.active);
  const tickBattle = useGameStore((s) => s.tickBattle);
  const lastTickRef = useRef<number>(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!battleActive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    lastTickRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;
      tickBattle(delta);
    }, TICK_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [battleActive, tickBattle]);
}
