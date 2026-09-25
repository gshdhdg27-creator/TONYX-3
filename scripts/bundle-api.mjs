import { build } from "esbuild";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

mkdirSync(path.resolve(root, "api"), { recursive: true });

const CJS_SHIM =
  "import { createRequire } from 'module';" +
  "const require = createRequire(import.meta.url);";

await build({
  entryPoints: [path.resolve(root, "artifacts/api-server/src/app.ts")],
  bundle: true,
  platform: "node",
  target: ["node20"],
  format: "esm",
  outfile: path.resolve(root, "api/_bundled.mjs"),
  external: [
    "pg-native",
    "better-sqlite3",
    "oracledb",
    "mysql",
    "mysql2",
    "tedious",
    "sqlite3",
  ],
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  banner: { js: CJS_SHIM },
  minify: false,
  logLevel: "info",
  alias: {
    "@workspace/db": path.resolve(root, "lib/db/src/index.ts"),
    "@workspace/db/schema": path.resolve(root, "lib/db/src/schema/index.ts"),
    "@workspace/api-zod": path.resolve(root, "lib/api-zod/src/index.ts"),
  },
});

console.log("OK api/_bundled.mjs ready");
