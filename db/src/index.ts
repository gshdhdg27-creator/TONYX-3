import * as schema from "./schema";
import path from "path";

const connectionString = process.env.DATABASE_URL;

// Use real PostgreSQL when DATABASE_URL is set, otherwise fall back to PGlite (local dev)
let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle> | ReturnType<typeof import("drizzle-orm/pglite").drizzle>;
let client: any;

if (connectionString && connectionString.startsWith("postgresql")) {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");

  client = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  client.on("error", (err: Error) => {
    console.error("[DB] Unexpected pool client error:", err.message);
  });
  db = drizzle(client, { schema });
  console.log("Connected to PostgreSQL database");
} else {
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
