import type { OwnedMage } from "../../types/game";
import { getMageDps } from "../../constants/mages";

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

  const dps = getMageDps(mage);

  return (
    <div className="mage-slot filled" onClick={() => onClick(slotIndex)}>
      {mage.image ? (
        <img
          src={mage.image}
          alt={mage.name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: 8,
            display: "block",
          }}
        />
      ) : (
        <span className="ms-emoji">{mage.emoji}</span>
      )}
      <div className="mage-slot-overlay">
        <span className="ms-lvl">L{mage.level}</span>
        <span className="ms-dps">{dps}/s</span>
      </div>
    </div>
  );
}
