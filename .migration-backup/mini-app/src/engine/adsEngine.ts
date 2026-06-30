export type AdRewardType =
  | "RESPAWN_BOSS"
  | "DPS_BOOST"
  | "FINISH_BOSS";

export interface AdProgress {
  rewardType: AdRewardType;

  watched: number;

  required: number;

  completed: boolean;
}

export interface ActiveBoost {
  active: boolean;

  expiresAt: number | null;

  multiplier: number;
}

const STORAGE_KEY =
  "boss_hunt_ads_progress";

const BOOST_STORAGE_KEY =
  "boss_hunt_dps_boost";

export const RESPAWN_ADS_REQUIRED = 10;

export const DPS_BOOST_ADS_REQUIRED = 10;

export const DPS_BOOST_PERCENT = 20;

export const DPS_BOOST_DURATION =
  24 * 60 * 60 * 1000;

export function createAdProgress(
  rewardType: AdRewardType,
  required: number
): AdProgress {
  return {
    rewardType,

    watched: 0,

    required,

    completed: false
  };
}

export function watchAd(
  progress: AdProgress
): AdProgress {

  const watched =
    progress.watched + 1;

  return {
    ...progress,

    watched,

    completed:
      watched >=
      progress.required
  };
}

export function getProgressPercent(
  progress: AdProgress
): number {

  return Math.min(
    100,
    Math.floor(
      (progress.watched /
        progress.required) *
        100
    )
  );
}

export function createDpsBoost(): ActiveBoost {
  return {
    active: true,

    expiresAt:
      Date.now() +
      DPS_BOOST_DURATION,

    multiplier: 1.2
  };
}

export function isBoostActive(
  boost: ActiveBoost | null
): boolean {

  if (!boost) {
    return false;
  }

  if (!boost.active) {
    return false;
  }

  if (!boost.expiresAt) {
    return false;
  }

  return (
    Date.now() <
    boost.expiresAt
  );
}

export function getBoostMultiplier(
  boost: ActiveBoost | null
): number {

  if (
    !isBoostActive(
      boost
    )
  ) {
    return 1;
  }

  return boost!.multiplier;
}

export function saveAdProgress(
  progress: AdProgress[]
) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(progress)
  );
}

export function loadAdProgress():
  | AdProgress[]
  | null {

  const raw =
    localStorage.getItem(
      STORAGE_KEY
    );

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveBoost(
  boost: ActiveBoost
) {
  localStorage.setItem(
    BOOST_STORAGE_KEY,
    JSON.stringify(boost)
  );
}

export function loadBoost():
  | ActiveBoost
  | null {

  const raw =
    localStorage.getItem(
      BOOST_STORAGE_KEY
    );

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
