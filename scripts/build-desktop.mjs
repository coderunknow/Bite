// Bundles the Electron main and preload processes and copies the web build next to them.
// Run after `npm run build` (vite build writes dist/web).
import { build } from 'esbuild';
import { cp, rm, access } from 'node:fs/promises';

await access('dist/web/index.html').catch(() => {
  throw new Error('dist/web is missing. Run "npm run build" first.');
});
await rm('dist/desktop', { recursive: true, force: true });

const shared = { bundle: true, platform: 'node', format: 'cjs', target: 'node20', external: ['electron'], sourcemap: true, logLevel: 'warning' };
await build({ ...shared, entryPoints: ['electron/main.ts'], outfile: 'dist/desktop/main.cjs' });
await build({ ...shared, entryPoints: ['electron/preload.ts'], outfile: 'dist/desktop/preload.cjs' });
await cp('dist/web', 'dist/desktop/web', { recursive: true });
console.log('Desktop bundle written to dist/desktop (main.cjs, preload.cjs, web/).');
