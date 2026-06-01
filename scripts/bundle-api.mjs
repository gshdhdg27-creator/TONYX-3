/**
 * Vercel build script — bundles api-server/src/app.ts into api/_bundled.mjs
 * Runs inside the monorepo root: node scripts/bundle-api.mjs
 * esbuild is a devDependency of @workspace/api-server (resolved via pnpm filter)
 */
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Ensure api/ directory exists
mkdirSync(resolve(root, "api"), { recursive: true });

console.log("[bundle-api] Bundling api-server/src/app.ts → api/_bundled.mjs");

execSync(
  "pnpm --filter @workspace/api-server exec node build-vercel.mjs",
  { cwd: root, stdio: "inherit" }
);

console.log("[bundle-api] Done ✅");
