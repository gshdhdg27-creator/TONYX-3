/**
 * Vercel build script — bundles api-server/src/app.ts into api/_bundled.mjs
 * api/server.ts (committed) imports this generated file at runtime.
 *
 * Run from root: node scripts/bundle-api.mjs
 * Or:           pnpm --filter @workspace/api-server exec node build-vercel.mjs
 */
import { build } from "esbuild";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

mkdirSync(path.resolve(root, "api"), { recursive: true });

// CJS shim — required for ESM output that uses require() internally
// Note: __filename/__dirname are NOT declared here because app.ts (the entry
// point) already declares them with the same names. Declaring them in the
// banner too causes "Identifier '__filename' has already been declared" when
// esbuild inlines the entry-point module into the top-level bundle scope.
const CJS_SHIM =
  "import { createRequire } from 'module';" +
  "const require = createRequire(import.meta.url);";

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
  alias: {
    "@workspace/db":        path.resolve(root, "db/src/index.ts"),
    "@workspace/db/schema": path.resolve(root, "db/src/schema/index.ts"),
    "@workspace/api-zod":   path.resolve(root, "api-zod/src/index.ts"),
  },
  tsconfig: path.resolve(__dirname, "tsconfig.json"),
});

console.log("✅  api/_bundled.mjs ready");
