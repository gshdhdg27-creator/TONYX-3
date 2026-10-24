import { describe, it, expect } from "vitest";
import {
  generateServerSeed,
  hashServerSeed,
  computeFairnessHash,
  hashToFloat,
  pickWinnerByHash,
  arenaPayout,
  arenaHouseCut,
} from "./fairness.js";

describe("generateServerSeed", () => {
  it("returns 64 hex chars (32 bytes)", () => {
    const seed = generateServerSeed();
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces unique values across calls", () => {
    expect(generateServerSeed()).not.toBe(generateServerSeed());
  });
});

describe("hashServerSeed", () => {
  it("is deterministic sha256 hex", () => {
    expect(hashServerSeed("abc")).toBe(hashServerSeed("abc"));
    expect(hashServerSeed("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when seed changes", () => {
    expect(hashServerSeed("a")).not.toBe(hashServerSeed("b"));
  });
});

describe("computeFairnessHash", () => {
  it("combines serverSeed + clientSeed + nonce deterministically", () => {
    const a = computeFairnessHash("s", "c", 1);
    expect(a).toBe(computeFairnessHash("s", "c", 1));
    expect(a).not.toBe(computeFairnessHash("s", "c", 2));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hashToFloat", () => {
  it("returns value in [0, 1)", () => {
    const f = hashToFloat("00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThan(1);
  });

  it("maps all-zero prefix to 0", () => {
    expect(hashToFloat("00000000" + "a".repeat(56))).toBe(0);
  });

  it("maps high prefix near 1", () => {
    const f = hashToFloat("ffffffff" + "0".repeat(56));
    expect(f).toBeGreaterThan(0.99);
    expect(f).toBeLessThan(1);
  });
});

describe("pickWinnerByHash", () => {
  it("returns the only player when pool has one entrant", () => {
    const players = [{ stake: 5, id: "solo" }];
    const hash = computeFairnessHash("seed", "client", 0);
    expect(pickWinnerByHash(hash, players, 5).id).toBe("solo");
  });

  it("returns a player from a two-player pool", () => {
    const players = [
      { stake: 1, id: "a" },
      { stake: 1, id: "b" },
    ];
    const hash = "ffffffff" + "0".repeat(56);
    expect(["a", "b"]).toContain(pickWinnerByHash(hash, players, 2).id);
  });

  it("favors larger stake statistically over many rolls", () => {
    const players = [
      { stake: 90, id: "big" },
      { stake: 10, id: "small" },
    ];
    let bigWins = 0;
    for (let nonce = 0; nonce < 400; nonce++) {
      const hash = computeFairnessHash("server", "client", nonce);
      if (pickWinnerByHash(hash, players, 100).id === "big") bigWins++;
    }
    expect(bigWins).toBeGreaterThan(300);
    expect(bigWins).toBeLessThan(390);
  });

  it("handles equal three-way stakes", () => {
    const players = [
      { stake: 1, id: "x" },
      { stake: 1, id: "y" },
      { stake: 1, id: "z" },
    ];
    const hash = computeFairnessHash("s", "c", 7);
    expect(["x", "y", "z"]).toContain(pickWinnerByHash(hash, players, 3).id);
  });

  it("handles very skewed stakes without throwing", () => {
    const players = [
      { stake: 0.001, id: "dust" },
      { stake: 999.999, id: "whale" },
    ];
    const hash = computeFairnessHash("s", "c", 3);
    expect(["dust", "whale"]).toContain(pickWinnerByHash(hash, players, 1000).id);
  });
});

describe("arenaPayout (20% house edge)", () => {
  it("single player: payout equals stake", () => {
    expect(arenaPayout(10, 10, 0.2)).toBe(10);
  });

  it("two equal stakes: winner gets stake + 80% of opponent", () => {
    expect(arenaPayout(5, 10, 0.2)).toBe(9);
  });

  it("small stake still gets 80% of remaining pool", () => {
    expect(arenaPayout(1, 10, 0.2)).toBe(8.2);
  });

  it("rounds to 3 decimal places", () => {
    expect(arenaPayout(0.1, 0.3, 0.2)).toBe(0.26);
  });

  it("zero/negative inputs return 0", () => {
    expect(arenaPayout(-1, 10)).toBe(0);
    expect(arenaPayout(5, -1)).toBe(0);
  });
});

describe("arenaHouseCut", () => {
  it("is 20% of non-winner stakes", () => {
    expect(arenaHouseCut(5, 10, 0.2)).toBe(1);
  });

  it("is zero when single player fills the pool", () => {
    expect(arenaHouseCut(10, 10, 0.2)).toBe(0);
  });

  it("payout + houseCut equals pool", () => {
    const stake = 3;
    const pool = 12;
    const pay = arenaPayout(stake, pool, 0.2);
    const cut = arenaHouseCut(stake, pool, 0.2);
    expect(Math.round((pay + cut) * 1000) / 1000).toBe(pool);
  });
});
