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
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 2,
      flex: 1,
    }}>
      <span style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: "#f1f5f9", fontWeight: 800 }}>{value}</span>
    </div>
  );
}

function MageCard({ mage, owned, onBuy }: { mage: MageConfig; owned: boolean; onBuy: () => void }) {
  const rs = RARITY_STYLE[mage.rarity];
  const free = mage.priceTon === 0;

  return (
    <div style={{
      position: "relative",
      borderRadius: 16,
      overflow: "hidden",
      border: `1.5px solid ${rs.border}`,
      boxShadow: owned ? rs.glow : "none",
      background: "#0d0d1a",
      display: "flex",
      flexDirection: "column",
      transition: "transform 0.18s, box-shadow 0.18s",
    }}>
      {/* Card image */}
      <div style={{ position: "relative", aspectRatio: "3/4", overflow: "hidden" }}>
        <img
          src={mage.image}
          alt={mage.name}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          loading="lazy"
        />
        {/* Rarity badge */}
        <div style={{
          position: "absolute",
          top: 8,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}>
          <div style={{
            background: rs.badge,
            color: "#fff",
            fontSize: 9,
            fontWeight: 900,
            letterSpacing: 1.5,
            padding: "3px 10px",
            borderRadius: 20,
            boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
          }}>
            {rs.label}
          </div>
        </div>
        {/* Owned overlay */}
        {owned && (
          <div style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "rgba(16,185,129,0.92)",
            borderRadius: 20,
            padding: "3px 9px",
            fontSize: 9,
            fontWeight: 900,
            color: "#fff",
            letterSpacing: 0.5,
          }}>
            ✓ ЕСТЬ
          </div>
        )}
        {/* Name gradient overlay */}
        <div style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
          padding: "24px 10px 10px",
        }}>
          <div style={{
            fontSize: 12,
            fontWeight: 800,
            color: "#f1f5f9",
            textAlign: "center",
            lineHeight: 1.2,
            textShadow: "0 1px 4px rgba(0,0,0,0.8)",
          }}>
            {mage.name}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{
        display: "flex",
        justifyContent: "space-around",
        padding: "8px 6px 6px",
        borderTop: `1px solid ${rs.border}`,
        background: "rgba(255,255,255,0.03)",
        gap: 4,
      }}>
        <StatPill label="ATK" value={String(mage.atk)} />
        <div style={{ width: 1, background: "rgba(255,255,255,0.08)", alignSelf: "stretch" }} />
        <StatPill label="Интервал" value={`${mage.interval}с`} />
        <div style={{ width: 1, background: "rgba(255,255,255,0.08)", alignSelf: "stretch" }} />
        <StatPill label="DPS" value={mage.dps.toFixed(2)} />
      </div>

      {/* Buy button */}
      <div style={{ padding: "8px 10px 10px" }}>
        <button
          onClick={onBuy}
          disabled={owned}
          style={{
            width: "100%",
            padding: "9px 0",
            borderRadius: 10,
            border: "none",
            background: owned
              ? "rgba(16,185,129,0.15)"
              : free
              ? "linear-gradient(135deg,#059669,#10b981)"
              : "linear-gradient(135deg,#0ea5e9,#0284c7)",
            color: owned ? "#10b981" : "#fff",
            fontSize: 12,
            fontWeight: 800,
            cursor: owned ? "default" : "pointer",
            letterSpacing: 0.3,
            boxShadow: owned ? "none" : "0 2px 12px rgba(14,165,233,0.3)",
            transition: "opacity 0.15s",
          }}
        >
          {owned
            ? "✓ Уже куплен"
            : free
            ? "Получить бесплатно"
            : `${mage.priceTon} TON`}
        </button>
      </div>
    </div>
  );
}

const FILTERS: { key: "all" | "rare" | "epic" | "legendary"; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "rare", label: "Rare" },
  { key: "epic", label: "Epic" },
  { key: "legendary", label: "Legendary" },
];

export default function HeroShopScreen() {
  const setView = useGameStore((s) => s.setView);
  const ownedMages = useGameStore((s) => s.ownedMages);
  const [filter, setFilter] = useState<"all" | "rare" | "epic" | "legendary">("all");

  const ownedIds = new Set(ownedMages.map((m) => m.id));
  const visible = filter === "all" ? MAGES : MAGES.filter((m) => m.rarity === filter);

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 40,
      display: "flex",
      flexDirection: "column",
      background: "#08080f",
      fontFamily: "'Space Grotesk','Inter',system-ui,sans-serif",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        padding: "16px 16px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        marginTop: 56,
        flexShrink: 0,
        background: "#08080f",
      }}>
        <button
          onClick={() => setView("home")}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "none",
            borderRadius: 10,
            padding: "8px 14px",
            color: "#a0a0c0",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            marginRight: 12,
          }}
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: "#f1f1f8", letterSpacing: 0.5 }}>
            ⚔️ Магазин магов
          </div>
          <div style={{ fontSize: 11, color: "#606080", marginTop: 2 }}>
            {MAGES.length} магов · покупай для сражений с боссом
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#fbbf24", fontWeight: 800 }}>
          {ownedIds.size}/{MAGES.length}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{
        display: "flex",
        gap: 8,
        padding: "10px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        flexShrink: 0,
        background: "#08080f",
      }}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const rs = f.key !== "all" ? RARITY_STYLE[f.key] : null;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                flex: 1,
                padding: "7px 4px",
                borderRadius: 10,
                border: active
                  ? `1px solid ${rs?.border ?? "rgba(255,255,255,0.3)"}`
                  : "1px solid rgba(255,255,255,0.07)",
                background: active
                  ? rs?.badge ?? "rgba(255,255,255,0.1)"
                  : "rgba(255,255,255,0.03)",
                color: active ? "#fff" : "#606080",
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
                letterSpacing: 0.3,
                transition: "all 0.15s",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "12px 12px 32px",
      }}>
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
              onBuy={() => {
                // TODO: wire up TON payment
                console.log("buy", mage.id, mage.priceTon);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
