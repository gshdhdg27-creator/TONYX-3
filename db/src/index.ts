import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";
import path from "path";

const connectionString = process.env.DATABASE_URL;

export const client = connectionString 
  ? new PGlite(connectionString) 
  : new PGlite("./dev.db");

export const db = drizzle(client, { schema });

// Auto-migrate on startup
migrate(db, { migrationsFolder: path.join(import.meta.dirname, "..", "migrations") })
  .then(() => console.log("Database migrated successfully"))
  .catch((err) => console.error("Database migration failed:", err));

export * from "./schema";
