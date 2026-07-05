import type { BossConfig } from "../types/game";

export const BOSSES: Record<number, BossConfig> = {
  1: {
    level: 1,
    name: "Shadow Pup",
    maxHp: 50,
    baseAttack: 2,
    attackInterval: [10, 15],
    rewardTon: 0.01,
    rewardTonyx: 50,
    color: "#7c3aed",
  },
  2: {
    level: 2,
    name: "Rage Dogg",
    maxHp: 200,
    baseAttack: 5,
    attackInterval: [10, 14],
    rewardTon: 0.03,
    rewardTonyx: 150,
    color: "#dc2626",
  },
  3: {
    level: 3,
    name: "Inferno Dogg",
    maxHp: 700,
    baseAttack: 12,
    attackInterval: [9, 13],
    rewardTon: 0.08,
    rewardTonyx: 400,
    color: "#ea580c",
  },
  4: {
    level: 4,
    name: "Storm Dogg",
    maxHp: 2000,
    baseAttack: 25,
    attackInterval: [8, 12],
    rewardTon: 0.2,
    rewardTonyx: 1000,
    color: "#0891b2",
  },
  5: {
    level: 5,
    name: "Boss Dogg Prime",
    maxHp: 6000,
    baseAttack: 60,
    attackInterval: [8, 11],
    rewardTon: 0.5,
    rewardTonyx: 3000,
    color: "#f59e0b",
  },
};

export const BOSS_ANIM_STATES = [
  "idle",
  "rage",
  "roar",
  "stomp",
  "fire_breath",
] as const;

export const BOSS_ANIM_MIN = 10;
export const BOSS_ANIM_MAX = 15;
