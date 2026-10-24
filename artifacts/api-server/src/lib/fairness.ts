import { createHash, randomBytes } from "crypto";

export function generateServerSeed(): string {
  return randomBytes(32).toString("hex");
}

export function hashServerSeed(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

export function computeFairnessHash(serverSeed: string, clientSeed: string, nonce: number): string {
  return createHash("sha256").update(`${serverSeed}${clientSeed}${nonce}`).digest("hex");
}

export function hashToFloat(hash: string): number {
  return parseInt(hash.slice(0, 8), 16) / 0xffffffff;
}

export function pickWinnerByHash<T extends { stake: number }>(
  hash: string,
  players: T[],
  totalPool: number,
): T {
  const rand = hashToFloat(hash) * totalPool;
  let acc = 0;
  for (const p of players) {
    acc += p.stake;
    if (rand <= acc) return p;
  }
  return players[players.length - 1];
}

/** Arena winner payout: stake + (pool - stake) * (1 - commission). Default house edge 20%. */
export function arenaPayout(
  stake: number,
  pool: number,
  commission = 0.2,
): number {
  if (stake < 0 || pool < 0) return 0;
  const safeStake = Math.min(stake, pool);
  return Math.round((safeStake + (pool - safeStake) * (1 - commission)) * 1000) / 1000;
}

/** House edge amount retained from non-winner stakes. */
export function arenaHouseCut(
  stake: number,
  pool: number,
  commission = 0.2,
): number {
  if (stake < 0 || pool < 0) return 0;
  const safeStake = Math.min(stake, pool);
  return Math.round((pool - safeStake) * commission * 1000) / 1000;
}
