import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-telegram-init-data", "x-telegram-user-id"],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status =
    (err as { status?: number })?.status ??
    (err as { statusCode?: number })?.statusCode ??
    500;
  const message = err instanceof Error ? err.message : "Internal server error";
  logger.error({ err }, "Unhandled error");
  res.status(status).json({ error: message });
});

export default app;
