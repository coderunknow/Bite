import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ProjectStorage, sha256Hex } from '../../src/storage/database';
import { ProjectService, exportFileName } from '../../src/storage/projectService';
import { createEmptyProject } from '../../src/core/project';
import { addSound } from '../../src/core/sceneOps';
import { readPackage, buildPackage } from '../../src/io/projectPackage';
import { encodeWav } from '../../src/audio/wav';
import { BUILTIN_SOUNDS, renderBuiltinWav } from '../../src/audio/builtins';
import { UserError } from '../../src/core/errors';

let storage: ProjectStorage;
let service: ProjectService;

beforeEach(async () => {
  storage = await ProjectStorage.open(new IDBFactory());
  service = new ProjectService(storage);
});

const chimeBytes = () => renderBuiltinWav(BUILTIN_SOUNDS.find((s) => s.name === 'Chime')!);

describe('ProjectStorage (IndexedDB)', () => {
  it('saves, lists and loads projects; a missing project is a readable error', async () => {
    const project = await service.createProject('Alpha');
    await service.createProject('Beta');
    const list = await service.listProjects();
    expect(list.map((p) => p.name).sort()).toEqual(['Alpha', 'Beta']);
    const loaded = await service.loadProject(project.id);
    expect(loaded.name).toBe('Alpha');
    await expect(storage.loadProject('nope')).rejects.toThrow(UserError);
  });

  it('deduplicates assets by SHA-256 and returns the hash as the id', async () => {
    const bytes = encodeWav(new Float32Array([0, 0.5, -0.5, 0]));
    const a = await storage.putAsset(bytes, 'a.wav', 'audio/wav');
    const b = await storage.putAsset(bytes, 'b.wav', 'audio/wav');
    expect(a).toBe(b);
    expect(a).toBe(await sha256Hex(bytes));
    expect((await storage.getAsset(a))?.size).toBe(bytes.byteLength);
  });

  it('deleting a project removes only the assets no other project uses', async () => {
    const first = await service.createProject('First'); // creates the Chime asset
    const second = await service.createProject('Second'); // uses the same Chime asset
    const extra = await storage.putAsset(encodeWav(new Float32Array(100).fill(0.1)), 'extra.wav', 'audio/wav');
    const firstResult = await service.deleteProject(first.id);
    expect(firstResult.removedAssets).toBe(0); // Second still references Chime
    expect(await storage.getAsset(second.sounds[0]!.assetId)).toBeDefined();
    // The orphan asset is not referenced by any project and is kept until a project deletion
    // reports it; it was never attached to a project, so the store keeps it (no silent data loss).
    expect(await storage.getAsset(extra)).toBeDefined();
  });

  it('projectExists and meta values round-trip', async () => {
    const project = await service.createProject('Gamma');
    expect(await storage.projectExists(project.id)).toBe(true);
    expect(await storage.projectExists('missing')).toBe(false);
    await storage.setMeta('lastProjectId', project.id);
    expect(await storage.getMeta<string>('lastProjectId')).toBe(project.id);
  });
});

describe('ProjectService', () => {
  it('createProject stores a starter project with a playable Chime sound', async () => {
    const project = await service.createProject('Fresh');
    expect(project.objects.map((o) => o.name)).toEqual(['Ground', 'Bouncer', 'Ball']);
    expect(project.sounds.map((s) => s.name)).toEqual(['Chime']);
    const bytes = await service.assetBytes(project.sounds[0]!.assetId);
    expect(bytes).not.toBeNull();
    expect(bytes!.byteLength).toBeGreaterThan(1000);
    expect(chimeBytes().byteLength).toBe(bytes!.byteLength);
  });

  it('duplicate creates a new id and keeps the same sounds', async () => {
    const original = await service.createProject('Orig');
    const copy = await service.duplicateProject(original.id, 'Copy');
    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe('Copy');
    expect(copy.sounds[0]!.assetId).toBe(original.sounds[0]!.assetId);
    expect(await storage.projectExists(original.id)).toBe(true);
  });

  it('rename validates the name and keeps the id', async () => {
    const project = await service.createProject('Old');
    const renamed = await service.renameProject(project, 'New name');
    expect(renamed.id).toBe(project.id);
    expect(renamed.name).toBe('New name');
    await expect(service.renameProject(project, '   ')).rejects.toThrow();
  });

  it('export then import creates a new project with the same content and sounds, never overwriting', async () => {
    const original = await service.createProject('Round trip');
    const bytes = await service.exportProject(original);
    const imported = await service.importFile('Round trip.bite', bytes);
    expect(imported.project.id).not.toBe(original.id); // the original exists, so a new id is assigned
    expect(imported.project.objects.length).toBe(original.objects.length);
    expect(imported.project.sounds[0]!.assetId).toBe(original.sounds[0]!.assetId);
    const again = await service.importFile('Round trip.bite', bytes);
    expect(again.project.id).not.toBe(imported.project.id);
    expect((await service.listProjects()).length).toBe(3);
  });

  it('exportProject refuses a sound whose stored bytes do not match its id', async () => {
    const project = await service.createProject('Tamper');
    const record = await storage.getAsset(project.sounds[0]!.assetId);
    // Simulate corruption: overwrite the stored bytes under the same id.
    const corrupted = { ...record!, bytes: new Uint8Array([1, 2, 3]).buffer };
    const tx = (storage as unknown as { db: IDBDatabase }).db.transaction('assets', 'readwrite');
    tx.objectStore('assets').put(corrupted);
    await new Promise((resolve) => (tx.oncomplete = resolve));
    await expect(service.exportProject(project)).rejects.toThrow(/does not match|corrupt|checksum/i);
  });

  it('exportFileName makes a safe file name', () => {
    expect(exportFileName('My: project/..  ?')).toMatch(/^[A-Za-z0-9 ._-]+\.bite$/);
    expect(exportFileName('')).toMatch(/\.bite$/);
  });
});

describe('package round trip', () => {
  it('buildPackage then readPackage returns an equal project and its assets', async () => {
    const project = createEmptyProject({ id: 'pkg', name: 'Pkg', now: new Date(0) });
    const bytes = chimeBytes();
    const assetId = await sha256Hex(bytes);
    addSound(project, 'Chime', assetId); // only sounds the project references are packaged
    const built = await buildPackage(project, [{ id: assetId, name: 'Chime.wav', mime: 'audio/wav', bytes }]);
    const read = await readPackage(built);
    expect(read.project.id).toBe('pkg');
    expect(read.project.sounds[0]!.assetId).toBe(assetId);
    expect(read.assets).toHaveLength(1);
    expect(read.assets[0]!.id).toBe(assetId);
    expect(read.assets[0]!.bytes).toEqual(bytes);
  });
});
