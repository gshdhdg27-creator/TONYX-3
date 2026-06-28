interface HpBarProps {
  hp: number;       // 0–100 percent
  maxHp: number;    // actual max HP value
  bossName: string;
  showLabel?: boolean;
}

function fmtHp(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(Math.round(n));
}

export default function HpBar({ hp, maxHp, bossName, showLabel = true }: HpBarProps) {
  const pct = Math.max(0, Math.min(100, hp));
  const isLow = pct <= 50;
  const currentHp = Math.round((pct / 100) * maxHp);
  return (
    <div className="hp-bar-wrap">
      {showLabel && (
        <div className="hp-label">
          <span>{bossName}</span>
          <span>{fmtHp(currentHp)} / {fmtHp(maxHp)} HP</span>
        </div>
      )}
      <div className="hp-bar-track">
        <div className={`hp-bar-fill${isLow ? " low" : ""}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
