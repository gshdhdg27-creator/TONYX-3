import { useGameStore } from "../../store/gameStore";
import { BOSSES } from "../../constants/bosses";

const BOSS_EMOJIS: Record<number, string> = {
  1: "🐶",
  2: "🐕",
  3: "🦊",
  4: "🐺",
  5: "👹",
};

export default function BossArena() {
  const bossLevel = useGameStore((s) => s.selectedBossLevel);
  const bossAnimState = useGameStore((s) => s.bossAnimState);
  const boss = BOSSES[bossLevel];

  return (
    <div className="boss-arena">
      <div
        className="boss-glow"
        style={{ background: `radial-gradient(ellipse at 50% 60%, ${boss.color}22 0%, transparent 70%)` }}
      />
      <div
        className="boss-emoji"
        data-state={bossAnimState}
        style={{ filter: `drop-shadow(0 0 20px ${boss.color}88)` }}
      >
        {BOSS_EMOJIS[bossLevel]}
      </div>
      <div className="boss-name">{boss.name}</div>
    </div>
  );
}
