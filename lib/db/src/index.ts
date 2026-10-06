import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const connectionString =
  process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// HTTP-драйвер Neon — стабильно работает на Vercel serverless
const sql = neon(connectionString);

export const db = drizzle(sql, { schema });

export { db as default };
export * from "./schema";
