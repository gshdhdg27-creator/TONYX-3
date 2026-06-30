import { useGameStore } from "../../store/gameStore";
import { NFT_CONFIGS, NFT_IDS } from "../../constants/nft";

export default function CollectionScreen() {
  const nftInventory = useGameStore((s) => s.nftInventory);
  const setView = useGameStore((s) => s.setView);

  return (
    <div className="collection-screen">
      <div className="collection-header">
        <span className="collection-title">🏆 NFT Collection</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setView("home")}>
          ← Назад
        </button>
      </div>
      <div className="scroll-area">
        <div className="nft-grid">
          {NFT_IDS.map((id) => {
            const cfg = NFT_CONFIGS[id];
            const frags = nftInventory.fragments[id] ?? 0;
            const isAssembled = nftInventory.assembled.includes(id);
            return (
              <div key={id} className={`nft-card${isAssembled ? " assembled" : ""}`}>
                <span className="nc-emoji">{cfg.emoji}</span>
                <span className="nc-name">{cfg.name}</span>
                {isAssembled ? (
                  <span className="tag tag-active">СОБРАН ✓</span>
                ) : (
                  <>
                    <span className="nc-prog">{frags}/9</span>
                    <div className="fragment-dots">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <div key={i} className={`frag-dot${i < frags ? " filled" : ""}`} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {nftInventory.assembled.length > 0 && (
          <div style={{ padding: "0 16px 16px" }}>
            <div className="game-divider" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 12, color: "var(--game-text3)", marginBottom: 8 }}>СОБРАННЫЕ NFT</div>
            {nftInventory.assembled.map((id) => {
              const cfg = NFT_CONFIGS[id];
              return (
                <div key={id} className="game-card" style={{ marginBottom: 8, display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 28 }}>{cfg.emoji}</span>
                  <div>
                    <div style={{ fontWeight: 700, color: "var(--game-text)" }}>{cfg.name}</div>
                    <div style={{ fontSize: 11, color: "var(--game-text3)" }}>{cfg.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
