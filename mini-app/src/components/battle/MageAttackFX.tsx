import { useEffect, useState, useRef } from "react";
import { useGameStore } from "../../store/gameStore";
import { getMageDps } from "../../constants/mages";

interface FxParticle {
  id: number;
  emoji: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: string;
}

const TYPE_FX: Record<string, string> = {
  fire: "🔥",
  ice: "❄️",
  lightning: "⚡",
  wind: "🌀",
};

let _id = 0;

export default function MageAttackFX() {
  const battleActive = useGameStore((s) => s.battle.active);
  const ownedMages = useGameStore((s) => s.ownedMages);
  const activeMageIds = useGameStore((s) => s.activeMageIds);
  const speedMultiplier = useGameStore((s) => s.boost.speedMultiplier);

  const [particles, setParticles] = useState<FxParticle[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!battleActive) { setParticles([]); return; }
    const activeMages = ownedMages.filter((m) => activeMageIds.includes(m.id));
    const spawnRate = Math.max(300, 800 / speedMultiplier);

    intervalRef.current = setInterval(() => {
      if (activeMages.length === 0) return;
      const mage = activeMages[Math.floor(Math.random() * activeMages.length)];
      const dps = getMageDps(mage);
      if (dps <= 0) return;
      const px = 20 + Math.random() * 60;
      const py = 70 + Math.random() * 20;
      const p: FxParticle = {
        id: _id++,
        emoji: TYPE_FX[mage.type] ?? "✨",
        x: px, y: py,
        dx: (Math.random() - 0.5) * 40,
        dy: -(30 + Math.random() * 40),
        color: mage.attackColor,
      };
      setParticles((prev) => [...prev.slice(-12), p]);
      setTimeout(() => { setParticles((prev) => prev.filter((x) => x.id !== p.id)); }, 700);
    }, spawnRate);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [battleActive, activeMageIds, speedMultiplier]); // eslint-disable-line

  return (
    <div className="battle-fx-layer">
      {particles.map((p) => (
        <span
          key={p.id}
          className="attack-fx"
          style={{ left: `${p.x}%`, top: `${p.y}%`, "--fx-dx": `${p.dx}px`, "--fx-dy": `${p.dy}px` } as React.CSSProperties}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}
