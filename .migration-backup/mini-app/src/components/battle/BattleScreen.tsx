import { useBattleLoop } from "../../hooks/useBattleLoop";
import { useBossAnimation } from "../../hooks/useBossAnimation";
import { useGameStore } from "../../store/gameStore";
import { BOSSES } from "../../constants/bosses";
import HpBar from "../ui/HpBar";
import BossArena from "../boss/BossArena";
import MageAttackFX from "./MageAttackFX";
import FinishButton from "./FinishButton";

export default function BattleScreen() {
  useBattleLoop();
  useBossAnimation();

  const bossLevel = useGameStore((s) => s.selectedBossLevel);
  const hp = useGameStore((s) => s.battle.bossHpPercent);
  const dps = useGameStore((s) => s.battle.totalDps);
  const resetBattle = useGameStore((s) => s.resetBattle);
  const boss = BOSSES[bossLevel];

  return (
    <div className="battle-screen">
      {/* Spacer so fixed Header doesn't overlap content */}
      <div style={{ height: 56, flexShrink: 0 }} />

      <div style={{ padding: "6px 16px 6px" }}>
        <HpBar hp={hp} maxHp={boss.maxHp} bossName={boss.name} />
      </div>
      <div className="dps-display">
        ⚔️ <span>{dps.toLocaleString()}</span> DPS
      </div>
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <BossArena />
        <MageAttackFX />
        <FinishButton />
      </div>
      <div style={{ padding: "0 16px 16px", flexShrink: 0 }}>
        <button className="btn btn-ghost btn-full btn-sm" onClick={resetBattle}>
          ← Отступить
        </button>
      </div>
    </div>
  );
}
