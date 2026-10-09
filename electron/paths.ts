/**
 * Pure path mapping for the app:// protocol, kept free of Electron imports so it can be unit-tested.
 */
import path from 'node:path';

export const APP_SCHEME = 'app';
export const APP_HOST = 'bite';

/** Maps an app:// URL to a file inside dist/. Rejects anything that escapes the directory. */
export function resolveAppPath(urlString: string, root: string): string | null {
  const url = new URL(urlString);
  if (url.protocol !== `${APP_SCHEME}:` || url.hostname !== APP_HOST) return null;
  let rel = decodeURIComponent(url.pathname);
  if (rel === '' || rel === '/') rel = '/index.html';
  const file = path.resolve(root, '.' + rel);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return file;
}

