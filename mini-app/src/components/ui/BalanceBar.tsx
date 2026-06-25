import { useGameStore } from "../../store/gameStore";

export default function BalanceBar() {
  const { ton, tonyx } = useGameStore((s) => s.balances);
  return (
    <div className="top-bar">
      <div className="balance-chip">
        <span className="icon">💎</span>
        <span className="val">{ton.toFixed(3)}</span>
        <span className="sym">TON</span>
      </div>
      <div className="balance-chip">
        <span className="icon">⚡</span>
        <span className="val">{Math.floor(tonyx).toLocaleString()}</span>
        <span className="sym">TONYX</span>
      </div>
    </div>
  );
}
