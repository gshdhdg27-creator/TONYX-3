import {
  Hero,
  BattleHeroSlot,
  SlotUnlockData
} from "../types/game";

export const HEROES: Hero[] = [
  {
    id: 1,
    name: "Маг Новичок",
    element: "arcane",
    attackType: "energy_ball",
    dps: 0.1,
    attackSpeed: 3,
    unlocked: true
  },

  {
    id: 2,
    name: "Ледяной Маг",
    element: "ice",
    attackType: "ice_arrow",
    dps: 0.3,
    attackSpeed: 2.5,
    unlocked: false,
    requiredTonyx: 500
  },

  {
    id: 3,
    name: "Огненный Маг",
    element: "fire",
    attackType: "fireball",
    dps: 0.6,
    attackSpeed: 2.2,
    unlocked: false,
    requiredTonyx: 1000
  },

  {
    id: 4,
    name: "Маг Молний",
    element: "lightning",
    attackType: "thunder_strike",
    dps: 1.2,
    attackSpeed: 1.8,
    unlocked: false,
    requiredTonyx: 2500
  },

  {
    id: 5,
    name: "Маг Ветра",
    element: "wind",
    attackType: "tornado",
    dps: 2,
    attackSpeed: 1.7,
    unlocked: false,
    requiredTonyx: 5000
  },

  {
    id: 6,
    name: "Теневой Маг",
    element: "shadow",
    attackType: "shadow_beam",
    dps: 3.5,
    attackSpeed: 1.5,
    unlocked: false,
    requiredTonyx: 10000,
    requiredTon: 0.25
  },

  {
    id: 7,
    name: "Маг Кристаллов",
    element: "crystal",
    attackType: "crystal_shards",
    dps: 6,
    attackSpeed: 1.4,
    unlocked: false,
    requiredTonyx: 20000,
    requiredTon: 0.5
  },

  {
    id: 8,
    name: "Маг Пустоты",
    element: "void",
    attackType: "void_portal",
    dps: 10,
    attackSpeed: 1.3,
    unlocked: false,
    requiredTonyx: 35000,
    requiredTon: 1
  },

  {
    id: 9,
    name: "Архимаг",
    element: "ancient",
    attackType: "ancient_beam",
    dps: 18,
    attackSpeed: 1.2,
    unlocked: false,
    requiredTonyx: 50000,
    requiredTon: 2
  },

  {
    id: 10,
    name: "Король Магов",
    element: "royal",
    attackType: "royal_magic",
    dps: 40,
    attackSpeed: 1,
    unlocked: false,
    requiredTon: 5,
    isKingMage: true
  }
];

export const DEFAULT_HERO_SLOTS: BattleHeroSlot[] = [
  {
    slotId: 1,
    unlocked: true,
    heroId: 1
  },

  {
    slotId: 2,
    unlocked: false,
    heroId: null
  },

  {
    slotId: 3,
    unlocked: false,
    heroId: null
  },

  {
    slotId: 4,
    unlocked: false,
    heroId: null
  },

  {
    slotId: 5,
    unlocked: false,
    heroId: null
  }
];

export const SLOT_UNLOCKS: SlotUnlockData[] = [
  {
    slotId: 2,
    tonyxCost: 2500,
    unlocked: false
  },

  {
    slotId: 3,
    tonyxCost: 7500,
    unlocked: false
  },

  {
    slotId: 4,
    tonyxCost: 15000,
    unlocked: false
  },

  {
    slotId: 5,
    tonyxCost: 30000,
    unlocked: false
  }
];

export const HERO_ATTACK_EFFECTS = {
  energy_ball: {
    projectile: true,
    effectName: "Arcane Energy Ball",
    travelTime: 700
  },

  ice_arrow: {
    projectile: true,
    effectName: "Ice Arrow",
    travelTime: 800
  },

  fireball: {
    projectile: true,
    effectName: "Fire Ball",
    travelTime: 650
  },

  thunder_strike: {
    projectile: false,
    effectName: "Thunder Strike",
    travelTime: 0
  },

  tornado: {
    projectile: true,
    effectName: "Mini Tornado",
    travelTime: 1200
  },

  shadow_beam: {
    projectile: false,
    effectName: "Shadow Beam",
    travelTime: 0
  },

  crystal_shards: {
    projectile: true,
    effectName: "Crystal Shards",
    travelTime: 500
  },

  void_portal: {
    projectile: false,
    effectName: "Void Portal",
    travelTime: 0
  },

  ancient_beam: {
    projectile: false,
    effectName: "Ancient Beam",
    travelTime: 0
  },

  royal_magic: {
    projectile: false,
    effectName: "Royal Magic Combo",
    travelTime: 0
  }
};

export function getHeroById(
  heroId: number
): Hero | undefined {
  return HEROES.find(hero => hero.id === heroId);
}

export function calculateTeamDps(
  equippedHeroIds: number[]
): number {
  return equippedHeroIds.reduce(
    (total, heroId) => {
      const hero = HEROES.find(
        h => h.id === heroId
      );

      if (!hero) {
        return total;
      }

      return total + hero.dps;
    },
    0
  );
}

export function isKingMage(
  heroId: number
): boolean {
  const hero = HEROES.find(
    h => h.id === heroId
  );

  return Boolean(hero?.isKingMage);
}
