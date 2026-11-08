import { useState } from "react";
import { useGameStore } from "../../store/gameStore";
import { MAGES } from "../../constants/mages";
import type { MageConfig, MageRarity } from "../../types/game";

const RARITY_STYLE: Record<MageRarity, { label: string; border: string; glow: string; badge: string; text: string }> = {
  rare: {
    label: "RARE",
    border: "rgba(99,179,237,0.5)",
    glow: "0 0 18px rgba(99,179,237,0.25)",
    badge: "linear-gradient(135deg,#2563eb,#1e40af)",
    text: "#93c5fd",
  },
  epic: {
    label: "EPIC",
    border: "rgba(168,85,247,0.6)",
    glow: "0 0 22px rgba(168,85,247,0.3)",
    badge: "linear-gradient(135deg,#7c3aed,#4c1d95)",
    text: "#c084fc",
  },
  legendary: {
    label: "LEGENDARY",
    border: "rgba(251,191,36,0.7)",
    glow: "0 0 28px rgba(251,191,36,0.35)",
    badge: "linear-gradient(135deg,#d97706,#92400e)",
    text: "#fbbf24",
  },
};

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flex: 1 }}>
      <span style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: "#f1f5f9", fontWeight: 800 }}>{value}</span>
    </div>
  );
}

interface MageCardProps {
  mage: MageConfig;
  owned: boolean;
  equipped: boolean;
  selectMode: boolean;
  onBuy: () => void;
  onSelect: () => void;
}

