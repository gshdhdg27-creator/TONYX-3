import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import router from "./routes/index.js";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// JSON 404 handler for any unmatched /api/* path
app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Global JSON error handler — must be last.
// Express 5 catches async throws automatically; without this, the default
// handler returns an HTML error page (causing "Unexpected token '<'" on client).
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode
    ?? 500;
  const message =
    err instanceof Error ? err.message : "Internal server error";
  console.error("[Error]", err);
  res.status(status).json({ error: message });
});

export default app;
