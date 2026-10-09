/**
 * Project-level actions used by the UI. Each one coordinates the storage service, the store and the Studio,
 * and reports failures as messages instead of throwing into React.
 */
import { newId } from '../model/ids';
import type { Project, SoundAsset } from '../model/types';
import { uniqueName } from '../editor/edit';
import type { ProjectService } from '../storage/projectService';
import { isDirty, useAppStore } from './store';
import { prepareSoundFile } from './persistence';
import type { Studio } from './studio';

export interface Services {
  service: ProjectService;
  studio: Studio;
}

let bound: Services | null = null;

export function bindServices(s: Services): void {
  bound = s;
}

function services(): Services {
  if (!bound) throw new Error('The application is still starting.');
  return bound;
}

function fail(err: unknown, prefix: string): void {
  const text = err instanceof Error ? err.message : String(err);
  useAppStore.getState().toast(`${prefix}: ${text}`, 'error');
}

export async function refreshProjects(): Promise<void> {
  const { service } = services();
  useAppStore.getState().setProjects(await service.list());
}

/** Opens a project from storage. Unsaved (dirty) changes are kept in the working copy. */
export async function openProject(id: string, options: { recovered?: boolean } = {}): Promise<void> {
  const { service, studio } = services();
  try {
    await studio.flushAutosave();
    studio.reset();
    const rec = await service.get(id);
    const dirty = isDirty(rec.working, rec.saved);
    useAppStore.getState().loadProject(id, rec.working, rec.saved, Boolean(options.recovered && dirty));
    useAppStore.getState().setProjectsOpen(false);
    await service.setSetting('lastProjectId', id);
    await refreshProjects();
  } catch (err) {
    fail(err, 'The project could not be opened');
  }
}

export async function createProject(name: string): Promise<void> {
  const { service } = services();
  try {
    const existing = (await service.list()).map((p) => p.name);
    const rec = await service.create(uniqueName(name || 'Untitled project', existing));
    await openProject(rec.id);
    useAppStore.getState().toast('New project created.');
  } catch (err) {
    fail(err, 'The project could not be created');
  }
}

export async function renameProject(id: string, name: string): Promise<void> {
  const { service } = services();
  const clean = name.trim();
  if (!clean) {
    useAppStore.getState().toast('Project names cannot be empty.', 'error');
    return;
  }
  try {
    await service.rename(id, clean);
    useAppStore.setState((s) => ({
      project: s.project && s.projectId === id ? { ...s.project, name: clean } : s.project,
      saved: s.saved && s.projectId === id ? { ...s.saved, name: clean } : s.saved,
    }));
    await refreshProjects();
  } catch (err) {
    fail(err, 'The project could not be renamed');
  }
}

export async function duplicateProject(id: string): Promise<void> {
  const { service, studio } = services();
  try {
    await studio.flushAutosave();
    const rec = await service.duplicate(id);
    await openProject(rec.id);
    useAppStore.getState().toast('Project duplicated. You are now editing the copy.');
  } catch (err) {
    fail(err, 'The project could not be duplicated');
  }
}

/** Deletes a project. The caller must have confirmed. Opens another project afterwards. */
export async function deleteProject(id: string): Promise<void> {
  const { service, studio } = services();
  try {
    const wasOpen = useAppStore.getState().projectId === id;
    if (wasOpen) {
      if (useAppStore.getState().mode !== 'edit') studio.reset();
      if (studio.autosavePending) await studio.flushAutosave();
    }
    await service.delete(id);
    await refreshProjects();
    if (wasOpen) {
      const remaining = useAppStore.getState().projects;
      if (remaining.length > 0) await openProject(remaining[0]!.id);
      else await createProject('My project');
    }
    useAppStore.getState().toast('Project deleted.');
  } catch (err) {
    fail(err, 'The project could not be deleted');
  }
}

/** Discards unsaved changes and returns to the last explicit save. */
export async function revertProject(): Promise<void> {
  const { service, studio } = services();
  const id = useAppStore.getState().projectId;
  if (!id) return;
  try {
    studio.reset();
    const rec = await service.revert(id);
    useAppStore.getState().loadProject(id, rec.working, rec.saved, false);
    useAppStore.getState().toast('Reverted to the last saved version.');
  } catch (err) {
    fail(err, 'Changes could not be discarded');
  }
}

export async function saveProject(): Promise<void> {
  await services().studio.save();
}

export async function exportProject(): Promise<void> {
  const { service } = services();
  const project = useAppStore.getState().project;
  if (!project) return;
  try {
    const bytes = await service.exportProject(project);
    downloadBytes(`${safeFileName(project.name)}.bite`, bytes, 'application/zip');
    useAppStore.getState().toast('Project exported as a .bite file.');
  } catch (err) {
    fail(err, 'The project could not be exported');
  }
}

export async function importProjectFile(file: File): Promise<void> {
  const { service, studio } = services();
  try {
    if (file.size > 256 * 1024 * 1024) throw new Error('The file is larger than 256 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    await studio.flushAutosave();
    const rec = await service.importFile(bytes);
    await openProject(rec.id);
    useAppStore.getState().toast(`Imported "${rec.name}" as a new project.`);
  } catch (err) {
    fail(err, 'The file could not be imported');
  }
}

export async function addSoundFile(file: File): Promise<void> {
  const { service } = services();
  const project = useAppStore.getState().project;
  if (!project) return;
  try {
    const { asset, blob } = prepareSoundFile(file);
    const sound: SoundAsset = { ...asset, id: newId(), name: uniqueName(asset.name, project.sounds.map((s) => s.name)) };
    await service.addSound(project.id, sound, blob);
    useAppStore.getState().edit((p) => ({ ...p, sounds: [...p.sounds, sound] }));
    useAppStore.getState().toast(`Added sound "${sound.name}".`);
  } catch (err) {
    fail(err, 'The sound could not be added');
  }
}

export async function removeSound(soundId: string): Promise<void> {
  const { service } = services();
  const project = useAppStore.getState().project;
  if (!project) return;
  try {
    await service.removeSound(project.id, soundId);
    useAppStore.getState().edit((p) => ({ ...p, sounds: p.sounds.filter((s) => s.id !== soundId) }));
  } catch (err) {
    fail(err, 'The sound could not be removed');
  }
}

/** Plays a sound in the editor (a user gesture is required for the first sound). */
export async function previewSound(soundId: string): Promise<void> {
  const { service, studio } = services();
  const project = useAppStore.getState().project;
  if (!project) return;
  try {
    const unlocked = await studio.audio.unlock();
    useAppStore.getState().setAudioBlocked(!unlocked);
    if (!studio.audio.hasBuffer(soundId)) {
      const blob = await service.readSound(project.id, soundId);
      if (!blob) throw new Error('The sound is missing from storage.');
      await studio.audio.load(soundId, await blob.arrayBuffer());
    }
    studio.audio.play(soundId);
  } catch (err) {
    fail(err, 'The sound could not be played');
  }
}

export function currentProject(): Project | null {
  return useAppStore.getState().project;
}

export function downloadBytes(name: string, bytes: Uint8Array, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9 _-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 80);
  return cleaned || 'project';
}