function MageCard({ mage, owned, equipped, selectMode, onBuy, onSelect }: MageCardProps) {
  const rs = RARITY_STYLE[mage.rarity];
  const free = mage.priceTon === 0;

  const renderButton = () => {
    if (selectMode) {
      if (!owned) {
        return (
          <button
            onClick={onBuy}
            style={{
              width: "100%", padding: "9px 0", borderRadius: 10, border: "none",
              background: free
                ? "linear-gradient(135deg,#059669,#10b981)"
                : "linear-gradient(135deg,#0ea5e9,#0284c7)",
              color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer",
              letterSpacing: 0.3, boxShadow: "0 2px 12px rgba(14,165,233,0.3)", transition: "opacity 0.15s",
            }}
          >
            {free ? "Получить бесплатно" : `Купить ${mage.priceTon} TON`}
          </button>
        );
      }
      if (equipped) {
        return (
          <button
            disabled
            style={{
              width: "100%", padding: "9px 0", borderRadius: 10, border: "1px solid rgba(16,185,129,0.4)",
              background: "rgba(16,185,129,0.12)", color: "#34d399", fontSize: 12, fontWeight: 800,
              cursor: "default",
            }}
          >
            ✓ В слоте
          </button>
        );
      }
      return (
        <button
          onClick={onSelect}
          style={{
            width: "100%", padding: "9px 0", borderRadius: 10, border: "none",
            background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
            color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer",
            letterSpacing: 0.3, boxShadow: "0 2px 12px rgba(124,58,237,0.35)",
          }}
        >
          Выбрать
        </button>
      );
    }

    if (owned) {
      return (
        <button
          disabled
          style={{
            width: "100%", padding: "9px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.04)", color: "#4b5563", fontSize: 12, fontWeight: 800,
            cursor: "default",
          }}
        >
          ✓ Есть
        </button>
      );
    }

    return (
      <button
        onClick={onBuy}
        style={{
          width: "100%", padding: "9px 0", borderRadius: 10, border: "none",
          background: free
            ? "linear-gradient(135deg,#059669,#10b981)"
            : "linear-gradient(135deg,#0ea5e9,#0284c7)",
          color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer",
          letterSpacing: 0.3, boxShadow: "0 2px 12px rgba(14,165,233,0.3)",
        }}
      >
        {free ? "Получить бесплатно" : `Купить ${mage.priceTon} TON`}
      </button>
    );
  };

  return (
    <div
      style={{
        borderRadius: 16,
        border: `1px solid ${rs.border}`,
        background: "rgba(12,12,28,0.85)",
        boxShadow: rs.glow,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "12px 12px 8px", display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 48, height: 48, borderRadius: 12,
            background: "rgba(255,255,255,0.06)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, flexShrink: 0,
          }}
        >
          {mage.emoji ?? "🧙"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {mage.name}
          </div>
          <div
            style={{
              display: "inline-block", marginTop: 3, padding: "2px 8px", borderRadius: 6,
              background: rs.badge, color: "#fff", fontSize: 9, fontWeight: 800, letterSpacing: 0.6,
            }}
          >
            {rs.label}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", padding: "6px 8px 10px", gap: 4 }}>
        <StatPill label="DPS" value={String(mage.baseDps)} />
        <StatPill label="TON" value={free ? "FREE" : String(mage.priceTon)} />
      </div>

      <div style={{ padding: "0 10px 12px" }}>
        {renderButton()}
      </div>
    </div>
  );
}

export default function HeroShopScreen() {
  const setView = useGameStore((s) => s.setView);
  const ownedMages = useGameStore((s) => s.ownedMages);
  const equippedSlots = useGameStore((s) => s.equippedSlots);
  const buyMage = useGameStore((s) => s.buyMage);
  const equipMageToSlot = useGameStore((s) => s.equipMageToSlot);
  const pendingSlotIndex = useGameStore((s) => s.pendingSlotIndex);

  const [filter, setFilter] = useState<"all" | "owned" | MageRarity>("all");
  const selectMode = pendingSlotIndex !== null;

  const ownedIds = new Set(ownedMages.map((m) => m.id));
  const equippedIds = new Set(equippedSlots.filter(Boolean) as string[]);

  const filters: { key: "all" | "owned" | MageRarity; label: string }[] = [
    { key: "all", label: "Все" },
    { key: "owned", label: "Мои" },
    { key: "rare", label: "Rare" },
    { key: "epic", label: "Epic" },
    { key: "legendary", label: "Legend" },
  ];

  const visible = MAGES.filter((m) => {
    if (filter === "all") return true;
    if (filter === "owned") return ownedIds.has(m.id);
    return m.rarity === filter;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0a0a18" }}>
      <div style={{ padding: "14px 16px 8px", display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() => setView("home")}
          style={{
            width: 36, height: 36, borderRadius: 10, border: "none",
            background: "rgba(255,255,255,0.06)", color: "#e2e8f0",
            fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#f1f5f9" }}>
            {selectMode ? "Выбери мага" : "Магазин героев"}
          </div>
          {selectMode && (
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              Слот {(pendingSlotIndex ?? 0) + 1}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, padding: "4px 12px 10px", overflowX: "auto" }}>
        {filters.map((f) => {
          const active = filter === f.key;
          const rs = f.key !== "all" && f.key !== "owned" ? RARITY_STYLE[f.key] : null;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: "6px 12px", borderRadius: 20, border: "none",
                background: active
                  ? rs?.badge ?? "rgba(255,255,255,0.1)"
                  : "rgba(255,255,255,0.03)",
                color: active ? "#fff" : "#606080",
                fontSize: 11, fontWeight: 800, cursor: "pointer",
                letterSpacing: 0.3, transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}
            >
              {f.label}
              {f.key === "owned" && ownedIds.size > 0 && (
                <span style={{ marginLeft: 4, opacity: 0.7 }}>({ownedIds.size})</span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 32px" }}>
        {visible.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", paddingTop: 60, gap: 12,
          }}>
            <div style={{ fontSize: 40 }}>🧙</div>
            <div style={{ fontSize: 14, color: "#606080", fontWeight: 700 }}>
              {filter === "owned" ? "Нет купленных магов" : "Нет магов"}
            </div>
            {filter === "owned" && (
              <button
                onClick={() => setFilter("all")}
                style={{
                  marginTop: 4, padding: "9px 20px", borderRadius: 12,
                  border: "none", background: "linear-gradient(135deg,#0ea5e9,#0284c7)",
                  color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer",
                }}
              >
                Перейти в магазин →
              </button>
            )}
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 12,
          }}>
            {visible.map((mage) => (
              <MageCard
                key={mage.id}
                mage={mage}
                owned={ownedIds.has(mage.id)}
                equipped={equippedIds.has(mage.id)}
                selectMode={selectMode}
                onBuy={() => {
                  buyMage(mage.id);
                  if (selectMode) {
                    equipMageToSlot(mage.id);
                  }
                }}
                onSelect={() => equipMageToSlot(mage.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
