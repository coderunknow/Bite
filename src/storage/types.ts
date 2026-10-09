import type { Project } from '../model/types';

/**
 * A project as stored in the browser (or desktop profile).
 *  - `working` is the autosaved working copy, written after every change (debounced).
 *  - `saved` is the snapshot taken by the explicit Save command; `null` until the first save.
 * A project is "dirty" when working differs from saved, so unsaved work survives reloads and can be reverted.
 */
export interface ProjectRecord {
  id: string;
  name: string;
  working: Project;
  saved: Project | null;
  savedAt: string | null;
  updatedAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  savedAt: string | null;
  dirty: boolean;
  objectCount: number;
}

export interface AssetMeta {
  assetId: string;
  mimeType: string;
  name: string;
  byteLength: number;
}

export interface ProjectStorage {
  /** 'indexeddb' for persistent storage, 'memory' when IndexedDB is unavailable (data lost on reload). */
  readonly kind: 'indexeddb' | 'memory';
  listProjects(): Promise<ProjectSummary[]>;
  getProject(id: string): Promise<ProjectRecord | null>;
  putProject(record: ProjectRecord): Promise<void>;
  /** Deletes the project record and all of its assets. */
  deleteProject(id: string): Promise<void>;
  putAsset(projectId: string, meta: AssetMeta, blob: Blob): Promise<void>;
  getAsset(projectId: string, assetId: string): Promise<{ meta: AssetMeta; blob: Blob } | null>;
  listAssets(projectId: string): Promise<AssetMeta[]>;
  deleteAsset(projectId: string, assetId: string): Promise<void>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string | null): Promise<void>;
}

export function summarize(record: ProjectRecord): ProjectSummary {
  const dirty = record.saved === null || JSON.stringify(record.working) !== JSON.stringify(record.saved);
  return {
    id: record.id,
    name: record.working.name,
    updatedAt: record.working.updatedAt,
    savedAt: record.savedAt,
    dirty,
    objectCount: record.working.objects.length,
  };
}
