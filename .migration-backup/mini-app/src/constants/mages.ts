import type { MageConfig } from "../types/game";

export const MAGES: MageConfig[] = [
  {
    id: "pyro",
    name: "Pyromancer",
    type: "fire",
    baseDps: 15,
    upgradeCost: 100,
    level: 1,
    emoji: "🔥",
    attackColor: "#ef4444",
  },
  {
    id: "frost",
    name: "Frostbinder",
    type: "ice",
    baseDps: 12,
    upgradeCost: 80,
    level: 1,
    emoji: "❄️",
    attackColor: "#60a5fa",
  },
  {
    id: "volt",
    name: "Stormcaller",
    type: "lightning",
    baseDps: 20,
    upgradeCost: 150,
    level: 1,
    emoji: "⚡",
    attackColor: "#facc15",
  },
  {
    id: "gust",
    name: "Windweaver",
    type: "wind",
    baseDps: 10,
    upgradeCost: 60,
    level: 1,
    emoji: "🌀",
    attackColor: "#34d399",
  },
  {
    id: "shadow",
    name: "Shadowmage",
    type: "fire",
    baseDps: 25,
    upgradeCost: 200,
    level: 1,
    emoji: "🌑",
    attackColor: "#a855f7",
  },
];

export const getMageDps = (mage: MageConfig): number =>
  Math.floor(mage.baseDps * Math.pow(1.4, mage.level - 1));
