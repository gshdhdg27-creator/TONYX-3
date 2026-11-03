import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, systemSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { isGameEnabled, GAME_DISABLED_MESSAGE } from "../../lib/game-config.js";
import { createHash } from "crypto";

const router: IRouter = Router();

const MIN_STAKE = 0.1;
const MAX_CASHOUT = 100;

/** Global schedule */
export const ROUND_MS = 20_000;
export const BETTING_MS = 10_000;
export const FLY_MS = 7_500;
const RESULT_MS = ROUND_MS - BETTING_MS - FLY_MS;

const KEY_EPOCH = "crash_epoch_ms";
const KEY_OVERRIDES = "crash_overrides"; // JSON { "1": 2.5, "2": 1.01 }

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

export async function resetCrashRounds(): Promise<{ epoch: number }> {
  const now = Date.now();
  await setSetting(KEY_EPOCH, String(now));
  await setSetting(KEY_OVERRIDES, "{}");
  return { epoch: now };
}

async function getOverrides(): Promise<Record<string, number>> {
  try {
    const raw = await getSetting(KEY_OVERRIDES);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

export async function setCrashOverride(roundId: number, mult: number): Promise<void> {
  const o = await getOverrides();
  o[String(roundId)] = Math.round(mult * 100) / 100;
  await setSetting(KEY_OVERRIDES, JSON.stringify(o));
}

/** Hash fallback — same for all players */
function hashCrash(roundId: number): number {
  const h = createHash("sha256").update(`tonyx-crash-seq-${roundId}`).digest();
  const r = h[0]! / 255;
  if (r < 0.03) return 1;
  const r2 = ((h[1]! << 8) | h[2]!) / 65535;
  const point = Math.floor((1 / (1 - r2 * 0.96)) * 100) / 100;
  return Math.min(MAX_CASHOUT, Math.max(1.01, point));
}

export async function resolveCrash(roundId: number): Promise<number> {
  if (roundId < 1) return 1;
  const o = await getOverrides();
  const forced = o[String(roundId)];
  if (typeof forced === "number" && forced >= 1) {
    return Math.min(MAX_CASHOUT, Math.max(1, Math.round(forced * 100) / 100));
  }
  return hashCrash(roundId);
}

function roundHash(roundId: number): string {
  return createHash("sha256").update(`tonyx-crash-seq-${roundId}`).digest("hex").slice(0, 12);
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

  const crashPoint = phase === "betting" ? null : await resolveCrash(roundId);
  const prevRoundId = roundId > 1 ? roundId - 1 : null;
  const prevCrashPoint = prevRoundId ? await resolveCrash(prevRoundId) : null;

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
    prevRoundId,
    prevCrashPoint,
    prevHash: prevRoundId ? roundHash(prevRoundId) : null,
    serverNow: now,
  };
}

router.get("/info", (_req, res) => {
  res.json({
    minStake: MIN_STAKE,
    maxCashout: MAX_CASHOUT,
    bettingMs: BETTING_MS,
    roundMs: ROUND_MS,
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
      res.status(400).json({ error: `Minimum stake is ${MIN_STAKE} TON` });
      return;
    }
    if (!Number.isFinite(cashoutAt) || cashoutAt < 1.01 || cashoutAt > MAX_CASHOUT) {
      res.status(400).json({ error: `cashoutAt must be 1.01–${MAX_CASHOUT}` });
      return;
    }

    const stake = Math.round(stakeRaw * 1000) / 1000;
    const cashout = Math.round(cashoutAt * 100) / 100;
    const publicCrashPoint = await resolveCrash(st.roundId);

    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .then((r) => r[0] ?? null);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const bal = Number(user.ton ?? 0);
    if (bal < stake) {
      res.status(400).json({ error: `Insufficient TON. You have ${bal}` });
      return;
    }

    let effectiveCrash = publicCrashPoint;
    if (user.forceWin) {
      effectiveCrash = Math.max(publicCrashPoint, Math.round((cashout + 0.15) * 100) / 100);
    }

    const won = cashout <= effectiveCrash;
    let newBalance = Math.round((bal - stake) * 1000) / 1000;
    let payout = 0;

    if (won) {
      payout = Math.round(stake * cashout * 1000) / 1000;
      newBalance = Math.round((newBalance + payout) * 1000) / 1000;
      await db
        .update(usersTable)
        .set({
          ton: String(newBalance),
          wins: (user.wins ?? 0) + 1,
          totalGamesPlayed: (user.totalGamesPlayed ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.telegramId, telegramId));
    } else {
      await db
        .update(usersTable)
        .set({
          ton: String(newBalance),
          losses: (user.losses ?? 0) + 1,
          totalGamesPlayed: (user.totalGamesPlayed ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.telegramId, telegramId));
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
