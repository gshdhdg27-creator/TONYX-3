import * as schema from "./schema";
import path from "path";

// Extract a real postgres URL even if the env var contains a full .env block with comments
function extractPgUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  // If it already starts with postgres, use directly
  if (trimmed.startsWith("postgresql") || trimmed.startsWith("postgres://")) return trimmed;
  // Otherwise scan for a postgresql:// or postgres:// URL inside the block
  const match = trimmed.match(/postgresql?:\/\/[^\s\n"']+/);
  return match ? match[0] : undefined;
}

const connectionString =
  extractPgUrl(process.env.NEON_DATABASE_URL) ??
  extractPgUrl(process.env.DATABASE_URL);

console.log("[DB] NEON_DATABASE_URL set:", !!process.env.NEON_DATABASE_URL);
console.log("[DB] DATABASE_URL set:", !!process.env.DATABASE_URL);
console.log("[DB] Resolved connection:", connectionString ? connectionString.substring(0, 40) + "…" : "none — will use PGlite");

// Use real PostgreSQL when a pg(sql) URL is available, otherwise fall back to PGlite
let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle> | ReturnType<typeof import("drizzle-orm/pglite").drizzle>;
let client: any;

const isPostgres = connectionString && (
  connectionString.startsWith("postgresql") || connectionString.startsWith("postgres://")
);

if (isPostgres) {
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
    console.error("[DB] Unexpected pool client error:", err.message);
  });
  db = drizzle(client, { schema });
  console.log("Connected to PostgreSQL database");
} else {
  console.warn("[DB] No PostgreSQL URL found — falling back to PGlite (dev only)");
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  client = new PGlite("./dev.db");
  db = drizzle(client, { schema }) as any;

  migrate(db as any, { migrationsFolder: path.join(import.meta.dirname, "..", "migrations") })
    .then(() => console.log("Database migrated successfully"))
    .catch((err) => console.error("Database migration failed:", err));
}

export { db, client };
export * from "./schema";
