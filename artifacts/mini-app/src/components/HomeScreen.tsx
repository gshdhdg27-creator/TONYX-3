import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../store/gameStore";
import { getMageDps } from "../constants/mages";
import { BOSSES, BOSS_REVIVE_COST } from "../constants/bosses";
import { BOOST_CONFIG } from "../lib/liveGameConfig";
import { showRewardedAd } from "../lib/adsgram";
import BossLevelSelect from "./boss/BossLevelSelect";
import BossArena from "./boss/BossArena";
import HpBar from "./ui/HpBar";
import MageSlot from "./ui/MageSlot";
import BoostModal from "./BoostModal";

/** Format seconds → "01:23" / "02:30:45" / "3д 02:30:15" */
function formatTimeLeft(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return "00:00";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (d > 0) return `${d}д ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function HomeScreen() {
  const bossLevel        = useGameStore((s) => s.selectedBossLevel);
  const battleBossLevel  = useGameStore((s) => s.battleBossLevel);
  const bossRespawnAt    = useGameStore((s) => s.bossRespawnAt);
  const reviveAdProgress = useGameStore((s) => s.reviveAdProgress);
  const ownedMages       = useGameStore((s) => s.ownedMages);
  const equippedSlots    = useGameStore((s) => s.equippedSlots);
  const boost            = useGameStore((s) => s.boost);
  const balances         = useGameStore((s) => s.balances);
  const startBattle      = useGameStore((s) => s.startBattle);
  const battleActive     = useGameStore((s) => s.battle.active);
  const bossHpPercent    = useGameStore((s) => s.battle.bossHpPercent);
  const battleTotalDps   = useGameStore((s) => s.battle.totalDps);
  const setView          = useGameStore((s) => s.setView);
  const clickSlot        = useGameStore((s) => s.clickSlot);
  const reviveBossWithTon  = useGameStore((s) => s.reviveBossWithTon);
  const watchAdForRevive   = useGameStore((s) => s.watchAdForRevive);

  const boss     = BOSSES[bossLevel];
  const canStart = equippedSlots.some(Boolean);
  const slots    = equippedSlots.map((id) =>
    id ? (ownedMages.find((m) => m.id === id) ?? null) : null
  );

  const adBoostActive  = !!(boost.boostExpiresAt && Date.now() < boost.boostExpiresAt);
  const tonBoostActive = !!(boost.tonBoostExpiresAt && Date.now() < boost.tonBoostExpiresAt);
  const tonMult = tonBoostActive ? (boost.tonBoostMultiplier ?? 1) : 1;

  const rawDisplayDps = slots
    .filter((m): m is NonNullable<typeof m> => !!m)
    .reduce((sum, m) => sum + getMageDps(m), 0);
  const displayDps = (rawDisplayDps * boost.dpsMultiplier * tonMult).toFixed(2);

  const remainingHp   = boss.maxHp * (bossHpPercent / 100);
  const secondsToKill = battleTotalDps > 0 ? remainingHp / battleTotalDps : Infinity;

  // Re-render every second for countdowns
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const [showBoostModal, setShowBoostModal] = useState(false);
  const [adReviveLoading, setAdReviveLoading] = useState(false);
  const bodySnapshotRef = useRef<Set<Element>>(new Set());
  void bodySnapshotRef;

  const boostLabel = (() => {
    const mult2 = 1 + BOOST_CONFIG.tonBoostPct2 / 100;
    const mult1 = 1 + BOOST_CONFIG.tonBoostPct1 / 100;
    if (tonBoostActive && tonMult >= mult2) return `+${BOOST_CONFIG.tonBoostPct2}% BOOST`;
    if (tonBoostActive && tonMult >= mult1) return `+${BOOST_CONFIG.tonBoostPct1}% BOOST`;
    if (adBoostActive) return `+${BOOST_CONFIG.adBoostPct}% BOOST`;
    return null;
  })();

  // ── Boss state ──────────────────────────────────────────────────────
  const respawnTimestamp = bossRespawnAt[bossLevel];
  const bossIsDead       = !!(respawnTimestamp && Date.now() < respawnTimestamp);
  const respawnSecsLeft  = bossIsDead ? Math.max(0, ((respawnTimestamp ?? 0) - Date.now()) / 1000) : 0;
  const reviveCost       = BOSS_REVIVE_COST[bossLevel];
  const adsWatched       = reviveAdProgress[bossLevel] ?? 0;
  const adsNeeded        = reviveCost.ads ?? 0;
  const canAffordTon     = balances.ton >= reviveCost.ton;

  // Battle is active but fighting a DIFFERENT boss
  const battleIsOnOtherBoss = battleActive && battleBossLevel !== null && bossLevel !== battleBossLevel;
  // Battle is active specifically on the currently viewed boss
  const battleIsHere        = battleActive && battleBossLevel === bossLevel;

  const handleAdRevive = () => {
    if (adReviveLoading) return;
    setAdReviveLoading(true);
    showRewardedAd({
      onReward: () => { watchAdForRevive(bossLevel); setAdReviveLoading(false); },
      onError:  () => setAdReviveLoading(false),
      onSkip:   () => setAdReviveLoading(false),
    });
  };

  return (
    <>
      <div className="game-root">
        <BossLevelSelect />
        <BossArena />

        <div style={{ padding: "4px 16px 2px" }}>
          <HpBar
            hp={bossIsDead ? 0 : battleIsHere ? bossHpPercent : 100}
            maxHp={boss.maxHp}
            bossName={boss.name}
          />
        </div>

        <div className="dps-display">
          ⚔️ <span>{displayDps}</span> ДПС/с
          {boostLabel && (
            <span className="tag tag-boost" style={{ marginLeft: 8 }}>{boostLabel}</span>
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

        {!adBoostActive && !tonBoostActive && (
          <div style={{ padding: "2px 16px 4px", fontSize: 11, color: "var(--game-text3)", textAlign: "center" }}>
            📺 {boost.adWatchedCount}/10 реклам → +20% АТК на 24ч
          </div>
        )}

        {/* ── Boss is dead: revival panel ─────────────────────────────── */}
        {bossIsDead ? (
          <div className="action-panel">
            <div style={{
              background: "rgba(100,0,0,0.22)",
              border: "1px solid rgba(180,40,40,0.35)",
              borderRadius: 16, padding: "14px",
              marginBottom: 6,
            }}>
              <div style={{ textAlign: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 28, marginBottom: 4 }}>💀</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: "#f87171", marginBottom: 2 }}>
                  {boss.name} мёртв
                </div>
                <div style={{ fontSize: 12, color: "rgba(248,113,113,0.65)" }}>
                  Возрождение через&nbsp;
                  <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                    {formatTimeLeft(respawnSecsLeft)}
                  </span>
                </div>
              </div>

              <div style={{ fontSize: 11, color: "#4b5563", textAlign: "center", marginBottom: 8 }}>
                — или возроди сейчас —
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                {/* TON revival */}
                <button
                  onClick={() => reviveBossWithTon(bossLevel)}
                  disabled={!canAffordTon}
                  style={{
                    flex: 1, padding: "11px 0", borderRadius: 12, border: "none",
                    cursor: canAffordTon ? "pointer" : "not-allowed",
                    background: canAffordTon
                      ? "linear-gradient(135deg,#0ea5e9,#0369a1)"
                      : "rgba(255,255,255,0.05)",
                    color: canAffordTon ? "#fff" : "#374151",
                    fontSize: 13, fontWeight: 800,
                    boxShadow: canAffordTon ? "0 2px 12px rgba(14,165,233,0.35)" : "none",
                  }}
                >
                  💎 {reviveCost.ton} TON
                </button>

                {/* Ad revival (unavailable for boss 5) */}
                {reviveCost.ads !== null && (
                  <button
                    onClick={handleAdRevive}
                    disabled={adReviveLoading}
                    style={{
                      flex: 1, padding: "11px 0", borderRadius: 12, border: "none",
                      cursor: adReviveLoading ? "wait" : "pointer",
                      background: adReviveLoading
                        ? "rgba(124,58,237,0.4)"
                        : "linear-gradient(135deg,#7c3aed,#4c1d95)",
                      color: "#fff", fontSize: 12, fontWeight: 800,
                      boxShadow: "0 2px 12px rgba(124,58,237,0.35)",
                    }}
                  >
                    {adReviveLoading
                      ? "⏳ загрузка..."
                      : `📺 ${adsWatched}/${adsNeeded}`}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ── Normal / battle state ───────────────────────────────────── */
          <div className="action-panel">
            <div className="action-row">
              <button
                className="btn btn-primary"
                style={{ flex: 2 }}
                onClick={!battleActive && canStart ? startBattle : undefined}
                disabled={!canStart || battleActive}
              >
                {battleIsOnOtherBoss
                  ? "⚔️ Бой уже запущен"
                  : battleIsHere
                  ? `⚔️ ${formatTimeLeft(secondsToKill)}`
                  : "⚔️ Начать бой"}
              </button>
              <button
                className="btn btn-boost"
                style={{ flex: 1 }}
                onClick={() => setShowBoostModal(true)}
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
        )}
      </div>

      {showBoostModal && <BoostModal onClose={() => setShowBoostModal(false)} />}
    </>
  );
}
