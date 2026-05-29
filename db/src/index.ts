import * as schema from "./schema";
import path from "path";

const connectionString = process.env.DATABASE_URL;

// Use real PostgreSQL when DATABASE_URL is set, otherwise fall back to PGlite (local dev)
let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle> | ReturnType<typeof import("drizzle-orm/pglite").drizzle>;
let client: any;

if (connectionString && connectionString.startsWith("postgresql")) {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");

  client = new Pool({ connectionString });
  db = drizzle(client, { schema });

  migrate(db as any, { migrationsFolder: path.join(import.meta.dirname, "..", "migrations") })
    .then(() => console.log("Database migrated successfully"))
    .catch((err) => console.error("Database migration failed:", err));
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
