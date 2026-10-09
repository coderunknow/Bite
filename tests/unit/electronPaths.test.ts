import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { resolveAppPath } from '../../electron/paths';

const ROOT = path.resolve('/srv/bite/dist');

describe('desktop app:// path mapping', () => {
  it('maps the root to index.html', () => {
    expect(resolveAppPath('app://bite/', ROOT)).toBe(path.join(ROOT, 'index.html'));
    expect(resolveAppPath('app://bite', ROOT)).toBe(path.join(ROOT, 'index.html'));
  });

  it('maps asset paths inside the bundle', () => {
    expect(resolveAppPath('app://bite/assets/index-abc.js', ROOT)).toBe(path.join(ROOT, 'assets', 'index-abc.js'));
    expect(resolveAppPath('app://bite/blockly/media/sprites.svg', ROOT)).toBe(path.join(ROOT, 'blockly', 'media', 'sprites.svg'));
  });

  it('rejects traversal out of the bundle, including encoded forms', () => {
    // WHATWG URL parsing removes a leading "/.." before we see it, so this stays inside dist/.
    expect(resolveAppPath('app://bite/../secret.txt', ROOT)).toBe(path.join(ROOT, 'secret.txt'));
    // Dot segments written as %2e are normalised by the URL parser, so these stay inside dist/.
    expect(resolveAppPath('app://bite/%2e%2e/%2e%2e/etc/passwd', ROOT)).toBe(path.join(ROOT, 'etc', 'passwd'));
    expect(resolveAppPath('app://bite/assets/../../package.json', ROOT)).toBe(path.join(ROOT, 'package.json'));
    // An encoded slash survives URL parsing and becomes a real "../" after decoding: this one must be refused.
    expect(resolveAppPath('app://bite/%2e%2e%2fsecret.txt', ROOT)).toBeNull();
    expect(resolveAppPath('app://bite/assets%2f..%2f..%2fsecret.txt', ROOT)).toBeNull();
  });

  it('rejects other hosts and schemes', () => {
    expect(resolveAppPath('app://evil/index.html', ROOT)).toBeNull();
    expect(resolveAppPath('https://bite/index.html', ROOT)).toBeNull();
    expect(resolveAppPath('file:///etc/passwd', ROOT)).toBeNull();
  });
});
