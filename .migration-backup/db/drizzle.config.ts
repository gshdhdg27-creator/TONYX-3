import { defineConfig } from "drizzle-kit";

function extractPgUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (t.startsWith("postgresql") || t.startsWith("postgres://")) return t;
  const m = t.match(/postgresql?:\/\/[^\s\n"']+/);
  return m ? m[0] : undefined;
}

const url =
  extractPgUrl(process.env.NEON_DATABASE_URL) ??
  extractPgUrl(process.env.DATABASE_URL);

if (!url) throw new Error("No PostgreSQL URL found in NEON_DATABASE_URL or DATABASE_URL");

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url },
});
