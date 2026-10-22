# Provably Fair

## Scope today

**Arena** uses commit–reveal style server seeds. Mines / Coin Flip / Spin should be audited and aligned to the same library over Priority 1.

## Algorithm (Arena)

```text
serverSeed     = randomBytes(32).hex
serverSeedHash = sha256(serverSeed)          # published while round open

fairnessHash   = sha256(serverSeed + clientSeed + nonce)
roll           = parseInt(fairnessHash[0..8], 16) / 0xffffffff
threshold      = roll * totalPool

winner = first player where cumulative(stake) >= threshold
```

Code: `artifacts/api-server/src/lib/fairness.ts`

- `generateServerSeed` / `hashServerSeed`
- `computeFairnessHash`
- `pickWinnerByHash`

After the round finishes, API may expose `serverSeed`, `clientSeed`, `nonce`, and `fairnessHash` for verification (`/api/mini/games/arena/fair/:id` and history payloads).

## House edge (documented)

| Game | Edge (approx.) | Notes |
|------|----------------|-------|
| Arena | 20% of non-winner pot | Winner receives stake + 80% of others’ stakes |
| Coin Flip | ~4% | Multiplier **1.92** on even money |
| Mines | Variable | Depends on grid/mines config |
| Spin | Variable | Wheel weights |

## Player verification steps

1. Copy `serverSeed`, `clientSeed`, `nonce` from finished round.
2. Compute `sha256(serverSeed)` and confirm it matches the pre-round hash (if you saved it).
3. Compute `sha256(serverSeed + clientSeed + nonce)` and map to the weighted winner list.

## Roadmap

- [ ] Public fairness explorer page in the Mini App
- [ ] Unit tests for every money game RNG path (≥80% on `fairness.ts`)
- [ ] Optional TON on-chain commit of `serverSeedHash`
