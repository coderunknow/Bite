/**
 * Portable project files (`.bite`).
 *
 * A `.bite` file is a ZIP archive with this layout (see docs/PROJECT_FORMAT.md):
 *   project.json          the Project document (format `bite-project`, formatVersion 1)
 *   assets/<id>.<ext>     one file per sound asset referenced by the project
 *
 * Plain `project.json` documents are also accepted when the project has no sound assets.
 * Import never touches an existing project: it always produces a new project id.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Unzipped } from 'fflate';
import { newId } from '../model/ids';
import { APP_VERSION } from '../model/defaults';
import { validateProject } from '../model/validate';
import type { Project, SoundAsset } from '../model/types';

export const BUNDLE_EXTENSION = 'bite';
export const BUNDLE_MIME = 'application/zip';
export const MAX_BUNDLE_BYTES = 256 * 1024 * 1024;
export const MAX_UNPACKED_BYTES = 512 * 1024 * 1024;
const ASSET_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export class BundleError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'BundleError';
  }
}

export interface ImportedBundle {
  project: Project;
  /** Sound bytes keyed by asset id. */
  assets: Map<string, { bytes: Uint8Array; mimeType: string }>;
  warnings: string[];
}

export function assetPath(asset: Pick<SoundAsset, 'id' | 'extension'>): string {
  return `assets/${asset.id}.${asset.extension}`;
}

/** Builds the archive for a project. `readAsset` must return the bytes for every sound asset. */
export async function exportBundle(
  project: Project,
  readAsset: (asset: SoundAsset) => Promise<Uint8Array | null>,
): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const missing: string[] = [];
  for (const sound of project.sounds) {
    const bytes = await readAsset(sound);
    if (!bytes) {
      missing.push(sound.name);
      continue;
    }
    files[assetPath(sound)] = bytes;
  }
  if (missing.length) {
    throw new BundleError('Export stopped because some sound files are missing from browser storage.', missing.map((n) => `Missing audio data for "${n}"`));
  }
  // Record the version of the app that wrote this file; importers use it for diagnostics only.
  const exported: Project = { ...project, appVersion: APP_VERSION };
  files['project.json'] = strToU8(JSON.stringify(exported, null, 2));
  return zipSync(files, { level: 6 });
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function safeEntryName(name: string): boolean {
  if (name.startsWith('/') || name.includes('\\') || name.split('/').some((seg) => seg === '..' || seg === '')) return false;
  return name.length > 0 && name.length < 300;
}

/** Parses and validates a `.bite` archive or a plain project.json document. Throws BundleError with details. */
export function importBundle(data: Uint8Array): ImportedBundle {
  if (data.byteLength > MAX_BUNDLE_BYTES) throw new BundleError(`The file is larger than ${MAX_BUNDLE_BYTES / (1024 * 1024)} MB.`);
  const warnings: string[] = [];
  const assets = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  let projectJson: unknown;

  if (isZip(data)) {
    let entries: Unzipped;
    try {
      entries = unzipSync(data);
    } catch (err) {
      throw new BundleError('The file is not a valid Bite archive (the ZIP container could not be read).', [String(err)]);
    }
    let unpacked = 0;
    for (const [name, bytes] of Object.entries(entries)) {
      if (!safeEntryName(name)) throw new BundleError('The archive contains an unsafe file path and was rejected.', [name]);
      unpacked += bytes.byteLength;
      if (unpacked > MAX_UNPACKED_BYTES) throw new BundleError('The archive expands to more than the allowed size.');
    }
    const pj = entries['project.json'];
    if (!pj) throw new BundleError('The archive has no project.json file.');
    try {
      projectJson = JSON.parse(strFromU8(pj));
    } catch (err) {
      throw new BundleError('project.json is not valid JSON.', [String(err)]);
    }
    const validated = validateProject(projectJson);
    if (!validated.ok) throw new BundleError('project.json does not match the Bite project format.', validated.errors);
    warnings.push(...validated.warnings);
    for (const sound of validated.project!.sounds) {
      if (!ASSET_ID_PATTERN.test(sound.id)) throw new BundleError(`Sound "${sound.name}" has an invalid asset id.`);
      const bytes = entries[assetPath(sound)];
      if (!bytes) throw new BundleError(`The archive is missing the audio file for "${sound.name}".`, [assetPath(sound)]);
      if (bytes.byteLength !== sound.byteLength) warnings.push(`Sound "${sound.name}" size differs from the project record; the file size was used.`);
      assets.set(sound.id, { bytes, mimeType: sound.mimeType || mimeForExtension(sound.extension) });
    }
    for (const name of Object.keys(entries)) {
      if (name !== 'project.json' && !name.startsWith('assets/')) warnings.push(`Ignored unknown file "${name}" in the archive.`);
    }
    return finish(validated.project!, assets, warnings);
  }

  // Plain JSON document.
  let text: string;
  try {
    text = strFromU8(data);
  } catch (err) {
    throw new BundleError('The file is neither a Bite archive nor UTF-8 JSON.', [String(err)]);
  }
  try {
    projectJson = JSON.parse(text);
  } catch (err) {
    throw new BundleError('The file is not valid JSON.', [String(err)]);
  }
  const validated = validateProject(projectJson);
  if (!validated.ok) throw new BundleError('The file does not match the Bite project format.', validated.errors);
  if (validated.project!.sounds.length) {
    throw new BundleError('This project file references sound files. Import the .bite archive that contains the audio.', validated.project!.sounds.map((s) => s.name));
  }
  warnings.push(...validated.warnings);
  return finish(validated.project!, assets, warnings);
}

function finish(project: Project, assets: ImportedBundle['assets'], warnings: string[]): ImportedBundle {
  // Imports are always new projects: fresh project id, object and block ids are kept (they are unique within the file).
  return { project: { ...project, id: newId() }, assets, warnings };
}

export function mimeForExtension(ext: string): string {
  switch (ext) {
    case 'wav':
      return 'audio/wav';
    case 'mp3':
      return 'audio/mpeg';
    case 'ogg':
      return 'audio/ogg';
    case 'm4a':
    case 'aac':
      return 'audio/mp4';
    case 'flac':
      return 'audio/flac';
    case 'webm':
      return 'audio/webm';
    default:
      return 'application/octet-stream';
  }
}
