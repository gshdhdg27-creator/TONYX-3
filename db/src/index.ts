import * as schema from "./schema";
import path from "path";

// Extract a real postgres URL even if the env var contains a full .env block with comments
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
console.log("[DB] Resolved connection:", connectionString ? connectionString.substring(0, 40) + "…" : "NONE — will use in-memory PGlite (data will not persist)");

let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle> | ReturnType<typeof import("drizzle-orm/pglite").drizzle>;
let client: any;

const isPostgres = connectionString && (
  connectionString.startsWith("postgresql") || connectionString.startsWith("postgres://")
);

if (isPostgres) {
  try {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");

    client = new Pool({
      connectionString,
      ssl: connectionString.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000,
    });

    client.on("error", (err: Error) => {
      console.error("[DB] Pool client error:", err.message);
    });

    // Test the connection eagerly so we fail fast with a clear message
    try {
      const testClient = await client.connect();
      testClient.release();
      console.log("[DB] Connection test passed — PostgreSQL ready");
    } catch (connErr) {
      console.error("[DB] CRITICAL: Cannot connect to PostgreSQL:", connErr instanceof Error ? connErr.message : connErr);
      console.error("[DB] Check that DATABASE_URL or NEON_DATABASE_URL is correct and the DB is reachable.");
    }

    db = drizzle(client, { schema });
    console.log("Connected to PostgreSQL database");
  } catch (initErr) {
    console.error("[DB] DATABASE INITIALIZATION ERROR:", initErr instanceof Error ? initErr.message : initErr);
    // Fall through to PGlite so the process doesn't crash — routes will return 500 for DB ops
    throw initErr;
  }
} else {
  console.warn("[DB] WARNING: No PostgreSQL URL found.");
  console.warn("[DB] Set DATABASE_URL or NEON_DATABASE_URL environment variable to connect to a real database.");
  console.warn("[DB] Falling back to in-memory PGlite — tables may not exist, DB ops will fail in production.");

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  // Use memory mode (no file path) so it works in Vercel serverless
  client = new PGlite();
  db = drizzle(client, { schema }) as any;

  migrate(db as any, { migrationsFolder: path.join(import.meta.dirname, "..", "migrations") })
    .then(() => console.log("[DB] PGlite migrations applied"))
    .catch((err) => console.error("[DB] PGlite migration failed:", err));
}

export { db, client };
export * from "./schema";
