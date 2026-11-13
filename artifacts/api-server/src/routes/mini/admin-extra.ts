import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, systemSettingsTable, miniTasksTable, miniUserInventoryTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const OWNER_ID = "7257793582";

function normalizeId(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).trim();
}
function extractAdminId(req: import("express").Request, res: import("express").Response): string {
  const botToken = process.env["TELEGRAM_BOT_TOKEN"];
  if (botToken) {
    return normalizeId((res.locals as Record<string, unknown>)["verifiedTelegramId"]);
  }
  return normalizeId(req.query.adminId ?? req.body?.adminId ?? req.headers["x-admin-id"]);
}

// NOTE: truncated intentionally in this intermediate call — full file follows in next push if needed
export default router;
