import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Serve built frontend static assets ───────────────────────────────────────
// Resolves from api-server/src/ → workspace root → mini-app/dist/public
const frontendDist = path.resolve(__dirname, "../../mini-app/dist/public");
app.use(express.static(frontendDist, { index: false }));

// ─── API routes ───────────────────────────────────────────────────────────────
// Mount at /api (dev via Vite proxy, and standard production usage)
app.use("/api", router);
// Mount at / too — Vercel serverless functions may strip the /api prefix
app.use("/", router);

// ─── SPA fallback ─────────────────────────────────────────────────────────────
// Any route that didn't match API routes → serve index.html (React Router handles it)
// Express 5 requires named wildcard: "/{*path}" instead of "*"
app.get("/{*path}", (_req: Request, res: Response) => {
  const indexPath = path.join(frontendDist, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).json({ error: "Not found" });
    }
  });
});

// ─── Global JSON error handler ────────────────────────────────────────────────
// Express 5 catches async throws automatically; without this handler the default
// returns an HTML error page (causing "Unexpected token '<'" on the client).
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status =
    (err as { status?: number })?.status ??
    (err as { statusCode?: number })?.statusCode ??
    500;
  const message = err instanceof Error ? err.message : "Internal server error";
  console.error("[Error]", err);
  res.status(status).json({ error: message });
});

export default app;
