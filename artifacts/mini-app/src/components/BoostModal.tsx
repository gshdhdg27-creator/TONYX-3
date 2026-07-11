import { useRef, useState } from "react";
import { useGameStore } from "../store/gameStore";
import { showRewardedAd, ADSGRAM_BLOCK_ID, type AdError } from "@/lib/adsgram";

interface Props {
  onClose: () => void;
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

export default function BoostModal({ onClose }: Props) {
  const boost      = useGameStore((s) => s.boost);
  const balances   = useGameStore((s) => s.balances);
  const watchAd    = useGameStore((s) => s.watchAd);
  const buyDpsBoost = useGameStore((s) => s.buyDpsBoost);

  const [watching, setWatching] = useState(false);
  const [adError, setAdError] = useState<string | null>(null);
  const bodySnapshotRef = useRef<Set<Element>>(new Set());

  const adBoostActive = !!(boost.boostExpiresAt && Date.now() < boost.boostExpiresAt);
  const tonBoostActive = !!(boost.tonBoostExpiresAt && Date.now() < boost.tonBoostExpiresAt);
  const currentTonMult = tonBoostActive ? boost.tonBoostMultiplier : 1;

  // Format remaining time for an expiry timestamp
  function timeLeft(expiresAt: number): string {
    const sec = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}ч ${m}м`;
    return `${m}м`;
  }

  const handleWatchAd = async () => {
    if (watching || adBoostActive) return;
    setAdError(null);
    setWatching(true);
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
        console.error("[AdsGram]", err);
        if (err.reason === "not_loaded") {
          setAdError("Реклама недоступна. Убедитесь, что вы открыли приложение через Telegram.");
        } else if (err.reason === "no_ads") {
          setAdError("Нет доступной рекламы. Попробуйте позже.");
        } else if (err.reason === "network") {
          setAdError("Ошибка сети. Проверьте соединение и попробуйте снова.");
        } else {
          setAdError("Не удалось показать рекламу. Попробуйте позже.");
        }
      },
    });
    setWatching(false);
  };

  return (
    <div className="boost-modal-overlay" onClick={onClose}>
      <div className="boost-modal" onClick={(e) => e.stopPropagation()}>

        <div className="boost-modal-title">🚀 Boost</div>
        <div className="boost-modal-subtitle">Усиль магов — наноси больше урона</div>

        {/* ── Option 1: Ad boost ── */}
        <div className={`boost-option${adBoostActive ? " boost-option--active" : ""}`}>
          <div className="boost-option-icon">📺</div>
          <div className="boost-option-info">
            <div className="boost-option-name">+20% урон на 24ч</div>
            <div className="boost-option-desc">
              {adBoostActive
                ? `✅ Активен · осталось ${timeLeft(boost.boostExpiresAt!)}`
                : `Смотреть рекламу · ${boost.adWatchedCount}/10`}
            </div>
          </div>
          <button
            className="btn btn-boost btn-sm"
            onClick={handleWatchAd}
            disabled={adBoostActive || watching}
          >
            {watching ? "⏳" : adBoostActive ? "Готово" : "▶ Смотреть"}
          </button>
        </div>
        {adError && (
          <div style={{
            fontSize: 11, color: "#f87171", marginTop: 6, lineHeight: 1.4,
            padding: "6px 10px", background: "rgba(239,68,68,0.1)",
            borderRadius: 8, border: "1px solid rgba(239,68,68,0.25)",
          }}>
            {adError}
          </div>
        )}

        {/* ── Option 2: +50% paid ── */}
        <div className={`boost-option${currentTonMult >= 1.5 && tonBoostActive ? " boost-option--active" : ""}`}>
          <div className="boost-option-icon">⚡</div>
          <div className="boost-option-info">
            <div className="boost-option-name">+50% урон на 24ч</div>
            <div className="boost-option-desc">
              {currentTonMult >= 1.5 && tonBoostActive
                ? `✅ Активен · осталось ${timeLeft(boost.tonBoostExpiresAt!)}`
                : `Стоимость · 1 TON`}
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => buyDpsBoost(1.5, 1)}
            disabled={balances.ton < 1 || (tonBoostActive && currentTonMult >= 1.5)}
          >
            1 TON
          </button>
        </div>

        {/* ── Option 3: +100% paid ── */}
        <div className={`boost-option${currentTonMult >= 2.0 && tonBoostActive ? " boost-option--active" : ""}`}>
          <div className="boost-option-icon">💥</div>
          <div className="boost-option-info">
            <div className="boost-option-name">+100% урон на 24ч</div>
            <div className="boost-option-desc">
              {currentTonMult >= 2.0 && tonBoostActive
                ? `✅ Активен · осталось ${timeLeft(boost.tonBoostExpiresAt!)}`
                : `Стоимость · 10 TON`}
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => buyDpsBoost(2.0, 10)}
            disabled={balances.ton < 10 || (tonBoostActive && currentTonMult >= 2.0)}
          >
            10 TON
          </button>
        </div>

        <button className="btn btn-ghost btn-full" style={{ marginTop: 4 }} onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
