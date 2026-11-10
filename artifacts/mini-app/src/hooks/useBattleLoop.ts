import { useEffect, useRef } from "react";
import { useGameStore } from "../store/gameStore";
import { battleApi } from "../lib/battleApi";

const TICK_MS = 100;
const SERVER_SYNC_MS = 5000;

/**
 * Battle HP is driven by server-anchored time (performance.now + offset).
 * Client wall-clock Date.now() is never used for damage — changing phone
 * time cannot accelerate the kill.
 */
export function useBattleLoop() {
  const battleActive = useGameStore((s) => s.battle.active);
  const tickBattle = useGameStore((s) => s.tickBattle);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!battleActive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (syncRef.current) {
        clearInterval(syncRef.current);
        syncRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      // delta ignored — tickBattle recomputes HP from server elapsed
      tickBattle(TICK_MS);
    }, TICK_MS);

    // Periodic correction from server clock
    const sync = async () => {
      try {
        const prog = await battleApi.progress();
        const st = useGameStore.getState();
        if (typeof prog.serverNow === "number") {
          useGameStore.setState({
            serverTimeOffsetMs: prog.serverNow - performance.now(),
          });
        }
        if (!prog.active) {
          if (st.battle.active && !st.claiming) {
            void st.finishBoss();
          }
          return;
        }
        if (prog.bossHpPercent != null) {
          useGameStore.setState({
            battle: {
              ...st.battle,
              active: true,
              bossHpPercent: prog.bossHpPercent,
              totalDps: prog.totalDps ?? st.battle.totalDps,
            },
            bossMaxHp: prog.bossMaxHp ?? st.bossMaxHp,
            requiredSec: prog.requiredSec ?? st.requiredSec,
            battleStartedAtServer: prog.startedAt
              ? new Date(prog.startedAt).getTime()
              : st.battleStartedAtServer,
            activeBattleId: prog.battleId ?? st.activeBattleId,
          });
          if (prog.canClaim && prog.bossHpPercent <= 0) {
            void useGameStore.getState().finishBoss();
          }
        }
      } catch {
        /* network blip — local estimate continues */
      }
    };
    void sync();
    syncRef.current = setInterval(sync, SERVER_SYNC_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (syncRef.current) clearInterval(syncRef.current);
      intervalRef.current = null;
      syncRef.current = null;
    };
  }, [battleActive, tickBattle]);
}
