/**
 * Vercel-specific bundle: api-server/src/app.ts → ../api/server.mjs
 *
 * Outputs a single self-contained ESM file that Vercel picks up directly
 * as a serverless function at /api/server (no extra import indirection).
 *
 * Run from root: node scripts/bundle-api.mjs
 *   or:          pnpm --filter @workspace/api-server exec node build-vercel.mjs
 */
import { build } from "esbuild";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

mkdirSync(path.resolve(root, "api"), { recursive: true });

// CJS shim — required for ESM output that uses require() internally (express, pg, etc.)
const CJS_SHIM =
  "import { createRequire } from 'module';" +
  "import { fileURLToPath as __ftu } from 'url';" +
  "import { dirname as __dn } from 'path';" +
  "const require = createRequire(import.meta.url);" +
  "const __filename = __ftu(import.meta.url);" +
  "const __dirname = __dn(__filename);";

// Packages that cannot be bundled (native addons, optional drivers)
const EXTERNAL = [
  "pg-native",
  "better-sqlite3",
  "oracledb",
  "mysql",
  "mysql2",
  "tedious",
  "sqlite3",
  "pg-query-stream",
];

await build({
  entryPoints: [path.resolve(__dirname, "src/app.ts")],
  bundle: true,
  platform: "node",
  target: ["node20"],
  format: "esm",
  // Output DIRECTLY as api/server.mjs — Vercel treats this as the serverless
  // function for /api/server without any extra wrapper file.
  outfile: path.resolve(root, "api/server.mjs"),
  external: EXTERNAL,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  banner: { js: CJS_SHIM },
  minify: false,
  logLevel: "info",
  alias: {
    "@workspace/db":        path.resolve(root, "db/src/index.ts"),
    "@workspace/db/schema": path.resolve(root, "db/src/schema/index.ts"),
    "@workspace/api-zod":   path.resolve(root, "api-zod/src/index.ts"),
  },
  tsconfig: path.resolve(__dirname, "tsconfig.json"),
});

console.log("✅  api/server.mjs ready");
