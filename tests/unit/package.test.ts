import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readPackage, readProjectJson, isSafeAssetPath, extensionFor } from '../../src/io/projectPackage';
import { createEmptyProject } from '../../src/core/project';

const validProject = () => createEmptyProject({ id: 'ok', name: 'Ok', now: new Date(0) });
const zip = (files: Record<string, Uint8Array | string>) => {
  const out: Record<string, Uint8Array> = {};
  for (const [name, value] of Object.entries(files)) out[name] = typeof value === 'string' ? strToU8(value) : value;
  return zipSync(out);
};
const manifest = (assets: unknown[] = []) =>
  JSON.stringify({ format: 'bite.package', formatVersion: 1, appVersion: '0.1.0-beta1', createdAt: new Date(0).toISOString(), project: 'project.json', assets });
const soundEntry = (hash: string) => ({ id: hash, path: `assets/${hash}.wav`, name: 'x.wav', mime: 'audio/wav', size: 4 });

describe('malformed package files', () => {
  it('rejects bytes that are not a ZIP archive', async () => {
    await expect(readPackage(strToU8('this is not a zip file'))).rejects.toThrow();
  });

  it('rejects a package without a manifest', async () => {
    await expect(readPackage(zip({ 'project.json': JSON.stringify(validProject()) }))).rejects.toThrow(/manifest/i);
  });

  it('rejects a manifest with an unknown format', async () => {
    await expect(readPackage(zip({ 'manifest.json': JSON.stringify({ format: 'something.else', formatVersion: 1 }) }))).rejects.toThrow();
  });

  it('rejects a manifest from a newer format version', async () => {
    await expect(readPackage(zip({ 'manifest.json': JSON.stringify({ format: 'bite.package', formatVersion: 99, appVersion: 'x', createdAt: '', project: 'project.json', assets: [] }) }))).rejects.toThrow(/formatVersion/);
  });

  it('rejects project JSON that is not valid JSON', async () => {
    await expect(readPackage(zip({ 'manifest.json': manifest(), 'project.json': '{ not json' }))).rejects.toThrow();
  });

  it('rejects a project that fails schema validation', async () => {
    const broken = { ...validProject(), objects: [{ id: 'x', name: '', kind: 'spaceship' }] };
    await expect(readPackage(zip({ 'manifest.json': manifest(), 'project.json': JSON.stringify(broken) }))).rejects.toThrow();
  });

  it('refuses asset paths that try to escape the package (path traversal)', () => {
    expect(isSafeAssetPath('../../etc/passwd')).toBe(false);
    expect(isSafeAssetPath('assets/../project.json')).toBe(false);
    expect(isSafeAssetPath('/absolute/path.wav')).toBe(false);
    expect(isSafeAssetPath('C:\\evil.wav')).toBe(false);
    expect(isSafeAssetPath(`assets/${'a'.repeat(64)}.wav`)).toBe(true);
  });

  it('rejects a manifest entry whose file is missing from the archive', async () => {
    const hash = 'a'.repeat(64);
    const bad = manifest([soundEntry(hash)]);
    await expect(readPackage(zip({ 'manifest.json': bad, 'project.json': JSON.stringify(validProject()) }))).rejects.toThrow(/missing/);
  });

  it('refuses a manifest that points an asset at an unsafe path', async () => {
    const hash = 'c'.repeat(64);
    const bad = manifest([{ ...soundEntry(hash), path: '../escape.wav' }]);
    await expect(readPackage(zip({ 'manifest.json': bad, 'project.json': JSON.stringify(validProject()) }))).rejects.toThrow(/unsafe file path/);
  });

  it('rejects an asset whose bytes do not match its recorded SHA-256', async () => {
    const hash = 'b'.repeat(64);
    const bad = manifest([soundEntry(hash)]);
    const files = { 'manifest.json': bad, 'project.json': JSON.stringify(validProject()), [`assets/${hash}.wav`]: new Uint8Array([1, 2, 3, 4]) };
    await expect(readPackage(zip(files))).rejects.toThrow(/checksum/);
  });

  it('readProjectJson rejects a project JSON that declares sounds (sound files need a package)', () => {
    const withSound = { ...validProject(), sounds: [{ id: 's', name: 'S', assetId: 'a'.repeat(64) }] };
    expect(() => readProjectJson(JSON.stringify(withSound))).toThrow();
  });

  it('extensionFor maps known audio types and falls back to bin', () => {
    expect(extensionFor('audio/wav')).toBe('wav');
    expect(extensionFor('application/x-unknown')).toBe('bin');
  });
});
