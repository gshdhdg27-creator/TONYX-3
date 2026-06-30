export type ChestType =
  | "COMMON"
  | "SILVER"
  | "GOLD"
  | "PLATINUM"
  | "LEGENDARY";

export interface ChestRewardTable {
  chestType: ChestType;

  minTonyx: number;
  maxTonyx: number;

  minTon: number;
  maxTon: number;

  nftFragmentChance: number;
  fullNftChance: number;
}

export const CHESTS: Record<
  ChestType,
  ChestRewardTable
> = {
  COMMON: {
    chestType: "COMMON",

    minTonyx: 25,
    maxTonyx: 75,

    minTon: 0,
    maxTon: 0.01,

    nftFragmentChance: 20,
    fullNftChance: 0.1
  },

  SILVER: {
    chestType: "SILVER",

    minTonyx: 75,
    maxTonyx: 200,

    minTon: 0.01,
    maxTon: 0.03,

    nftFragmentChance: 30,
    fullNftChance: 0.3
  },

  GOLD: {
    chestType: "GOLD",

    minTonyx: 200,
    maxTonyx: 500,

    minTon: 0.03,
    maxTon: 0.08,

    nftFragmentChance: 40,
    fullNftChance: 0.8
  },

  PLATINUM: {
    chestType: "PLATINUM",

    minTonyx: 500,
    maxTonyx: 1200,

    minTon: 0.08,
    maxTon: 0.2,

    nftFragmentChance: 55,
    fullNftChance: 2
  },

  LEGENDARY: {
    chestType: "LEGENDARY",

    minTonyx: 1200,
    maxTonyx: 3000,

    minTon: 0.2,
    maxTon: 0.5,

    nftFragmentChance: 75,
    fullNftChance: 5
  }
};
