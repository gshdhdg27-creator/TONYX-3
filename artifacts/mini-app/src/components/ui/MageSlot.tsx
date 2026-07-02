import type { OwnedMage } from "../../types/game";

interface MageSlotProps {
  mage?: OwnedMage | null;
  isEmpty?: boolean;
  slotIndex: number;
  onClick: (index: number) => void;
}

export default function MageSlot({ mage, isEmpty, slotIndex, onClick }: MageSlotProps) {
  if (isEmpty || !mage) {
    return (
      <div className="mage-slot empty" onClick={() => onClick(slotIndex)}>
        <span className="ms-plus">＋</span>
      </div>
    );
  }

  return (
    <div className="mage-slot filled" onClick={() => onClick(slotIndex)}>
      {/* Card image sits inside the frame with inset padding */}
      <div className="mage-slot-img-wrap">
        {mage.image ? (
          <img
            src={mage.image}
            alt={mage.name}
            className="mage-slot-img"
          />
        ) : (
          <span className="ms-emoji">{mage.emoji}</span>
        )}
      </div>
      {/* Only level badge — no DPS text */}
      <span className="ms-lvl">L{mage.level}</span>
    </div>
  );
}
