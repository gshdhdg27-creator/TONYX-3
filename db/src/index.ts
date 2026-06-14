import * as schema from "./schema";
import path from "path";

// Extract a real postgres URL even if the env var contains extra whitespace/comments
function extractPgUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed.startsWith("postgresql") || trimmed.startsWith("postgres://")) return trimmed;
  const match = trimmed.match(/postgresql?:\/\/[^\s\n"']+/);
  return match ? match[0] : undefined;
}

const connectionString =
  extractPgUrl(process.env.NEON_DATABASE_URL) ??
  extractPgUrl(process.env.DATABASE_URL);

console.log("[DB] NEON_DATABASE_URL set:", !!process.env.NEON_DATABASE_URL);
console.log("[DB] DATABASE_URL set:", !!process.env.DATABASE_URL);
console.log("[DB] Resolved connection:", connectionString
  ? connectionString.substring(0, 40) + "…"
  : "NONE — will use in-memory PGlite (data will not persist)");

let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle> | ReturnType<typeof import("drizzle-orm/pglite").drizzle>;
let client: any;

const isPostgres = !!connectionString && (
  connectionString.startsWith("postgresql") || connectionString.startsWith("postgres://")
);

if (isPostgres) {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");

  client = new Pool({
    connectionString,
    ssl: connectionString.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
    max: 5,
    idleTimeoutMillis: 30000,
    // Shorter timeout so Vercel cold starts don't wait 8 s before failing
    connectionTimeoutMillis: 5000,
  });

  client.on("error", (err: Error) => {
    console.error("[DB] Pool client error:", err.message);
  });

  // Lazy connection — no eager test here. The first query will validate
  // the connection and produce a clear error if the URL is wrong.
  // This keeps Vercel cold-start time low.
  db = drizzle(client, { schema });
  console.log("[DB] PostgreSQL pool created for:", connectionString.substring(0, 50) + "…");
} else {
  console.warn("[DB] WARNING: No PostgreSQL URL found.");
  console.warn("[DB] Set NEON_DATABASE_URL or DATABASE_URL in your environment.");
  console.warn("[DB] Falling back to in-memory PGlite — tables may not exist, DB ops will fail in production.");

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  // Use memory mode (no file path) — works in Vercel serverless
  client = new PGlite();
  db = drizzle(client, { schema }) as any;

  // Migrations are async and non-blocking
  migrate(db as any, { migrationsFolder: path.join(__dirname, "..", "migrations") })
    .then(() => console.log("[DB] PGlite migrations applied"))
    .catch((err: Error) => console.error("[DB] PGlite migration failed:", err.message));
}

export { db, client };
export * from "./schema";
