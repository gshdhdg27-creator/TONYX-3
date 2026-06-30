import { useGameStore } from "../../store/gameStore";
import type { ChestReward } from "../../types/game";
import { NFT_CONFIGS } from "../../constants/nft";

function rewardLabel(r: ChestReward): { label: string; val: string; icon: string } {
  if (r.type === "ton")
    return { icon: "💎", label: "TON", val: `+${r.amount?.toFixed(3)}` };
  if (r.type === "tonyx")
    return { icon: "⚡", label: "TONYX", val: `+${r.amount?.toLocaleString()}` };
  if (r.type === "nft_fragment" && r.fragmentNftId) {
    const cfg = NFT_CONFIGS[r.fragmentNftId];
    return { icon: cfg.emoji, label: `${cfg.name} Fragment`, val: "+1/9" };
  }
  if (r.type === "nft_full" && r.nftId) {
    const cfg = NFT_CONFIGS[r.nftId];
    return { icon: cfg.emoji, label: cfg.name, val: "FULL NFT! 🎉" };
  }
  return { icon: "🎁", label: "Reward", val: "" };
}

export default function ChestScreen() {
  const rewards = useGameStore((s) => s.battle.lastRewards);
  const claim = useGameStore((s) => s.claimChestRewards);
  const hasNft = rewards?.some((r) => r.type === "nft_full" || r.type === "nft_fragment");

  return (
    <div className="chest-screen">
      <div className="chest-emoji">{hasNft ? "🏆" : "🎁"}</div>
      <div className="chest-title">Босс побеждён!</div>
      <div className="reward-list">
        {rewards?.map((r, i) => {
          const { icon, label, val } = rewardLabel(r);
          return (
            <div key={i} className="reward-row">
              <span className="r-label">{icon} {label}</span>
              <span className="r-val">{val}</span>
            </div>
          );
        })}
      </div>
      <button className="btn btn-gold btn-full" onClick={claim} style={{ maxWidth: 280 }}>
        Забрать награды
      </button>
    </div>
  );
}
