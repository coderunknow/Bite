import type { AssetMeta, ProjectRecord, ProjectStorage, ProjectSummary } from './types';
import { summarize } from './types';

const DB_NAME = 'bite-studio';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_ASSETS = 'assets';
const STORE_SETTINGS = 'settings';

interface AssetRow {
  key: string;
  projectId: string;
  meta: AssetMeta;
  blob: Blob;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted (possibly out of storage quota)'));
  });
}

/** Opens (and upgrades) the Bite database. Rejects with a descriptive error when IndexedDB is unavailable. */
export function openBiteDatabase(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        const store = db.createObjectStore(STORE_ASSETS, { keyPath: 'key' });
        store.createIndex('byProject', 'projectId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open the project database'));
    req.onblocked = () => reject(new Error('The project database is open in another Bite Studio window. Close the other window and reload.'));
  });
}

export class IndexedDbProjectStorage implements ProjectStorage {
  readonly kind = 'indexeddb' as const;

  private constructor(private readonly db: IDBDatabase) {}

  static async open(factory: IDBFactory = indexedDB): Promise<IndexedDbProjectStorage> {
    return new IndexedDbProjectStorage(await openBiteDatabase(factory));
  }

  close(): void {
    this.db.close();
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const tx = this.db.transaction(STORE_PROJECTS, 'readonly');
    const rows = (await requestToPromise(tx.objectStore(STORE_PROJECTS).getAll())) as ProjectRecord[];
    await transactionDone(tx);
    return rows.map(summarize).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getProject(id: string): Promise<ProjectRecord | null> {
    const tx = this.db.transaction(STORE_PROJECTS, 'readonly');
    const row = (await requestToPromise(tx.objectStore(STORE_PROJECTS).get(id))) as ProjectRecord | undefined;
    await transactionDone(tx);
    return row ?? null;
  }

  async putProject(record: ProjectRecord): Promise<void> {
    const tx = this.db.transaction(STORE_PROJECTS, 'readwrite');
    tx.objectStore(STORE_PROJECTS).put(record);
    await transactionDone(tx);
  }

  async deleteProject(id: string): Promise<void> {
    const tx = this.db.transaction([STORE_PROJECTS, STORE_ASSETS], 'readwrite');
    tx.objectStore(STORE_PROJECTS).delete(id);
    const index = tx.objectStore(STORE_ASSETS).index('byProject');
    const keys = (await requestToPromise(index.getAllKeys(id))) as IDBValidKey[];
    for (const key of keys) tx.objectStore(STORE_ASSETS).delete(key);
    await transactionDone(tx);
  }

  async putAsset(projectId: string, meta: AssetMeta, blob: Blob): Promise<void> {
    const row: AssetRow = { key: `${projectId}:${meta.assetId}`, projectId, meta: { ...meta }, blob };
    const tx = this.db.transaction(STORE_ASSETS, 'readwrite');
    tx.objectStore(STORE_ASSETS).put(row);
    await transactionDone(tx);
  }

  async getAsset(projectId: string, assetId: string): Promise<{ meta: AssetMeta; blob: Blob } | null> {
    const tx = this.db.transaction(STORE_ASSETS, 'readonly');
    const row = (await requestToPromise(tx.objectStore(STORE_ASSETS).get(`${projectId}:${assetId}`))) as AssetRow | undefined;
    await transactionDone(tx);
    return row ? { meta: row.meta, blob: row.blob } : null;
  }

  async listAssets(projectId: string): Promise<AssetMeta[]> {
    const tx = this.db.transaction(STORE_ASSETS, 'readonly');
    const rows = (await requestToPromise(tx.objectStore(STORE_ASSETS).index('byProject').getAll(projectId))) as AssetRow[];
    await transactionDone(tx);
    return rows.map((r) => r.meta);
  }

  async deleteAsset(projectId: string, assetId: string): Promise<void> {
    const tx = this.db.transaction(STORE_ASSETS, 'readwrite');
    tx.objectStore(STORE_ASSETS).delete(`${projectId}:${assetId}`);
    await transactionDone(tx);
  }

  async getSetting(key: string): Promise<string | null> {
    const tx = this.db.transaction(STORE_SETTINGS, 'readonly');
    const row = (await requestToPromise(tx.objectStore(STORE_SETTINGS).get(key))) as { key: string; value: string } | undefined;
    await transactionDone(tx);
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string | null): Promise<void> {
    const tx = this.db.transaction(STORE_SETTINGS, 'readwrite');
    if (value === null) tx.objectStore(STORE_SETTINGS).delete(key);
    else tx.objectStore(STORE_SETTINGS).put({ key, value });
    await transactionDone(tx);
  }
}
