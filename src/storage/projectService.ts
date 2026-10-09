/**
 * Project-level operations shared by the UI and tests: create, duplicate, save, delete, import, export.
 * Every operation validates data before it is written, and never touches the current project in memory.
 */
import { UserError } from '../core/errors';
import { newId } from '../core/ids';
import { parseProject, type Project } from '../core/project';
import { addSound, validateName } from '../core/sceneOps';
import { createStarterProject } from '../core/templates';
import { BUILTIN_SOUNDS, renderBuiltinWav } from '../audio/builtins';
import { assertPlayableAudio } from '../audio/validate';
import { buildPackage, readPackage, readProjectJson, type ImportedPackage, type PackageAsset } from '../io/projectPackage';
import { ProjectStorage, sha256Hex, type ProjectSummary } from './database';

export class ProjectService {
  constructor(readonly storage: ProjectStorage) {}

  listProjects(): Promise<ProjectSummary[]> {
    return this.storage.listProjects();
  }

  loadProject(id: string): Promise<Project> {
    return this.storage.loadProject(id);
  }

  /** Writes the project with a fresh timestamp. Returns the stored copy. */
  async saveProject(project: Project, now = new Date()): Promise<Project> {
    const stamped: Project = { ...project, updatedAt: now.toISOString() };
    const checked = parseProject(JSON.parse(JSON.stringify(stamped)));
    await this.storage.saveProject(checked);
    return checked;
  }

  async createProject(name: string, now = new Date()): Promise<Project> {
    const cleanName = validateName(name, 'Project');
    const chime = BUILTIN_SOUNDS.find((s) => s.name === 'Chime');
    if (!chime) throw new UserError('The built-in Chime sound is missing.');
    const soundAssetId = await this.storage.putAsset(renderBuiltinWav(chime), 'Chime.wav', 'audio/wav');
    const project = createStarterProject({ id: newId('proj'), name: cleanName, now, soundAssetId });
    return this.saveProject(project, now);
  }

  async duplicateProject(id: string, name: string, now = new Date()): Promise<Project> {
    const source = await this.storage.loadProject(id);
    const copy: Project = { ...structuredClone(source), id: newId('proj'), name: validateName(name, 'Project'), createdAt: now.toISOString() };
    return this.saveProject(copy, now);
  }

  async renameProject(project: Project, name: string): Promise<Project> {
    return this.saveProject({ ...project, name: validateName(name, 'Project') });
  }

  /** Deletes the project. The caller is responsible for the confirmation dialog. */
  deleteProject(id: string): Promise<{ removedAssets: number }> {
    return this.storage.deleteProject(id);
  }

  async assetBytes(assetId: string): Promise<ArrayBuffer | null> {
    const record = await this.storage.getAsset(assetId);
    return record ? record.bytes : null;
  }

  /** Adds a sound file to the project after checking that it can be played. */
  async addSoundFile(project: Project, fileName: string, mime: string, bytes: Uint8Array): Promise<Project> {
    await assertPlayableAudio(bytes, fileName);
    const baseName = fileName.replace(/\.[^.]+$/, '').trim() || 'Sound';
    const assetId = await this.storage.putAsset(bytes, fileName, mime || 'application/octet-stream');
    const next = structuredClone(project);
    addSound(next, baseName.slice(0, 80), assetId);
    return this.saveProject(next);
  }

  /** Imports a `.bite` package or a plain `.json` project as a new project. Never overwrites an existing project. */
  async importFile(fileName: string, bytes: Uint8Array, now = new Date()): Promise<{ project: Project; notes: string[] }> {
    const lower = fileName.toLowerCase();
    let imported: ImportedPackage;
    if (lower.endsWith('.json')) {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
      imported = { project: readProjectJson(text), assets: [], notes: [] };
    } else {
      imported = await readPackage(bytes);
    }
    for (const asset of imported.assets) {
      await this.storage.putAsset(asset.bytes, asset.name, asset.mime);
    }
    const existing = await this.storage.projectExists(imported.project.id);
    const project: Project = {
      ...imported.project,
      id: existing ? newId('proj') : imported.project.id,
      createdAt: imported.project.createdAt,
    };
    const saved = await this.saveProject(project, now);
    return { project: saved, notes: imported.notes };
  }

  /** Builds a `.bite` package with every sound asset the project references. */
  async exportProject(project: Project, now = new Date()): Promise<Uint8Array> {
    const assets: PackageAsset[] = [];
    for (const sound of project.sounds) {
      const record = await this.storage.getAsset(sound.assetId);
      if (!record) {
        throw new UserError(`Export stopped: the sound "${sound.name}" is missing from storage.`);
      }
      const actual = await sha256Hex(new Uint8Array(record.bytes));
      if (actual !== sound.assetId) {
        throw new UserError(`Export stopped: the stored data for "${sound.name}" does not match its checksum.`);
      }
      assets.push({ id: sound.assetId, name: record.name, mime: record.mime, bytes: new Uint8Array(record.bytes) });
    }
    return buildPackage(project, assets, now);
  }
}

/** Safe file name for downloads: letters, digits, dashes. */
export function exportFileName(projectName: string): string {
  const base = projectName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
  return `${base}.bite`;
}
