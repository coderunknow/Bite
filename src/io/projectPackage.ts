/**
 * The `.bite` package format (decision D-15). A ZIP archive with:
 *
 *   manifest.json   { format: "bite.package", formatVersion: 1, appVersion, createdAt, project: "project.json",
 *                     assets: [{ id, path, name, mime, size }] }   // id = SHA-256 hex of the file bytes
 *   project.json    the project document (format "bite.project", formatVersion 1). Sounds refer to assets by id.
 *   assets/<id>.<ext>  the sound files, named by digest, so the package never depends on local paths.
 *
 * Reading verifies the manifest schema, the project schema, path safety (no traversal or absolute
 * paths), archive size limits, and each asset's SHA-256 digest. Any failure throws a UserError with
 * a readable message; nothing is applied to the current project.
 *
 * A plain `.json` project file is also accepted when the project has no sounds.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { z } from 'zod';
import { parseProject, APP_VERSION, type Project } from '../core/project';
import { UserError } from '../core/errors';
import { sha256Hex } from '../storage/database';

export const PACKAGE_FORMAT = 'bite.package' as const;
export const PACKAGE_FORMAT_VERSION = 1 as const;
export const MAX_PACKAGE_ENTRIES = 500;
export const MAX_PACKAGE_UNPACKED_BYTES = 256 * 1024 * 1024;

const ManifestSchema = z.object({
  format: z.literal(PACKAGE_FORMAT),
  formatVersion: z.literal(PACKAGE_FORMAT_VERSION),
  appVersion: z.string().max(64),
  createdAt: z.string(),
  project: z.literal('project.json'),
  assets: z.array(
    z.object({
      id: z.string().regex(/^[a-f0-9]{64}$/, 'must be a SHA-256 hex digest'),
      path: z.string(),
      name: z.string().max(200),
      mime: z.string().max(100),
      size: z.number().int().nonnegative(),
    }),
  ),
});

export interface PackageAsset {
  id: string;
  name: string;
  mime: string;
  bytes: Uint8Array;
}

export interface ImportedPackage {
  project: Project;
  assets: PackageAsset[];
  /** Human-readable notes (for example, "2 unused assets were ignored"). */
  notes: string[];
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/webm': 'webm',
};

export function extensionFor(mime: string): string {
  return EXTENSION_BY_MIME[mime] ?? 'bin';
}

/** Builds the archive bytes for a project and its assets. Every sound must have its asset provided. */
export async function buildPackage(project: Project, assets: PackageAsset[], now = new Date()): Promise<Uint8Array> {
  const byId = new Map(assets.map((a) => [a.id, a] as const));
  const needed = new Set(project.sounds.map((s) => s.assetId));
  const missing = [...needed].filter((id) => !byId.has(id));
  if (missing.length > 0) {
    const names = project.sounds.filter((s) => missing.includes(s.assetId)).map((s) => `"${s.name}"`);
    throw new UserError(`Export stopped: the sound file for ${names.join(', ')} is missing from this browser's storage. Re-import the sound and try again.`);
  }
  const files: Zippable = {};
  const manifestAssets: z.infer<typeof ManifestSchema>['assets'] = [];
  for (const id of needed) {
    const asset = byId.get(id)!;
    const actual = await sha256Hex(asset.bytes);
    if (actual !== id) throw new UserError(`Export stopped: the stored data for "${asset.name}" does not match its checksum.`);
    const path = `assets/${id}.${extensionFor(asset.mime)}`;
    files[path] = asset.bytes;
    manifestAssets.push({ id, path, name: asset.name, mime: asset.mime, size: asset.bytes.byteLength });
  }
  const manifest = {
    format: PACKAGE_FORMAT,
    formatVersion: PACKAGE_FORMAT_VERSION,
    appVersion: APP_VERSION,
    createdAt: now.toISOString(),
    project: 'project.json',
    assets: manifestAssets,
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  files['project.json'] = strToU8(JSON.stringify(project, null, 2));
  return zipSync(files, { level: 6 });
}

/** Parses and verifies a `.bite` archive. Throws UserError with a readable reason on any problem. */
export async function readPackage(bytes: Uint8Array): Promise<ImportedPackage> {
  let entries: Record<string, Uint8Array>;
  let unpacked = 0;
  let count = 0;
  try {
    entries = unzipSync(bytes, {
      filter: (file) => {
        count += 1;
        unpacked += file.originalSize;
        if (count > MAX_PACKAGE_ENTRIES) throw new UserError(`The package contains more than ${MAX_PACKAGE_ENTRIES} files.`);
        if (unpacked > MAX_PACKAGE_UNPACKED_BYTES) throw new UserError('The package is too large to import safely.');
        return true;
      },
    });
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw new UserError('This file is not a valid Bite package (it is not a readable ZIP archive).');
  }
  const manifestBytes = entries['manifest.json'];
  if (!manifestBytes) throw new UserError('This package has no manifest.json, so it is not a Bite package.');
  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(strFromU8(manifestBytes));
  } catch {
    throw new UserError('manifest.json is not valid JSON.');
  }
  const parsed = ManifestSchema.safeParse(manifestJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new UserError(`manifest.json is invalid: ${issue.path.join('.') || 'root'} ${issue.message}.`);
  }
  const manifest = parsed.data;
  const projectBytes = entries[manifest.project];
  if (!projectBytes) throw new UserError('The package has no project.json.');
  let projectJson: unknown;
  try {
    projectJson = JSON.parse(strFromU8(projectBytes));
  } catch {
    throw new UserError('project.json is not valid JSON.');
  }
  const project = parseProject(projectJson);

  const assets: PackageAsset[] = [];
  const declared = new Set<string>();
  for (const entry of manifest.assets) {
    if (!isSafeAssetPath(entry.path)) throw new UserError(`The package refers to an unsafe file path "${entry.path}".`);
    if (declared.has(entry.id)) continue;
    declared.add(entry.id);
    const data = entries[entry.path];
    if (!data) throw new UserError(`The package is missing the sound file "${entry.name}" (${entry.path}).`);
    const digest = await sha256Hex(data);
    if (digest !== entry.id) throw new UserError(`The sound file "${entry.name}" is damaged: its checksum does not match the package.`);
    assets.push({ id: entry.id, name: entry.name, mime: entry.mime, bytes: data });
  }
  for (const sound of project.sounds) {
    if (!declared.has(sound.assetId)) {
      throw new UserError(`The sound "${sound.name}" is not included in the package.`);
    }
  }
  const unused = manifest.assets.length - new Set(project.sounds.map((s) => s.assetId)).size;
  const notes = unused > 0 ? [`${unused} unused sound file(s) in the package were skipped.`] : [];
  return { project, assets: assets.filter((a) => project.sounds.some((s) => s.assetId === a.id)), notes };
}

/** Accepts only `assets/<64 hex>.<ext>` with a short alphanumeric extension. */
export function isSafeAssetPath(path: string): boolean {
  return /^assets\/[a-f0-9]{64}\.[a-z0-9]{1,5}$/.test(path);
}

/** Reads a plain JSON project file. Projects with sounds need the package format (sound files). */
export function readProjectJson(text: string): Project {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new UserError('This file is not valid JSON.');
  }
  const project = parseProject(json);
  if (project.sounds.length > 0) {
    throw new UserError('This JSON project has sounds, but JSON files cannot carry sound files. Export it as a .bite package instead.');
  }
  return project;
}
