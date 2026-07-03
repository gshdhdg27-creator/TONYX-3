import { useCallback, useRef } from "react";
import { useGameStore } from "../store/gameStore";
import { BOSSES } from "../constants/bosses";
import BossLevelSelect from "./boss/BossLevelSelect";
import BossArena from "./boss/BossArena";
import HpBar from "./ui/HpBar";
import MageSlot from "./ui/MageSlot";
import { showRewardedAd, ADSGRAM_BLOCK_ID, type AdError } from "@/lib/adsgram";

function removeAdsgramOverlays(snapshot: Set<Element>) {
  try {
    Array.from(document.body.children).forEach(el => { if (!snapshot.has(el)) el.remove(); });
    document.querySelectorAll('[id*="adsgram"],[class*="adsgram"],[data-adsgram],iframe[src*="adsgram"]')
      .forEach(el => {
        let t: Element | null = el;
        while (t?.parentElement && t.parentElement !== document.body) t = t.parentElement;
        t?.remove();
      });
  } catch {}
}

export default function HomeScreen() {
  const bossLevel = useGameStore((s) => s.selectedBossLevel);
  const ownedMages = useGameStore((s) => s.ownedMages);
  const equippedSlots = useGameStore((s) => s.equippedSlots);
  const boost = useGameStore((s) => s.boost);
  const startBattle = useGameStore((s) => s.startBattle);
  const setView = useGameStore((s) => s.setView);
  const clickSlot = useGameStore((s) => s.clickSlot);
  const watchAd = useGameStore((s) => s.watchAd);

  const bodySnapshotRef = useRef<Set<Element>>(new Set());

  const boss = BOSSES[bossLevel];
  const canStart = equippedSlots.some(Boolean);
  // Resolve equipped mage objects from slot IDs
  const slots = equippedSlots.map((id) =>
    id ? (ownedMages.find((m) => m.id === id) ?? null) : null
  );
  const boostActive = boost.boostExpiresAt !== null && Date.now() < boost.boostExpiresAt;

  // Display DPS = sum of actual mage.dps values (matches card stats table)
  const displayDps = slots
    .filter((m): m is NonNullable<typeof m> => !!m)
    .reduce((sum, m) => sum + m.dps, 0)
    .toFixed(2);

  const handleBoost = useCallback(async () => {
    bodySnapshotRef.current = new Set(Array.from(document.body.children));
    await showRewardedAd({
      blockId: ADSGRAM_BLOCK_ID,
      onReward: () => {
        removeAdsgramOverlays(bodySnapshotRef.current);
        watchAd();
      },
      onSkip: () => {
        removeAdsgramOverlays(bodySnapshotRef.current);
      },
      onError: (err: AdError) => {
        removeAdsgramOverlays(bodySnapshotRef.current);
        console.error("[AdsGram boost] error:", err.reason, err.description);
      },
    });
  }, [watchAd]);

  return (
    <div className="game-root">
      <BossLevelSelect />
      <BossArena />

      <div style={{ padding: "4px 16px 2px" }}>
        <HpBar hp={100} maxHp={boss.maxHp} bossName={boss.name} />
      </div>

      <div className="dps-display">
        ⚔️ <span>{displayDps}</span> ДПС/с
        {boostActive && (
          <span className="tag tag-boost" style={{ marginLeft: 8 }}>+20% BOOST</span>
        )}
      </div>

      <div className="mage-slots">
        {slots.map((mage, i) => (
          <MageSlot
            key={mage ? mage.id : `empty-${i}`}
            mage={mage}
            isEmpty={!mage}
            slotIndex={i}
            onClick={clickSlot}
          />
        ))}
      </div>

      {!boostActive && (
        <div style={{ padding: "2px 16px 4px", fontSize: 11, color: "var(--game-text3)", textAlign: "center" }}>
          📺 {boost.adWatchedCount}/10 реклам → +20% АТК на 24ч
        </div>
      )}

      <div className="action-panel">
        <div className="action-row">
          <button
            className="btn btn-primary"
            style={{ flex: 2 }}
            onClick={startBattle}
            disabled={!canStart}
          >
            ⚔️ Начать бой
          </button>
          <button
            className="btn btn-boost"
            style={{ flex: 1 }}
            onClick={handleBoost}
            disabled={boostActive}
          >
            🚀 Boost
          </button>
        </div>
        <div className="action-row">
          <button
            className="btn btn-ghost"
            style={{ flex: 1 }}
            onClick={() => setView("collection")}
          >
            🏆 NFT
          </button>
          <button
            className="btn btn-ghost"
            style={{ flex: 1 }}
            onClick={() => setView("hero-shop")}
          >
            🛒 Магазин
          </button>
        </div>
      </div>
    </div>
  );
}
