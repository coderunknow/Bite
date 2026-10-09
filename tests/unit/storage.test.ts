import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbProjectStorage } from '../../src/storage/indexedDbStorage';
import { MemoryProjectStorage } from '../../src/storage/memoryStorage';
import { ProjectService } from '../../src/storage/projectService';
import { exportBundle, importBundle, BundleError } from '../../src/storage/bundle';
import { validateProject } from '../../src/model/validate';
import { strToU8, zipSync } from 'fflate';
import type { ProjectStorage } from '../../src/storage/types';
import type { Project } from '../../src/model/types';

async function backends(): Promise<{ name: string; make: () => Promise<ProjectStorage> }[]> {
  return [
    { name: 'indexeddb', make: async () => IndexedDbProjectStorage.open(new IDBFactory()) },
    { name: 'memory', make: async () => new MemoryProjectStorage() },
  ];
}

for (const backend of await backends()) {
  describe(`project storage (${backend.name})`, () => {
    let storage: ProjectStorage;
    let service: ProjectService;
    beforeEach(async () => {
      storage = await backend.make();
      service = new ProjectService(storage);
    });

    it('creates a starter project with saved state and built-in sounds', async () => {
      const rec = await service.create('Demo');
      expect(rec.saved).not.toBeNull();
      const loaded = await service.get(rec.id);
      expect(loaded.working.objects.map((o) => o.name)).toEqual(['Ground', 'Cube', 'Sun']);
      expect(loaded.working.sounds.length).toBeGreaterThan(0);
      const list = await service.list();
      expect(list.map((p) => p.name)).toEqual(['Demo']);
      expect(list[0]!.dirty).toBe(false);
    });

    it('tracks dirty state between the working copy and the saved snapshot', async () => {
      const rec = await service.createEmpty('Dirty');
      const edited: Project = { ...rec.working, name: 'Dirty renamed' };
      await service.saveWorking(edited);
      expect((await service.list())[0]!.dirty).toBe(true);
      await service.save(edited);
      expect((await service.list())[0]!.dirty).toBe(false);
    });

    it('reverts to the saved snapshot', async () => {
      const rec = await service.createEmpty('Original');
      await service.saveWorking({ ...rec.working, name: 'Changed' });
      const reverted = await service.revert(rec.id);
      expect(reverted.working.name).toBe('Original');
    });

    it('renames, duplicates (with assets) and deletes projects', async () => {
      const rec = await service.create('Alpha');
      const renamed = await service.rename(rec.id, 'Beta');
      expect(renamed.name).toBe('Beta');
      const copy = await service.duplicate(rec.id);
      expect(copy.id).not.toBe(rec.id);
      expect(copy.working.name).toBe('Beta (copy)');
      const sound = copy.working.sounds[0]!;
      const blob = await service.readSound(copy.id, sound.id);
      expect(blob).not.toBeNull();
      expect(blob!.size).toBe(sound.byteLength);
      await service.delete(rec.id);
      expect(await storage.getProject(rec.id)).toBeNull();
      expect(await storage.listAssets(rec.id)).toEqual([]);
      expect((await storage.listAssets(copy.id)).length).toBe(copy.working.sounds.length);
    });

    it('stores and reads settings', async () => {
      await service.setSetting('lastProject', 'abc');
      expect(await service.getSetting('lastProject')).toBe('abc');
      await service.setSetting('lastProject', null);
      expect(await service.getSetting('lastProject')).toBeNull();
    });

    it('exports and re-imports a project with its sounds as a new project', async () => {
      const rec = await service.create('Round trip');
      const bytes = await service.exportProject(rec.working);
      const imported = await service.importFile(bytes);
      expect(imported.id).not.toBe(rec.id);
      expect(imported.working.name).toBe('Round trip');
      expect(imported.working.objects.map((o) => o.id)).toEqual(rec.working.objects.map((o) => o.id));
      const sound = imported.working.sounds[0]!;
      expect((await service.readSound(imported.id, sound.id))!.size).toBe(rec.working.sounds[0]!.byteLength);
    });

    it('does not create a project when the archive is malformed', async () => {
      const before = (await service.list()).length;
      await expect(service.importFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).rejects.toBeInstanceOf(BundleError);
      expect((await service.list()).length).toBe(before);
    });
  });
}

describe('bundle format', () => {
  it('rejects archives with path traversal entries', () => {
    const zip = zipSync({ 'project.json': strToU8('{}'), '../evil.txt': strToU8('x') });
    expect(() => importBundle(zip)).toThrow(/unsafe file path/);
  });

  it('rejects archives without project.json', () => {
    const zip = zipSync({ 'readme.txt': strToU8('x') });
    expect(() => importBundle(zip)).toThrow(/no project.json/);
  });

  it('reports invalid project documents inside a valid archive', () => {
    const zip = zipSync({ 'project.json': strToU8(JSON.stringify({ format: 'bite-project', formatVersion: 1 })) });
    try {
      importBundle(zip);
      throw new Error('expected failure');
    } catch (err) {
      expect(err).toBeInstanceOf(BundleError);
      expect((err as BundleError).details.length).toBeGreaterThan(0);
    }
  });

  it('refuses a plain JSON project that references sounds', () => {
    const doc = {
      format: 'bite-project',
      formatVersion: 1,
      appVersion: '0.1.0',
      id: 'p',
      name: 'x',
      createdAt: '',
      updatedAt: '',
      settings: { gravity: [0, -9.81, 0], backgroundColor: '#000000', shadows: true, stageCamera: { position: [0, 1, 2], target: [0, 0, 0], fov: 50 }, activeCameraId: null, masterVolume: 100 },
      stage: { id: 'stage', name: 'Stage', variables: [], scripts: [] },
      objects: [],
      messages: [],
      sounds: [{ id: 's1', name: 'Pop', extension: 'wav', mimeType: 'audio/wav', byteLength: 3, durationSec: 1, builtIn: false }],
    };
    expect(validateProject(doc).ok).toBe(true);
    expect(() => importBundle(strToU8(JSON.stringify(doc)))).toThrow(/references sound files/);
  });

  it('accepts a plain project.json without sounds', () => {
    const doc = {
      format: 'bite-project',
      formatVersion: 1,
      appVersion: '0.1.0',
      id: 'p',
      name: 'Plain',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      settings: { gravity: [0, -9.81, 0], backgroundColor: '#000000', shadows: true, stageCamera: { position: [0, 1, 2], target: [0, 0, 0], fov: 50 }, activeCameraId: null, masterVolume: 100 },
      stage: { id: 'stage', name: 'Stage', variables: [], scripts: [] },
      objects: [],
      messages: [],
      sounds: [],
    };
    const result = importBundle(strToU8(JSON.stringify(doc)));
    expect(result.project.name).toBe('Plain');
    expect(result.project.id).not.toBe('p');
  });

  it('refuses to export when a sound blob is missing', async () => {
    const project = (await import('../../src/model/defaults')).createStarterProject('x', (await import('../../src/model/builtInSounds')).BUILT_IN_SOUNDS);
    await expect(exportBundle(project, async () => null)).rejects.toThrow(/missing from browser storage/);
  });
});
