import { useGameStore } from "../../store/gameStore";

export default function FinishButton() {
  const hp = useGameStore((s) => s.battle.bossHpPercent);
  const finishBoss = useGameStore((s) => s.finishBoss);
  const finishBossAd = useGameStore((s) => s.finishBossAd);
  const watchAd = useGameStore((s) => s.watchAd);

  if (hp > 50) return null;

  const handleAdFinish = async () => {
    await watchAd();
    finishBossAd();
  };

  return (
    <div className="finish-btn-wrap">
      <button className="btn btn-danger" onClick={finishBoss}>
        💀 Добить босса
      </button>
      {hp <= 25 && (
        <button className="btn btn-ghost btn-sm" onClick={handleAdFinish}>
          📺 Реклама → −1% HP
        </button>
      )}
    </div>
  );
}
