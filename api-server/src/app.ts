import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import router from "./routes/index.js";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount at /api (dev via Vite proxy, and Vercel when req.url preserves the original path)
app.use("/api", router);
// Mount at / too — Vercel serverless functions may strip the /api prefix from req.url
app.use("/", router);

// JSON 404 handler — catches anything unmatched above
app.use((_req: Request, res: Response) => {
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
