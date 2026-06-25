import { useEffect, useRef } from "react";
import { useGameStore } from "../store/gameStore";
import { BOSS_ANIM_STATES, BOSS_ANIM_MIN, BOSS_ANIM_MAX } from "../constants/bosses";
import type { BossAnimState } from "../types/game";

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomState(current: BossAnimState): BossAnimState {
  const others = BOSS_ANIM_STATES.filter((s) => s !== current);
  return others[Math.floor(Math.random() * others.length)];
}

export function useBossAnimation() {
  const battleActive = useGameStore((s) => s.battle.active);
  const bossAnimState = useGameStore((s) => s.bossAnimState);
  const setBossAnimState = useGameStore((s) => s.setBossAnimState);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!battleActive) {
      setBossAnimState("idle");
      return;
    }
    const schedule = () => {
      const delay = randomBetween(BOSS_ANIM_MIN, BOSS_ANIM_MAX) * 1000;
      timeoutRef.current = setTimeout(() => {
        const next = randomState(bossAnimState);
        setBossAnimState(next);
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [battleActive]); // eslint-disable-line react-hooks/exhaustive-deps
}
