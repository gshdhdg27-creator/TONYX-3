import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";

/**
 * Atomically settles a single-round game.
 * The balance check and net balance change happen in one UPDATE statement,
 * preventing concurrent requests from spending the same balance twice.
 */
export async function settleSingleRoundGame(input: {
  telegramId: string;
  stake: number;
  payout: number;
  won: boolean;
}): Promise<number | null> {
  const stake = Number(input.stake.toFixed(8));
  const delta = Number((input.payout - input.stake).toFixed(8));
  if (!Number.isFinite(stake) || stake <= 0 || !Number.isFinite(delta) || input.payout < 0) {
    throw new Error("Invalid game settlement");
  }

  const [updated] = await db
    .update(usersTable)
    .set({
      demoCredits: sql`${usersTable.demoCredits} + ${delta.toFixed(8)}`,
      wins: sql`${usersTable.wins} + ${input.won ? 1 : 0}`,
      losses: sql`${usersTable.losses} + ${input.won ? 0 : 1}`,
      totalGamesPlayed: sql`${usersTable.totalGamesPlayed} + 1`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(usersTable.telegramId, input.telegramId),
      gte(usersTable.demoCredits, stake.toFixed(8)),
    ))
    .returning({ balance: usersTable.demoCredits });

  return updated ? Number(updated.balance) : null;
}

/** Atomically debit a stake for a multi-step game such as Mines. */
export async function debitGameStake(telegramId: string, stake: number): Promise<number | null> {
  const [updated] = await db
    .update(usersTable)
    .set({ demoCredits: sql`${usersTable.demoCredits} - ${stake.toFixed(8)}`, updatedAt: new Date() })
    .where(and(eq(usersTable.telegramId, telegramId), gte(usersTable.demoCredits, stake.toFixed(8))))
    .returning({ balance: usersTable.demoCredits });
  return updated ? Number(updated.balance) : null;
}

/** Credit a completed multi-step game and update its final statistics atomically. */
export async function finishMultiStepGame(
  telegramId: string,
  payout: number,
  won: boolean,
): Promise<number | null> {
  const [updated] = await db
    .update(usersTable)
    .set({
      demoCredits: sql`${usersTable.demoCredits} + ${payout.toFixed(8)}`,
      wins: sql`${usersTable.wins} + ${won ? 1 : 0}`,
      losses: sql`${usersTable.losses} + ${won ? 0 : 1}`,
      totalGamesPlayed: sql`${usersTable.totalGamesPlayed} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.telegramId, telegramId))
    .returning({ balance: usersTable.demoCredits });
  return updated ? Number(updated.balance) : null;
}

/** Refund a stake when a multi-step game cannot be created or is safely abandoned. */
export async function refundGameStake(telegramId: string, amount: number): Promise<number | null> {
  const [updated] = await db
    .update(usersTable)
    .set({ demoCredits: sql`${usersTable.demoCredits} + ${amount.toFixed(8)}`, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, telegramId))
    .returning({ balance: usersTable.demoCredits });
  return updated ? Number(updated.balance) : null;
}
