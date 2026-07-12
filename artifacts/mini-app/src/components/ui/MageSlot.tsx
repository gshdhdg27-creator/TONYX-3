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
        <span className="ms-empty-label">Слот</span>
      </div>
    );
  }

  return (
    <div className="mage-slot filled" data-rarity={mage.rarity} onClick={() => onClick(slotIndex)}>
      <div className="mage-slot-img-wrap">
        {mage.image ? (
          <img src={mage.image} alt={mage.name} className="mage-slot-img" />
        ) : (
          <span className="ms-emoji">{mage.emoji}</span>
        )}
      </div>
      {mage.level > 1 && <span className="ms-lvl">Lv{mage.level}</span>}
      <div className="ms-name-bar">
        <span className="ms-name">{mage.name}</span>
      </div>
    </div>
  );
}
