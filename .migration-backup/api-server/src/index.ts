import app from "./app.js";
import { startBot } from "./bot.js";
import { startDepositScanner } from "./services/depositScanner.js";

// Start the Telegram bot
startBot();

// Start background deposit scanner
startDepositScanner();

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

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
