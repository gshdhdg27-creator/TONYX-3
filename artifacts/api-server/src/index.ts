import app from "./app";
import { logger } from "./lib/logger";
import { startDepositScanner } from "./services/depositScanner.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Long-running process (Replit / dedicated server): scan deposits every 15s.
  // On Vercel serverless this path is unused — cron hits /api/cron/scan-deposits instead.
  try {
    startDepositScanner();
  } catch (e) {
    logger.error({ err: e }, "Failed to start deposit scanner");
  }
});
