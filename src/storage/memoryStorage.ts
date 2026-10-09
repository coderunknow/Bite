import type { AssetMeta, ProjectRecord, ProjectStorage, ProjectSummary } from './types';
import { summarize } from './types';

/**
 * In-memory fallback used when IndexedDB cannot be opened (for example some private browsing modes).
 * Data is lost on reload; the UI shows a persistent warning when this backend is active.
 */
export class MemoryProjectStorage implements ProjectStorage {
  readonly kind = 'memory' as const;
  private readonly projects = new Map<string, ProjectRecord>();
  private readonly assets = new Map<string, { meta: AssetMeta; blob: Blob; projectId: string }>();
  private readonly settings = new Map<string, string>();

  async listProjects(): Promise<ProjectSummary[]> {
    return [...this.projects.values()].map(summarize).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getProject(id: string): Promise<ProjectRecord | null> {
    const r = this.projects.get(id);
    return r ? structuredClone(r) : null;
  }

  async putProject(record: ProjectRecord): Promise<void> {
    this.projects.set(record.id, structuredClone(record));
  }

  async deleteProject(id: string): Promise<void> {
    this.projects.delete(id);
    for (const [key, a] of this.assets) if (a.projectId === id) this.assets.delete(key);
  }

  async putAsset(projectId: string, meta: AssetMeta, blob: Blob): Promise<void> {
    this.assets.set(`${projectId}:${meta.assetId}`, { meta: { ...meta }, blob, projectId });
  }

  async getAsset(projectId: string, assetId: string): Promise<{ meta: AssetMeta; blob: Blob } | null> {
    const a = this.assets.get(`${projectId}:${assetId}`);
    return a ? { meta: { ...a.meta }, blob: a.blob } : null;
  }

  async listAssets(projectId: string): Promise<AssetMeta[]> {
    return [...this.assets.values()].filter((a) => a.projectId === projectId).map((a) => ({ ...a.meta }));
  }

  async deleteAsset(projectId: string, assetId: string): Promise<void> {
    this.assets.delete(`${projectId}:${assetId}`);
  }

  async getSetting(key: string): Promise<string | null> {
    return this.settings.get(key) ?? null;
  }

  async setSetting(key: string, value: string | null): Promise<void> {
    if (value === null) this.settings.delete(key);
    else this.settings.set(key, value);
  }
}
