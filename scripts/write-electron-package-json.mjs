// The root package.json is ESM ("type": "module"), but the Electron main process is compiled to CommonJS.
// This writes a nested package.json so Node treats dist-electron/*.js as CommonJS.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist-electron');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'package.json'), `${JSON.stringify({ type: 'commonjs', private: true }, null, 2)}\n`);
console.log('Wrote dist-electron/package.json (type: commonjs)');
