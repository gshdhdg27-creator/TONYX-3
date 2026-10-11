import { useRef, useState } from "react";
import { useGameStore } from "../store/gameStore";
import { showRewardedAd, ADSGRAM_BLOCK_ID, type AdError } from "@/lib/adsgram";
import { BOOST_CONFIG } from "@/lib/liveGameConfig";

interface Props {
  onClose: () => void;
}

function removeAdsgramOverlays(snapshot: Set<Element>) {
  try {
    Array.from(document.body.children).forEach((el) => {
      if (!snapshot.has(el)) el.remove();
    });
    document
      .querySelectorAll('[id*="adsgram"],[class*="adsgram"],[data-adsgram],iframe[src*="adsgram"]')
      .forEach((el) => {
        let t: Element | null = el;
        while (t?.parentElement && t.parentElement !== document.body) t = t.parentElement;
        t?.remove();
      });
  } catch {}
}

export default function BoostModal({ onClose }: Props) {
  const boost = useGameStore((s) => s.boost);
  const balances = useGameStore((s) => s.balances);
  const watchAd = useGameStore((s) => s.watchAd);
  const buyDpsBoost = useGameStore((s) => s.buyDpsBoost);

  const [watching, setWatching] = useState(false);
  const [buying, setBuying] = useState(false);
  const [adError, setAdError] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const bodySnapshotRef = useRef<Set<Element>>(new Set());

  const adBoostActive = !!(boost.boostExpiresAt && Date.now() < boost.boostExpiresAt);
  const tonBoostActive = !!(boost.tonBoostExpiresAt && Date.now() < boost.tonBoostExpiresAt);
  const currentTonMult = tonBoostActive ? boost.tonBoostMultiplier : 1;

  const adBoostPct = BOOST_CONFIG.adBoostPct;
  const tonBoostPct1 = BOOST_CONFIG.tonBoostPct1;
  const tonBoostPct2 = BOOST_CONFIG.tonBoostPct2;
  const tonBoostMult1 = 1 + tonBoostPct1 / 100;
  const tonBoostMult2 = 1 + tonBoostPct2 / 100;

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
        setAdError(err?.message ?? "Ошибка рекламы");
      },
    });
    setWatching(false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-title">Буст урона</div>
        <div className="modal-sub">Усиль магов на время боя с боссом</div>

        <div className={`boost-option${adBoostActive ? " boost-option--active" : ""}`}>
          <div className="boost-option-icon">📺</div>
          <div className="boost-option-info">
            <div className="boost-option-name">+{adBoostPct}% урон (реклама)</div>
            <div className="boost-option-desc">
              {adBoostActive
                ? `✅ Активен · осталось ${timeLeft(boost.boostExpiresAt!)}`
                : "Бесплатно · за просмотр"}
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleWatchAd}
            disabled={adBoostActive || watching}
          >
            {watching ? "⏳" : adBoostActive ? "Готово" : "▶ Смотреть"}
          </button>
        </div>
        {adError && (
          <div
            style={{
              fontSize: 11,
              color: "#f87171",
              marginTop: 6,
              lineHeight: 1.4,
              padding: "6px 10px",
              background: "rgba(239,68,68,0.1)",
              borderRadius: 8,
              border: "1px solid rgba(239,68,68,0.25)",
            }}
          >
            {adError}
          </div>
        )}

        <div
          className={`boost-option${
            currentTonMult >= tonBoostMult1 && tonBoostActive ? " boost-option--active" : ""
          }`}
        >
          <div className="boost-option-icon">⚡</div>
          <div className="boost-option-info">
            <div className="boost-option-name">+{tonBoostPct1}% урон на 24ч</div>
            <div className="boost-option-desc">
              {currentTonMult >= tonBoostMult1 && tonBoostActive
                ? `✅ Активен · осталось ${timeLeft(boost.tonBoostExpiresAt!)}`
                : `Стоимость · 1 TON`}
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={async () => {
              if (buying) return;
              setBuyError(null);
              setBuying(true);
              try {
                await buyDpsBoost(tonBoostMult1, 1);
              } catch (e) {
                setBuyError(e instanceof Error ? e.message : "Ошибка покупки");
              } finally {
                setBuying(false);
              }
            }}
            disabled={buying || balances.ton < 1 || (tonBoostActive && currentTonMult >= tonBoostMult1)}
          >
            1 TON
          </button>
        </div>

        <div
          className={`boost-option${
            currentTonMult >= tonBoostMult2 && tonBoostActive ? " boost-option--active" : ""
          }`}
        >
          <div className="boost-option-icon">💥</div>
          <div className="boost-option-info">
            <div className="boost-option-name">+{tonBoostPct2}% урон на 24ч</div>
            <div className="boost-option-desc">
              {currentTonMult >= tonBoostMult2 && tonBoostActive
                ? `✅ Активен · осталось ${timeLeft(boost.tonBoostExpiresAt!)}`
                : `Стоимость · 10 TON`}
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={async () => {
              if (buying) return;
              setBuyError(null);
              setBuying(true);
              try {
                await buyDpsBoost(tonBoostMult2, 10);
              } catch (e) {
                setBuyError(e instanceof Error ? e.message : "Ошибка покупки");
              } finally {
                setBuying(false);
              }
            }}
            disabled={
              buying || balances.ton < 10 || (tonBoostActive && currentTonMult >= tonBoostMult2)
            }
          >
            10 TON
          </button>
        </div>

        {buyError && (
          <div
            style={{
              fontSize: 12,
              color: "#f87171",
              marginTop: 6,
              lineHeight: 1.4,
              padding: "8px 10px",
              background: "rgba(239,68,68,0.1)",
              borderRadius: 8,
              border: "1px solid rgba(239,68,68,0.25)",
            }}
          >
            {buyError}
          </div>
        )}

        <button className="btn btn-ghost btn-full" style={{ marginTop: 4 }} onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
