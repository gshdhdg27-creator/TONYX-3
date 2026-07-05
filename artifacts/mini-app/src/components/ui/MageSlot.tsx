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
    <div className="mage-slot filled" data-rarity={mage.rarity} onClick={() => onClick(slotIndex)}>
      {/* Card image fills the slot 100% */}
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
      {mage.level > 1 && <span className="ms-lvl">Lv{mage.level}</span>}
    </div>
  );
}
