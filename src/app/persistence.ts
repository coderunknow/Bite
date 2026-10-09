/** Opens the project library: IndexedDB when available, otherwise an in-memory fallback that is clearly reported. */
import { newId } from '../model/ids';
import type { SoundAsset } from '../model/types';
import { ALLOWED_SOUND_EXTENSIONS } from '../model/validate';
import { IndexedDbProjectStorage } from '../storage/indexedDbStorage';
import { MemoryProjectStorage } from '../storage/memoryStorage';
import { mimeForExtension } from '../storage/bundle';
import { ProjectService } from '../storage/projectService';

export const MAX_SOUND_BYTES = 25 * 1024 * 1024;

export interface OpenedLibrary {
  service: ProjectService;
  backend: 'indexeddb' | 'memory';
  warning: string | null;
}

export async function openLibrary(): Promise<OpenedLibrary> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available in this browser profile.');
    const storage = await IndexedDbProjectStorage.open(indexedDB);
    return { service: new ProjectService(storage), backend: 'indexeddb', warning: null };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      service: new ProjectService(new MemoryProjectStorage()),
      backend: 'memory',
      warning: `Browser storage is unavailable (${reason}). Projects will be lost when this page closes. Export your projects to keep them.`,
    };
  }
}

/** Validates a user-selected audio file and returns the asset metadata plus its blob. */
export function prepareSoundFile(file: File): { asset: Omit<SoundAsset, 'id'>; blob: Blob } {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  if (!(ALLOWED_SOUND_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new Error(`"${file.name}" is not a supported sound. Use ${ALLOWED_SOUND_EXTENSIONS.join(', ')}.`);
  }
  if (file.size === 0) throw new Error(`"${file.name}" is empty.`);
  if (file.size > MAX_SOUND_BYTES) throw new Error(`"${file.name}" is larger than ${MAX_SOUND_BYTES / (1024 * 1024)} MB.`);
  const mimeType = mimeForExtension(ext);
  const name = file.name.slice(0, dot >= 0 ? dot : undefined).slice(0, 120) || 'Sound';
  return {
    asset: { name, extension: ext, mimeType, byteLength: file.size, durationSec: null, builtIn: false },
    blob: new Blob([file], { type: mimeType }),
  };
}

export function newSoundId(): string {
  return newId();
}
