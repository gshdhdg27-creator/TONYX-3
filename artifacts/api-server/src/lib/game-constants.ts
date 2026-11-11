/** Shared game constants for TONYX mini-app server. */

export type CaseCostType = "key" | "ton" | "tonyx";

export interface CaseRewardPoolItem {
  type: "ton" | "tonyx" | "nft_fragment" | "nft_full";
  weight: number;
  minAmount?: number;
  maxAmount?: number;
  nftId?: string;
  pieceIndex?: number;
}

export interface CaseConfig {
  id: string;
  nameRu: string;
  nameEn: string;
  costType: CaseCostType;
  /** For key cases = boss level 1..5; for paid = price amount */
  costValue: number;
  rewards: CaseRewardPoolItem[];
}

export const CASES: CaseConfig[] = [
  // Boss key cases — fixed amounts (min === max)
  {
    id: "boss_1",
    nameRu: "Кейс Shadow Pup",
    nameEn: "Shadow Pup Case",
    costType: "key",
    costValue: 1,
    rewards: [
      { type: "ton", weight: 30, minAmount: 0.01, maxAmount: 0.01 },
      { type: "ton", weight: 20, minAmount: 0.02, maxAmount: 0.02 },
      { type: "tonyx", weight: 35, minAmount: 50, maxAmount: 50 },
      { type: "tonyx", weight: 10, minAmount: 100, maxAmount: 100 },
      { type: "nft_fragment", weight: 5, nftId: "hypno_lollipop" },
    ],
  },
  {
    id: "boss_2",
    nameRu: "Кейс Rage Dogg",
    nameEn: "Rage Dogg Case",
    costType: "key",
    costValue: 2,
    rewards: [
      { type: "ton", weight: 28, minAmount: 0.02, maxAmount: 0.02 },
      { type: "ton", weight: 18, minAmount: 0.05, maxAmount: 0.05 },
      { type: "tonyx", weight: 35, minAmount: 100, maxAmount: 100 },
      { type: "tonyx", weight: 12, minAmount: 250, maxAmount: 250 },
      { type: "nft_fragment", weight: 7, nftId: "snoop_cigar" },
    ],
  },
  {
    id: "boss_3",
    nameRu: "Кейс Inferno Dogg",
    nameEn: "Inferno Dogg Case",
    costType: "key",
    costValue: 3,
    rewards: [
      { type: "ton", weight: 26, minAmount: 0.05, maxAmount: 0.05 },
      { type: "ton", weight: 16, minAmount: 0.1, maxAmount: 0.1 },
      { type: "tonyx", weight: 34, minAmount: 200, maxAmount: 200 },
      { type: "tonyx", weight: 14, minAmount: 500, maxAmount: 500 },
      { type: "nft_fragment", weight: 10, nftId: "electric_skull" },
    ],
  },
  {
    id: "boss_4",
    nameRu: "Кейс Storm Dogg",
    nameEn: "Storm Dogg Case",
    costType: "key",
    costValue: 4,
    rewards: [
      { type: "ton", weight: 24, minAmount: 0.1, maxAmount: 0.1 },
      { type: "ton", weight: 16, minAmount: 0.25, maxAmount: 0.25 },
      { type: "tonyx", weight: 32, minAmount: 500, maxAmount: 500 },
      { type: "tonyx", weight: 14, minAmount: 1000, maxAmount: 1000 },
      { type: "nft_fragment", weight: 14, nftId: "neko_helmet" },
    ],
  },
  {
    id: "boss_5",
    nameRu: "Кейс Boss Dogg Prime",
    nameEn: "Boss Dogg Prime Case",
    costType: "key",
    costValue: 5,
    rewards: [
      { type: "ton", weight: 22, minAmount: 0.25, maxAmount: 0.25 },
      { type: "ton", weight: 14, minAmount: 0.5, maxAmount: 0.5 },
      { type: "tonyx", weight: 30, minAmount: 1000, maxAmount: 1000 },
      { type: "tonyx", weight: 14, minAmount: 2500, maxAmount: 2500 },
      { type: "nft_fragment", weight: 15, nftId: "heroic_helmet" },
      { type: "nft_fragment", weight: 5, nftId: "royal_dogg" },
    ],
  },
  // Paid cases (legacy ids — live TON tiers are managed in cases.ts ensureTonCases)
  {
    id: "ton_basic",
    nameRu: "TON Кейс",
    nameEn: "TON Case",
    costType: "ton",
    costValue: 0.1,
    rewards: [
      { type: "ton", weight: 50, minAmount: 0.05, maxAmount: 0.05 },
      { type: "tonyx", weight: 40, minAmount: 50, maxAmount: 50 },
      { type: "nft_fragment", weight: 10, nftId: "hypno_lollipop" },
    ],
  },
  {
    id: "ton_premium",
    nameRu: "TON Премиум",
    nameEn: "TON Premium",
    costType: "ton",
    costValue: 0.5,
    rewards: [
      { type: "ton", weight: 40, minAmount: 0.2, maxAmount: 0.2 },
      { type: "tonyx", weight: 40, minAmount: 200, maxAmount: 200 },
      { type: "nft_fragment", weight: 20, nftId: "moon_pendant" },
    ],
  },
  {
    id: "tonyx_basic",
    nameRu: "TONYX Кейс",
    nameEn: "TONYX Case",
    costType: "tonyx",
    costValue: 200,
    rewards: [
      { type: "ton", weight: 30, minAmount: 0.05, maxAmount: 0.05 },
      { type: "tonyx", weight: 55, minAmount: 150, maxAmount: 150 },
      { type: "nft_fragment", weight: 15, nftId: "snoop_cigar" },
    ],
  },
];
