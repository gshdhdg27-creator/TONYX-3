import { build } from '../node_modules/esbuild/lib/main.js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiServerRoot = resolve(__dirname, '..');
const repoRoot = resolve(apiServerRoot, '..');

await build({
  entryPoints: [resolve(apiServerRoot, 'src/app.ts')],
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
  banner: {
    js: `import { createRequire } from 'module'; import { fileURLToPath as _ftu } from 'url'; import { dirname as _dn } from 'path'; const require = createRequire(import.meta.url); const __filename = _ftu(import.meta.url); const __dirname = _dn(__filename);`,
  },
  logLevel: 'info',
});

console.log('API bundle created: api/_bundled.mjs');
