/**
 * Project lifecycle operations on top of ProjectStorage. Framework-free so it can be unit-tested.
 * The UI store calls these and reports failures to the user; nothing here swallows errors.
 */
import { createProject, createStarterProject } from '../model/defaults';
import { newId } from '../model/ids';
import { BUILT_IN_SOUNDS, type BuiltInSoundDescriptor } from '../model/builtInSounds';
import { generateBuiltInWav } from '../audio/synthesis';
import type { Project, SoundAsset } from '../model/types';
import { exportBundle, importBundle, BundleError, type ImportedBundle } from './bundle';
import type { ProjectRecord, ProjectStorage, ProjectSummary } from './types';

export class ProjectServiceError extends Error {}

export interface CreatedProject {
  record: ProjectRecord;
}

export class ProjectService {
  constructor(
    private readonly storage: ProjectStorage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get backend(): ProjectStorage['kind'] {
    return this.storage.kind;
  }

  list(): Promise<ProjectSummary[]> {
    return this.storage.listProjects();
  }

  async get(id: string): Promise<ProjectRecord> {
    const record = await this.storage.getProject(id);
    if (!record) throw new ProjectServiceError('This project no longer exists.');
    return record;
  }

  /** Creates a starter project with built-in sounds and stores it as already saved. */
  async create(name: string): Promise<ProjectRecord> {
    const sounds = this.generateBuiltIns();
    const project = createStarterProject(name, sounds.descriptors, this.now());
    const record: ProjectRecord = {
      id: project.id,
      name: project.name,
      working: project,
      saved: structuredClone(project),
      savedAt: this.now().toISOString(),
      updatedAt: project.updatedAt,
    };
    await this.storage.putProject(record);
    for (const s of sounds.assets) await this.storage.putAsset(project.id, { assetId: s.id, mimeType: s.mimeType, name: s.name, byteLength: s.blob.size }, s.blob);
    return record;
  }

  /** Creates an empty project. */
  async createEmpty(name: string): Promise<ProjectRecord> {
    const project = createProject(name, this.now());
    const record: ProjectRecord = { id: project.id, name, working: project, saved: structuredClone(project), savedAt: project.updatedAt, updatedAt: project.updatedAt };
    await this.storage.putProject(record);
    return record;
  }

  /** Stores the working copy (autosave). Does not create a saved snapshot. */
  async saveWorking(project: Project): Promise<void> {
    const existing = await this.storage.getProject(project.id);
    if (!existing) throw new ProjectServiceError('The project was deleted before it could be saved.');
    await this.storage.putProject({ ...existing, name: project.name, working: project, updatedAt: project.updatedAt });
  }

  /** Explicit Save: the working copy becomes the saved snapshot. */
  async save(project: Project): Promise<ProjectRecord> {
    const existing = await this.storage.getProject(project.id);
    if (!existing) throw new ProjectServiceError('The project was deleted before it could be saved.');
    const savedAt = this.now().toISOString();
    const record: ProjectRecord = { ...existing, name: project.name, working: project, saved: structuredClone(project), savedAt, updatedAt: project.updatedAt };
    await this.storage.putProject(record);
    return record;
  }

  /** Discards unsaved changes: the working copy is replaced by the saved snapshot. */
  async revert(id: string): Promise<ProjectRecord> {
    const existing = await this.get(id);
    if (!existing.saved) throw new ProjectServiceError('This project has never been saved, so there is nothing to revert to.');
    const record: ProjectRecord = { ...existing, working: structuredClone(existing.saved), name: existing.saved.name, updatedAt: existing.saved.updatedAt };
    await this.storage.putProject(record);
    return record;
  }

  async rename(id: string, name: string): Promise<ProjectRecord> {
    const existing = await this.get(id);
    const working: Project = { ...existing.working, name, updatedAt: this.now().toISOString() };
    // Renaming is metadata: the saved snapshot is renamed too, so a rename alone never marks a project dirty.
    const saved = existing.saved ? { ...existing.saved, name, updatedAt: working.updatedAt } : null;
    const record: ProjectRecord = { ...existing, name, working, saved, updatedAt: working.updatedAt };
    await this.storage.putProject(record);
    return record;
  }

  /** Duplicates the working copy under a new id, including every sound asset. */
  async duplicate(id: string): Promise<ProjectRecord> {
    const existing = await this.get(id);
    const newProjectId = newId();
    const working: Project = { ...structuredClone(existing.working), id: newProjectId, name: `${existing.working.name} (copy)`, updatedAt: this.now().toISOString() };
    const savedAt = this.now().toISOString();
    const record: ProjectRecord = { id: newProjectId, name: working.name, working, saved: structuredClone(working), savedAt, updatedAt: working.updatedAt };
    await this.storage.putProject(record);
    for (const meta of await this.storage.listAssets(id)) {
      const asset = await this.storage.getAsset(id, meta.assetId);
      if (asset) await this.storage.putAsset(newProjectId, meta, asset.blob);
    }
    return record;
  }

  async delete(id: string): Promise<void> {
    await this.storage.deleteProject(id);
  }

  async addSound(projectId: string, sound: SoundAsset, blob: Blob): Promise<void> {
    await this.storage.putAsset(projectId, { assetId: sound.id, mimeType: sound.mimeType, name: sound.name, byteLength: blob.size }, blob);
  }

  async readSound(projectId: string, soundId: string): Promise<Blob | null> {
    const asset = await this.storage.getAsset(projectId, soundId);
    return asset ? asset.blob : null;
  }

  async removeSound(projectId: string, soundId: string): Promise<void> {
    await this.storage.deleteAsset(projectId, soundId);
  }

  /** Exports the working copy as a `.bite` archive. */
  async exportProject(project: Project): Promise<Uint8Array> {
    try {
      return await exportBundle(project, async (sound) => {
        const blob = await this.readSound(project.id, sound.id);
        return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
      });
    } catch (err) {
      if (err instanceof BundleError) throw err;
      throw new ProjectServiceError(`Export failed: ${(err as Error).message}`);
    }
  }

  /**
   * Imports an archive as a new project. The new project is stored as already saved, so the imported
   * content is protected even if the user closes the browser immediately.
   */
  async importFile(data: Uint8Array): Promise<ProjectRecord> {
    const bundle: ImportedBundle = importBundle(data);
    const project = bundle.project;
    const record: ProjectRecord = { id: project.id, name: project.name, working: project, saved: structuredClone(project), savedAt: this.now().toISOString(), updatedAt: project.updatedAt };
    await this.storage.putProject(record);
    try {
      for (const sound of project.sounds) {
        const asset = bundle.assets.get(sound.id);
        if (!asset) throw new BundleError(`Missing audio for "${sound.name}"`);
        const blob = new Blob([asset.bytes as BlobPart], { type: asset.mimeType });
        await this.storage.putAsset(project.id, { assetId: sound.id, mimeType: asset.mimeType, name: sound.name, byteLength: blob.size }, blob);
      }
    } catch (err) {
      await this.storage.deleteProject(project.id);
      throw err;
    }
    return record;
  }

  async getSetting(key: string): Promise<string | null> {
    return this.storage.getSetting(key);
  }

  async setSetting(key: string, value: string | null): Promise<void> {
    await this.storage.setSetting(key, value);
  }

  /** Synthesises the built-in sounds once: descriptors carry the measured size and duration, assets carry the bytes. */
  private generateBuiltIns(): { descriptors: BuiltInSoundDescriptor[]; assets: { id: string; name: string; mimeType: string; blob: Blob }[] } {
    const descriptors: BuiltInSoundDescriptor[] = [];
    const assets: { id: string; name: string; mimeType: string; blob: Blob }[] = [];
    for (const d of BUILT_IN_SOUNDS) {
      const { bytes, durationSec } = generateBuiltInWav(d.recipe);
      descriptors.push({ ...d, asset: { ...d.asset, byteLength: bytes.byteLength, durationSec } });
      assets.push({ id: d.asset.id, name: d.asset.name, mimeType: 'audio/wav', blob: new Blob([bytes as BlobPart], { type: 'audio/wav' }) });
    }
    return { descriptors, assets };
  }
}
