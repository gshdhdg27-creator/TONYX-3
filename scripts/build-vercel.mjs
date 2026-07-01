#!/usr/bin/env node
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

mkdirSync(resolve(repoRoot, 'api'), { recursive: true });

await build({
  entryPoints: [resolve(repoRoot, 'artifacts/api-server/src/app.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: resolve(repoRoot, 'api/_bundled.mjs'),
  external: [
    'express', 'cors', 'cookie-parser',
    'pino', 'pino-pretty', 'telegraf',
    'drizzle-orm', 'pg', '@electric-sql/pglite',
    'zod',
  ],
  banner: { js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);` },
  logLevel: 'info',
  alias: {
    "@workspace/db": resolve(repoRoot, 'lib/db/src/index.ts'),
    "@workspace/db/schema": resolve(repoRoot, 'lib/db/src/schema/index.ts'),
    "@workspace/api-zod": resolve(repoRoot, 'lib/api-zod/src/index.ts'),
  }
});

console.log('API bundle created: api/_bundled.mjs');
