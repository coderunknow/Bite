/**
 * IndexedDB persistence (decision D-16, D-17). Three object stores:
 * - projects: one record per project (the validated JSON document, stored as-is).
 * - assets:   content-addressed files keyed by SHA-256 hex digest. Deduplicated across projects.
 * - meta:     small key/value settings (e.g. the last opened project).
 *
 * Only this module touches IndexedDB directly; everything else goes through the functions here.
 */
import { parseProject, type Project } from '../core/project';
import { UserError } from '../core/errors';

const DB_NAME = 'bite-studio';
const DB_VERSION = 1;

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface AssetRecord {
  id: string;
  name: string;
  mime: string;
  size: number;
  bytes: ArrayBuffer;
  createdAt: string;
}

interface ProjectRecord {
  id: string;
  name: string;
  updatedAt: string;
  document: unknown;
}

type Store = 'projects' | 'assets' | 'meta';

export class ProjectStorage {
  private constructor(private readonly db: IDBDatabase) {}

  static open(factory: IDBFactory = indexedDB): Promise<ProjectStorage> {
    return new Promise((resolve, reject) => {
      const request = factory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(new ProjectStorage(request.result));
      request.onerror = () => reject(new UserError(`The project database could not be opened: ${request.error?.message ?? 'unknown error'}`));
      request.onblocked = () => reject(new UserError('The project database is open in another Bite window. Close the other window and reload.'));
    });
  }

  close(): void {
    this.db.close();
  }

  private run<T>(store: Store, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const tx = this.db.transaction(store, mode);
      const request = action(tx.objectStore(store));
      let result: T;
      request.onsuccess = () => {
        result = request.result;
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(new UserError(`Storage error: ${tx.error?.message ?? 'transaction failed'}`));
      tx.onabort = () => reject(new UserError(`Storage operation was aborted: ${tx.error?.message ?? 'unknown reason'}`));
    });
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const records = await this.run<ProjectRecord[]>('projects', 'readonly', (s) => s.getAll());
    return records
      .map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Loads and validates a project. Throws ProjectValidationError for damaged data; the record is kept. */
  async loadProject(id: string): Promise<Project> {
    const record = await this.run<ProjectRecord | undefined>('projects', 'readonly', (s) => s.get(id));
    if (!record) throw new UserError('That project no longer exists.');
    return parseProject(record.document);
  }

  /** Writes the project document. The document must already be valid (callers use the store's model). */
  async saveProject(project: Project): Promise<void> {
    const record: ProjectRecord = { id: project.id, name: project.name, updatedAt: project.updatedAt, document: project };
    await this.run('projects', 'readwrite', (s) => s.put(record));
  }

  async projectExists(id: string): Promise<boolean> {
    const key = await this.run<IDBValidKey | undefined>('projects', 'readonly', (s) => s.getKey(id));
    return key !== undefined;
  }

  /** Deletes a project and any assets that no remaining project references. */
  async deleteProject(id: string): Promise<{ removedAssets: number }> {
    const record = await this.run<ProjectRecord | undefined>('projects', 'readonly', (s) => s.get(id));
    await this.run('projects', 'readwrite', (s) => s.delete(id));
    let removed = 0;
    if (record) {
      const candidates = assetIdsOf(record.document);
      const stillUsed = new Set<string>();
      const all = await this.run<ProjectRecord[]>('projects', 'readonly', (s) => s.getAll());
      for (const other of all) for (const assetId of assetIdsOf(other.document)) stillUsed.add(assetId);
      for (const assetId of candidates) {
        if (!stillUsed.has(assetId)) {
          await this.run('assets', 'readwrite', (s) => s.delete(assetId));
          removed += 1;
        }
      }
    }
    return { removedAssets: removed };
  }

  /** Stores bytes under their SHA-256 digest. Returns the digest. Existing identical content is reused. */
  async putAsset(bytes: Uint8Array, name: string, mime: string): Promise<string> {
    const id = await sha256Hex(bytes);
    const existing = await this.run<IDBValidKey | undefined>('assets', 'readonly', (s) => s.getKey(id));
    if (existing === undefined) {
      const copy = bytes.slice().buffer as ArrayBuffer;
      const record: AssetRecord = { id, name, mime, size: bytes.byteLength, bytes: copy, createdAt: new Date().toISOString() };
      await this.run('assets', 'readwrite', (s) => s.put(record));
    }
    return id;
  }

  async getAsset(id: string): Promise<AssetRecord | undefined> {
    return this.run<AssetRecord | undefined>('assets', 'readonly', (s) => s.get(id));
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const record = await this.run<{ key: string; value: T } | undefined>('meta', 'readonly', (s) => s.get(key));
    return record?.value;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.run('meta', 'readwrite', (s) => s.put({ key, value }));
  }
}

/** Digest of the bytes as lowercase hex. Uses Web Crypto, available in browsers, Electron and Node 20+. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Asset ids referenced by a raw project document (sounds only in format v1). */
export function assetIdsOf(document: unknown): string[] {
  if (!document || typeof document !== 'object') return [];
  const sounds = (document as { sounds?: unknown }).sounds;
  if (!Array.isArray(sounds)) return [];
  return sounds
    .map((s) => (s && typeof s === 'object' ? (s as { assetId?: unknown }).assetId : undefined))
    .filter((id): id is string => typeof id === 'string');
}
