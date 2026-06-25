import type { NftConfig, NftId } from "../types/game";

export const NFT_CONFIGS: Record<NftId, NftConfig> = {
  shadow_dogg: {
    id: "shadow_dogg",
    name: "Shadow Dogg",
    description: "Born from darkness. Ultra-rare.",
    emoji: "🐺",
    totalFragments: 9,
  },
  flame_dogg: {
    id: "flame_dogg",
    name: "Flame Dogg",
    description: "Forged in the inferno. Legendary.",
    emoji: "🔥",
    totalFragments: 9,
  },
  ice_dogg: {
    id: "ice_dogg",
    name: "Ice Dogg",
    description: "Frozen in time. Epic.",
    emoji: "❄️",
    totalFragments: 9,
  },
};

export const NFT_IDS: NftId[] = ["shadow_dogg", "flame_dogg", "ice_dogg"];

export const NFT_FRAGMENT_DROP_CHANCE = 0.35;
export const NFT_FULL_DROP_CHANCE = 0.05;
