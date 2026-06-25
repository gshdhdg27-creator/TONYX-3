import type { OwnedMage } from "../../types/game";
import { getMageDps } from "../../constants/mages";
import { useGameStore } from "../../store/gameStore";

interface MageSlotProps {
  mage?: OwnedMage;
  isEmpty?: boolean;
}

export default function MageSlot({ mage, isEmpty }: MageSlotProps) {
  const activeMageIds = useGameStore((s) => s.activeMageIds);
  const toggleMage = useGameStore((s) => s.toggleMage);

  if (isEmpty || !mage) {
    return <div className="mage-slot empty"><span className="ms-emoji">＋</span></div>;
  }

  const isActive = activeMageIds.includes(mage.id);
  const dps = getMageDps(mage);

  return (
    <div className={`mage-slot${isActive ? " active" : ""}`} onClick={() => toggleMage(mage.id)}>
      <span className="ms-lvl">L{mage.level}</span>
      <span className="ms-emoji">{mage.emoji}</span>
      <span className="ms-name">{mage.name.slice(0, 4)}</span>
      <span className="ms-dps">{dps}/s</span>
    </div>
  );
}
