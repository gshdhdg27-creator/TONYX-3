import { useCallback, useEffect, useRef, useState } from "react";
import { useGameStore } from "../store/gameStore";
import { getMageDps } from "../constants/mages";
import { BOSSES } from "../constants/bosses";
import BossLevelSelect from "./boss/BossLevelSelect";
import BossArena from "./boss/BossArena";
import HpBar from "./ui/HpBar";
import MageSlot from "./ui/MageSlot";
import { showRewardedAd, ADSGRAM_BLOCK_ID, type AdError } from "@/lib/adsgram";

/** Format seconds → "01:23" / "02:30:45" / "3д 02:30" */
function formatTimeLeft(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return "00:00";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (d > 0) return `${d}д ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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
  const bossLevel      = useGameStore((s) => s.selectedBossLevel);
  const ownedMages     = useGameStore((s) => s.ownedMages);
  const equippedSlots  = useGameStore((s) => s.equippedSlots);
  const boost          = useGameStore((s) => s.boost);
  const startBattle    = useGameStore((s) => s.startBattle);
  const battleActive   = useGameStore((s) => s.battle.active);
  const bossHpPercent  = useGameStore((s) => s.battle.bossHpPercent);
  const battleTotalDps = useGameStore((s) => s.battle.totalDps);
  const setView        = useGameStore((s) => s.setView);
  const clickSlot      = useGameStore((s) => s.clickSlot);
  const watchAd        = useGameStore((s) => s.watchAd);

  const boss      = BOSSES[bossLevel];
  const canStart  = equippedSlots.some(Boolean);
  const slots     = equippedSlots.map((id) =>
    id ? (ownedMages.find((m) => m.id === id) ?? null) : null
  );
  const boostActive = boost.boostExpiresAt !== null && Date.now() < boost.boostExpiresAt;

  // Display DPS (same formula as battle)
  const rawDisplayDps = slots
    .filter((m): m is NonNullable<typeof m> => !!m)
    .reduce((sum, m) => sum + getMageDps(m), 0);
  const displayDps = (rawDisplayDps * boost.dpsMultiplier).toFixed(2);

  // Time-to-kill = remaining HP / current DPS
  const remainingHp   = boss.maxHp * (bossHpPercent / 100);
  const secondsToKill = battleTotalDps > 0 ? remainingHp / battleTotalDps : Infinity;

  // Ticker: re-render every second so the countdown stays fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!battleActive) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [battleActive]);

  const bodySnapshotRef = useRef<Set<Element>>(new Set());

  const handleBoost = useCallback(async () => {
    bodySnapshotRef.current = new Set(Array.from(document.body.children));
    await showRewardedAd({
      blockId: ADSGRAM_BLOCK_ID,
      onReward: () => {
        removeAdsgramOverlays(bodySnapshotRef.current);
        watchAd();
      },
      onSkip: () => removeAdsgramOverlays(bodySnapshotRef.current),
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
        {/* Show live boss HP during battle, full bar otherwise */}
        <HpBar
          hp={battleActive ? bossHpPercent : 100}
          maxHp={boss.maxHp}
          bossName={boss.name}
        />
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
            onClick={battleActive ? undefined : startBattle}
            disabled={!canStart || battleActive}
          >
            {battleActive
              ? `⚔️ ${formatTimeLeft(secondsToKill)}`
              : "⚔️ Начать бой"}
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
