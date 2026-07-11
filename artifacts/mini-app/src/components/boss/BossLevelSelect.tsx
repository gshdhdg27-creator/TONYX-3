import { useGameStore } from "../../store/gameStore";
import { BOSSES } from "../../constants/bosses";
import type { BossLevel } from "../../types/game";

const LEVELS: BossLevel[] = [1, 2, 3, 4, 5];
const NUMERALS = ["I", "II", "III", "IV", "V"];

export default function BossLevelSelect() {
  const selected = useGameStore((s) => s.selectedBossLevel);
  const selectBoss = useGameStore((s) => s.selectBoss);
  const battleActive = useGameStore((s) => s.battle.active);

  return (
    <div className="boss-levels">
      {LEVELS.map((lvl, i) => (
        <button
          key={lvl}
          className={`level-btn${selected === lvl ? " active" : ""}`}
          style={selected === lvl ? { borderColor: BOSSES[lvl].color, color: BOSSES[lvl].color } : {}}
          onClick={() => selectBoss(lvl)}
          disabled={false}
        >
          Boss {NUMERALS[i]}
        </button>
      ))}
    </div>
  );
}
