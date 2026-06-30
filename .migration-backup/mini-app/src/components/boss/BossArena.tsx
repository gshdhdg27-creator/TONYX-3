import { useGameStore } from "../../store/gameStore";
import { BOSSES } from "../../constants/bosses";

import shadowDogg  from "@assets/v4d96_1782562379031.jpg";
import rageDogg    from "@assets/E0PG6_1782562379030.jpg";
import infernoDogg from "@assets/N9BAm_1782562379029.jpg";
import stormDogg   from "@assets/W1jh3_1782562379027.jpg";
import bossDoggPrime from "@assets/Hshpb_1782562379024.jpg";

const BOSS_IMAGES: Record<number, string> = {
  1: shadowDogg,
  2: rageDogg,
  3: infernoDogg,
  4: stormDogg,
  5: bossDoggPrime,
};

export default function BossArena() {
  const bossLevel = useGameStore((s) => s.selectedBossLevel);
  const bossAnimState = useGameStore((s) => s.bossAnimState);
  const boss = BOSSES[bossLevel];

  return (
    <div className="boss-arena">
      <div
        className="boss-glow"
        style={{ background: `radial-gradient(ellipse at 50% 60%, ${boss.color}33 0%, transparent 70%)` }}
      />
      <div className="boss-name">{boss.name}</div>
      <img
        className="boss-img"
        src={BOSS_IMAGES[bossLevel]}
        alt={boss.name}
        data-state={bossAnimState}
        style={{ filter: `drop-shadow(0 0 28px ${boss.color}aa)` }}
      />
    </div>
  );
}
