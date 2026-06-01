/**
 * Vercel-specific bundle: api-server/src/app.ts → ../api/_bundled.mjs
 *
 * Bundles the Express app (without server.listen) into a single ESM file
 * for use as a Vercel serverless function.
 *
 * Run from api-server directory: node build-vercel.mjs
 * Or from root: pnpm --filter @workspace/api-server exec node build-vercel.mjs
 */
import { build } from "esbuild";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

// Ensure output directory exists
mkdirSync(path.resolve(root, "api"), { recursive: true });

// CJS shim — required for ESM output that uses require() internally (express, pg, etc.)
const CJS_SHIM =
  "import { createRequire } from 'module';" +
  "import { fileURLToPath as __ftu } from 'url';" +
  "import { dirname as __dn } from 'path';" +
  "const require = createRequire(import.meta.url);" +
  "const __filename = __ftu(import.meta.url);" +
  "const __dirname = __dn(__filename);";

// Packages that CANNOT be bundled (native addons, optional DB drivers)
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
  outfile: path.resolve(root, "api/_bundled.mjs"),
  external: EXTERNAL,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  banner: { js: CJS_SHIM },
  minify: false,
  logLevel: "info",
  // esbuild resolves @workspace/* through node_modules symlinks;
  // the aliases below are a safety fallback in case pnpm hoisting differs
  alias: {
    "@workspace/db":      path.resolve(root, "db/src/index.ts"),
    "@workspace/db/schema": path.resolve(root, "db/src/schema/index.ts"),
    "@workspace/api-zod": path.resolve(root, "api-zod/src/index.ts"),
  },
  tsconfig: path.resolve(__dirname, "tsconfig.json"),
});

console.log("✅  api/_bundled.mjs ready");
