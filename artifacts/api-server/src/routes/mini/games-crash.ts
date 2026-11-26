import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { settleSingleRoundGame } from "../../lib/game-balance.js";
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";
import { createHash, createHmac } from "crypto";

const router: IRouter = Router();

const MIN_STAKE = 0.1;
const MAX_CASHOUT = 100;

/** Global schedule */
export const ROUND_MS = 20_000;
export const BETTING_MS = 10_000;
export const FLY_MS = 7_500;
const RESULT_MS = ROUND_MS - BETTING_MS - FLY_MS;

const KEY_EPOCH = "crash_epoch_ms";

async function getSetting(key: string): Promise<string | null> {
  const row = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, key))
    .then((r) => r[0] ?? null);
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const existing = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, key))
    .then((r) => r[0] ?? null);
  if (existing) {
    await db
      .update(systemSettingsTable)
      .set({ value, updatedAt: new Date() })
      .where(eq(systemSettingsTable.key, key));
  } else {
    await db.insert(systemSettingsTable).values({ key, value });
  }
}

/** Epoch start for sequential rounds (1,2,3…). Created on first access. */
export async function getCrashEpoch(): Promise<number> {
  const raw = await getSetting(KEY_EPOCH);
  if (raw && Number.isFinite(Number(raw))) return Number(raw);
  const now = Date.now();
  await setSetting(KEY_EPOCH, String(now));
  return now;
}

function getCrashMasterSeed(): string {
  const seed = process.env.CRASH_SERVER_SEED ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!seed || seed.length < 32) throw new Error("CRASH_SERVER_SEED must be configured (minimum 32 characters)");
  return seed;
}
function serverSeedForRound(roundId: number): string {
  return createHmac("sha256", getCrashMasterSeed()).update(`tonyx-crash-round:${roundId}`).digest("hex");
}
function hashCrash(roundId: number): number {
  const digest = createHash("sha256").update(serverSeedForRound(roundId)).digest();
  if (digest[0]! / 256 < 0.03) return 1;
  const r = ((digest[1]! << 8) | digest[2]!) / 65536;
  const point = Math.floor((1 / (1 - r * 0.96)) * 100) / 100;
  return Math.min(MAX_CASHOUT, Math.max(1.01, point));
}
export function resolveCrash(roundId: number): number {
  return roundId < 1 ? 1 : hashCrash(roundId);
}
function roundHash(roundId: number): string {
  return createHash("sha256").update(serverSeedForRound(roundId)).digest("hex");
}

export async function getRoundState(now = Date.now()) {
  const epoch = await getCrashEpoch();
  const elapsedTotal = Math.max(0, now - epoch);
  const idx0 = Math.floor(elapsedTotal / ROUND_MS);
  const roundId = idx0 + 1; // 1, 2, 3...
  const elapsed = elapsedTotal % ROUND_MS;

  let phase: "betting" | "fly" | "result";
  let phaseElapsed: number;
  let phaseRemaining: number;

  if (elapsed < BETTING_MS) {
    phase = "betting";
    phaseElapsed = elapsed;
    phaseRemaining = BETTING_MS - elapsed;
  } else if (elapsed < BETTING_MS + FLY_MS) {
    phase = "fly";
    phaseElapsed = elapsed - BETTING_MS;
    phaseRemaining = BETTING_MS + FLY_MS - elapsed;
  } else {
    phase = "result";
    phaseElapsed = elapsed - BETTING_MS - FLY_MS;
    phaseRemaining = ROUND_MS - elapsed;
  }

  const crashPoint = phase === "betting" ? null : resolveCrash(roundId);
  const prevRoundId = roundId > 1 ? roundId - 1 : null;
  const prevCrashPoint = prevRoundId ? resolveCrash(prevRoundId) : null;

  return {
    roundId,
    phase,
    elapsed,
    phaseElapsed,
    phaseRemaining,
    bettingMs: BETTING_MS,
    flyMs: FLY_MS,
    resultMs: RESULT_MS,
    roundMs: ROUND_MS,
    epochMs: epoch,
    crashPoint,
    hash: roundHash(roundId),
    serverSeed: phase === "result" ? serverSeedForRound(roundId) : null,
    fairness: { commitment: "SHA-256(serverSeed)", outcome: "SHA-256(serverSeed)", reveal: "after round result" },
    prevRoundId,
    prevCrashPoint,
    prevHash: prevRoundId ? roundHash(prevRoundId) : null,
    prevServerSeed: prevRoundId ? serverSeedForRound(prevRoundId) : null,
    serverNow: now,
  };
}

router.get("/info", (_req, res) => {
  res.json({
    minStake: MIN_STAKE,
    maxCashout: MAX_CASHOUT,
    bettingMs: BETTING_MS,
    roundMs: ROUND_MS,
    fairness: { commitment: "SHA-256(serverSeed)", outcome: "SHA-256(serverSeed)", reveal: "serverSeed is revealed after the round" },
  });
});

router.get("/state", async (_req, res) => {
  try {
    res.json(await getRoundState());
  } catch (e: any) {
    console.error("[crash/state]", e);
    res.status(500).json({ error: e?.message ?? "state failed" });
  }
});

router.post("/play", async (req, res) => {
  try {
    if (!(await isGameEnabled("crash"))) {
      res.status(403).json({ error: GAME_DISABLED_MESSAGE });
      return;
    }

    const st = await getRoundState();
    const telegramId = String(req.body?.telegramId ?? "");
    const stakeRaw = Number(req.body?.stake);
    const cashoutAt = Number(req.body?.cashoutAt);
    const clientRound = Number(req.body?.roundId);

    if (!telegramId) {
      res.status(400).json({ error: "telegramId required" });
      return;
    }
    if (st.phase !== "betting") {
      res.status(400).json({ error: "Ставки закрыты — ждите следующий раунд" });
      return;
    }
    if (Number.isFinite(clientRound) && clientRound !== st.roundId) {
      res.status(400).json({ error: "Раунд уже сменился" });
      return;
    }
    if (!Number.isFinite(stakeRaw) || stakeRaw < MIN_STAKE) {
      res.status(400).json({ error: `Minimum stake is ${MIN_STAKE} DEMO credits` });
      return;
    }
    if (!Number.isFinite(cashoutAt) || cashoutAt < 1.01 || cashoutAt > MAX_CASHOUT) {
      res.status(400).json({ error: `cashoutAt must be 1.01–${MAX_CASHOUT}` });
      return;
    }

    const stake = Math.round(stakeRaw * 1000) / 1000;
    const cashout = Math.round(cashoutAt * 100) / 100;
    const publicCrashPoint = await resolveCrash(st.roundId);

    const effectiveCrash = publicCrashPoint;
    const won = cashout <= effectiveCrash;
    const payout = won ? Math.round(stake * cashout * 1000) / 1000 : 0;
    const newBalance = await settleSingleRoundGame({ telegramId, stake, payout, won });
    if (newBalance === null) {
      res.status(400).json({ error: "User not found or insufficient balance" });
      return;
    }

    res.json({
      ok: true,
      roundId: st.roundId,
      hash: roundHash(st.roundId),
      stake,
      cashoutAt: cashout,
      publicCrashPoint,
      crashPoint: effectiveCrash,
      won,
      payout,
      profit: won ? Math.round((payout - stake) * 1000) / 1000 : -stake,
      newBalance,
      phaseRemaining: st.phaseRemaining,
    });
  } catch (e: any) {
    console.error("[crash/play]", e);
    res.status(500).json({ error: e?.message ?? "Crash failed" });
  }
});

export default router;
