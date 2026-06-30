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
