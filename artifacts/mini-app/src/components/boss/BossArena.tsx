import { useGameStore } from "../../store/gameStore";
import { BOSSES } from "../../constants/bosses";

import shadowDogg    from "@assets/v4d96_1782562379031.jpg";
import rageDogg      from "@assets/E0PG6_1782562379030.jpg";
import infernoDogg   from "@assets/N9BAm_1782562379029.jpg";
import stormDogg     from "@assets/W1jh3_1782562379027.jpg";
import bossDoggPrime from "@assets/Hshpb_1782562379024.jpg";

const BOSS_IMAGES: Record<number, string> = {
  1: shadowDogg,
  2: rageDogg,
  3: infernoDogg,
  4: stormDogg,
  5: bossDoggPrime,
};

export default function BossArena() {
  const bossLevel     = useGameStore((s) => s.selectedBossLevel);
  const bossAnimState = useGameStore((s) => s.bossAnimState);
  const bossRespawnAt = useGameStore((s) => s.bossRespawnAt);
  const boss          = BOSSES[bossLevel];

  const respawnTs  = bossRespawnAt[bossLevel];
  const bossIsDead = !!(respawnTs && Date.now() < respawnTs);

  return (
    <div className="boss-arena">
      <div
        className="boss-glow"
        style={{
          background: bossIsDead
            ? "radial-gradient(ellipse at 50% 60%, rgba(80,0,0,0.4) 0%, transparent 70%)"
            : `radial-gradient(ellipse at 50% 60%, ${boss.color}33 0%, transparent 70%)`,
        }}
      />
      <div className="boss-name" style={bossIsDead ? { color: "#f87171", opacity: 0.7 } : {}}>
        {boss.name}{bossIsDead ? " 💀" : ""}
      </div>
      <img
        className="boss-img"
        src={BOSS_IMAGES[bossLevel]}
        alt={boss.name}
        data-state={bossIsDead ? "idle" : bossAnimState}
        style={{
          filter: bossIsDead
            ? "grayscale(1) brightness(0.35) drop-shadow(0 0 18px rgba(150,0,0,0.6))"
            : `drop-shadow(0 0 28px ${boss.color}aa)`,
          opacity: bossIsDead ? 0.6 : 1,
        }}
      />
    </div>
  );
}
