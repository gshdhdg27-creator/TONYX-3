import { useRef, useState } from "react";
import { useGameStore } from "../store/gameStore";
import { showRewardedAd, ADSGRAM_BLOCK_ID, type AdError } from "@/lib/adsgram";
import { BOOST_CONFIG } from "@/lib/liveGameConfig";

interface Props {
  onClose: () => void;
}

/** TON boost packages shown in the modal (must match server BATTLE_BOOST_TIERS) */
const TON_PACKAGES = [
  { tier: 1 as const, pct: 50, costTon: 0.1, multiplier: 1.5, icon: "⚡" },
  { tier: 2 as const, pct: 100, costTon: 0.5, multiplier: 2.0, icon: "💥" },
  { tier: 3 as const, pct: 250, costTon: 2.5, multiplier: 3.5, icon: "🔥" },
  { tier: 4 as const, pct: 500, costTon: 10, multiplier: 6.0, icon: "💎" },
];

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
  const [buying, setBuying] = useState<number | null>(null);
  const [adError, setAdError] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const bodySnapshotRef = useRef<Set<Element>>(new Set());

  const adBoostActive = !!(boost.boostExpiresAt && Date.now() < boost.boostExpiresAt);
  const tonBoostActive = !!(boost.tonBoostExpiresAt && Date.now() < boost.tonBoostExpiresAt);
  const currentTonMult = tonBoostActive ? boost.tonBoostMultiplier : 1;

  const adBoostPct = BOOST_CONFIG.adBoostPct; // 20
  const adsNeeded = 10;
  const adsProgress = boost.adWatchedCount ?? 0;

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

  const handleBuy = async (tier: 1 | 2 | 3 | 4, costTon: number, multiplier: number) => {
    if (buying !== null) return;
    setBuyError(null);
    setBuying(tier);
    try {
      await buyDpsBoost(multiplier, costTon, tier);
    } catch (e) {
      setBuyError(e instanceof Error ? e.message : "Ошибка покупки");
    } finally {
      setBuying(null);
    }
  };

  return (
    <div
      className="boost-notify-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        zIndex: 500,
        padding: "max(16px, env(safe-area-inset-top)) 16px 24px",
        paddingTop: "max(48px, calc(env(safe-area-inset-top) + 36px))",
      }}
    >
      <div
        className="boost-notify-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 360,
          background: "linear-gradient(165deg, rgba(22,18,40,0.97) 0%, rgba(12,10,24,0.98) 100%)",
          border: "1px solid rgba(168,85,247,0.35)",
          borderRadius: 18,
          padding: "16px 14px 14px",
          boxShadow:
            "0 0 40px rgba(124,58,237,0.28), 0 12px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          animation: "boost-notify-in 0.28s ease-out",
        }}
      >
        <style>{`
          @keyframes boost-notify-in {
            from { opacity: 0; transform: translateY(-18px) scale(0.96); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#f1f1f8", letterSpacing: "-0.2px" }}>
            🚀 Буст урона
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "none",
              background: "rgba(255,255,255,0.08)",
              color: "#a0a0c0",
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ fontSize: 12, color: "#8080a0", marginBottom: 4 }}>
          Усиль магов на 24 часа
        </div>

        {/* Ad boost: +20% for 10 ads */}
        <div
          className={`boost-option${adBoostActive ? " boost-option--active" : ""}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: adBoostActive ? "rgba(124,58,237,0.12)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${adBoostActive ? "rgba(124,58,237,0.5)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 12,
            padding: "11px 12px",
          }}
        >
          <div style={{ fontSize: 22, width: 28, textAlign: "center", flexShrink: 0 }}>📺</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f1f8" }}>
              +{adBoostPct}% урон
            </div>
            <div style={{ fontSize: 11, color: "#8080a0" }}>
              {adBoostActive
                ? `✅ Активен · ${timeLeft(boost.boostExpiresAt!)}`
                : `За рекламу · ${Math.min(adsProgress, adsNeeded)}/${adsNeeded}`}
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleWatchAd}
            disabled={adBoostActive || watching}
            style={{ flexShrink: 0 }}
          >
            {watching ? "⏳" : adBoostActive ? "Готово" : "▶ Смотреть"}
          </button>
        </div>
        {adError && (
          <div
            style={{
              fontSize: 11,
              color: "#f87171",
              padding: "6px 10px",
              background: "rgba(239,68,68,0.1)",
              borderRadius: 8,
              border: "1px solid rgba(239,68,68,0.25)",
            }}
          >
            {adError}
          </div>
        )}

        {/* TON packages */}
        {TON_PACKAGES.map((pkg) => {
          const active = tonBoostActive && currentTonMult >= pkg.multiplier;
          const canAfford = balances.ton >= pkg.costTon;
          const isBuying = buying === pkg.tier;
          return (
            <div
              key={pkg.tier}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: active ? "rgba(124,58,237,0.12)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${active ? "rgba(124,58,237,0.5)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 12,
                padding: "11px 12px",
              }}
            >
              <div style={{ fontSize: 22, width: 28, textAlign: "center", flexShrink: 0 }}>
                {pkg.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f1f8" }}>
                  +{pkg.pct}% урон
                </div>
                <div style={{ fontSize: 11, color: "#8080a0" }}>
                  {active
                    ? `✅ Активен · ${timeLeft(boost.tonBoostExpiresAt!)}`
                    : `${pkg.costTon} TON · 24ч`}
                </div>
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleBuy(pkg.tier, pkg.costTon, pkg.multiplier)}
                disabled={isBuying || !canAfford || active || buying !== null}
                style={{ flexShrink: 0, minWidth: 64 }}
              >
                {isBuying ? "…" : active ? "Готово" : `${pkg.costTon} TON`}
              </button>
            </div>
          );
        })}

        {buyError && (
          <div
            style={{
              fontSize: 12,
              color: "#f87171",
              padding: "8px 10px",
              background: "rgba(239,68,68,0.1)",
              borderRadius: 8,
              border: "1px solid rgba(239,68,68,0.25)",
            }}
          >
            {buyError}
          </div>
        )}
      </div>
    </div>
  );
}
