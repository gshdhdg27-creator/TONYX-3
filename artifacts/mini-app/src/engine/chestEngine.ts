import {
  CHESTS,
  ChestType
} from "../data/chests";

export interface OpenedChestReward {
  tonyx: number;

  ton: number;

  nftFragmentDropped: boolean;

  nftDropped: boolean;

  fragmentId?: number;

  nftId?: number;
}

function random(
  min: number,
  max: number
): number {
  return Math.random() * (max - min) + min;
}

function randomInt(
  min: number,
  max: number
): number {
  return Math.floor(
    random(min, max + 1)
  );
}

function roll(
  chancePercent: number
): boolean {
  return (
    Math.random() * 100 <
    chancePercent
  );
}

export function openChest(
  chestType: ChestType
): OpenedChestReward {
  const chest =
    CHESTS[chestType];

  const tonyx =
    randomInt(
      chest.minTonyx,
      chest.maxTonyx
    );

  const ton = Number(
    random(
      chest.minTon,
      chest.maxTon
    ).toFixed(3)
  );

  const nftFragmentDropped =
    roll(
      chest.nftFragmentChance
    );

  const nftDropped =
    roll(
      chest.fullNftChance
    );

  let fragmentId:
    | number
    | undefined;

  let nftId:
    | number
    | undefined;

  if (
    nftFragmentDropped
  ) {
    fragmentId =
      randomInt(1, 50);
  }

  if (nftDropped) {
    nftId =
      randomInt(1, 20);
  }

  return {
    tonyx,

    ton,

    nftFragmentDropped,

    nftDropped,

    fragmentId,

    nftId
  };
}

export function openMultipleChests(
  chestType: ChestType,
  amount: number
) {
  const rewards: OpenedChestReward[] =
    [];

  for (
    let i = 0;
    i < amount;
    i++
  ) {
    rewards.push(
      openChest(
        chestType
      )
    );
  }

  return rewards;
}

export function calculateTotalTonyx(
  rewards: OpenedChestReward[]
) {
  return rewards.reduce(
    (
      total,
      reward
    ) =>
      total +
      reward.tonyx,
    0
  );
}

export function calculateTotalTon(
  rewards: OpenedChestReward[]
) {
  return Number(
    rewards
      .reduce(
        (
          total,
          reward
        ) =>
          total +
          reward.ton,
        0
      )
      .toFixed(3)
  );
}

export function countFragments(
  rewards: OpenedChestReward[]
) {
  return rewards.filter(
    reward =>
      reward.nftFragmentDropped
  ).length;
}

export function countNFTs(
  rewards: OpenedChestReward[]
) {
  return rewards.filter(
    reward =>
      reward.nftDropped
  ).length;
}
