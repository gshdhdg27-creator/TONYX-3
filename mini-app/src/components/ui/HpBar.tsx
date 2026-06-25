interface HpBarProps {
  hp: number;
  bossName: string;
  showLabel?: boolean;
}

export default function HpBar({ hp, bossName, showLabel = true }: HpBarProps) {
  const pct = Math.max(0, Math.min(100, hp));
  const isLow = pct <= 50;
  return (
    <div className="hp-bar-wrap">
      {showLabel && (
        <div className="hp-label">
          <span>{bossName}</span>
          <span>{pct.toFixed(1)}% HP</span>
        </div>
      )}
      <div className="hp-bar-track">
        <div className={`hp-bar-fill${isLow ? " low" : ""}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
