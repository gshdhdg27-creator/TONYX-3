import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.put("/", async (req, res) => {
  try {
    const { telegramId, language } = req.body as { telegramId?: string; language?: string };
    if (!telegramId || typeof telegramId !== "string") {
      res.status(400).json({ error: "telegramId required" });
      return;
    }
    if (language !== "ru" && language !== "en") {
      res.status(400).json({ error: "language must be 'ru' or 'en'" });
      return;
    }
    await db
      .update(usersTable)
      .set({ language, updatedAt: new Date() })
      .where(eq(usersTable.telegramId, telegramId));
    res.json({ ok: true, language });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
