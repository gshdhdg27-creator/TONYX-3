import { useGameStore } from "../store/gameStore";
import { BOSSES } from "../constants/bosses";
import BalanceBar from "./ui/BalanceBar";
import BossLevelSelect from "./boss/BossLevelSelect";
import BossArena from "./boss/BossArena";
import HpBar from "./ui/HpBar";
import MageSlot from "./ui/MageSlot";

export default function HomeScreen() {
  const bossLevel = useGameStore((s) => s.selectedBossLevel);
  const ownedMages = useGameStore((s) => s.ownedMages);
  const activeMageIds = useGameStore((s) => s.activeMageIds);
  const totalDps = useGameStore((s) => s.battle.totalDps);
  const boost = useGameStore((s) => s.boost);
  const startBattle = useGameStore((s) => s.startBattle);
  const setView = useGameStore((s) => s.setView);
  const watchAd = useGameStore((s) => s.watchAd);

  const boss = BOSSES[bossLevel];
  const canStart = activeMageIds.length > 0;
  const slots = Array.from({ length: 5 }, (_, i) => ownedMages[i] ?? null);
  const boostActive = boost.boostExpiresAt !== null && Date.now() < boost.boostExpiresAt;

  return (
    <div className="game-root">
      <BalanceBar />
      <BossLevelSelect />
      <BossArena />
      <div style={{ padding: "4px 16px 2px" }}>
        <HpBar hp={100} bossName={boss.name} />
      </div>
      <div className="dps-display">
        ⚔️ <span>{totalDps.toLocaleString()}</span> DPS
        {boostActive && (
          <span className="tag tag-boost" style={{ marginLeft: 8 }}>+20% BOOST</span>
        )}
      </div>
      <div className="mage-slots">
        {slots.map((mage, i) =>
          mage ? (
            <MageSlot key={mage.id} mage={mage} />
          ) : (
            <MageSlot key={`empty-${i}`} isEmpty />
          )
        )}
      </div>
      {!boostActive && (
        <div style={{ padding: "0 16px 2px", fontSize: 11, color: "var(--game-text3)", textAlign: "center" }}>
          📺 {boost.adWatchedCount}/10 реклам → +20% DPS на 24ч
        </div>
      )}
      <div className="action-panel">
        <button className="btn btn-primary" style={{ flex: 2 }} onClick={startBattle} disabled={!canStart}>
          ⚔️ Начать бой
        </button>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setView("collection")}>
          🏆 NFT
        </button>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={watchAd}>
          📺
        </button>
      </div>
    </div>
  );
}
