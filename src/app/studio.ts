/**
 * Application controller. Holds the open project, the execution engine and the UI state, and
 * implements every user action. React components read `studio.store` and call these methods.
 *
 * Edit model: each change runs on a structured copy of the project. If the change throws, the copy
 * is discarded and the open project is untouched. A successful change replaces the project, bumps
 * `revision`, and schedules an autosave (debounced). Switching or closing a project first saves
 * pending changes and aborts the switch if saving fails, so unsaved work is never dropped.
 */
import { createStore } from 'zustand/vanilla';
import { UserError } from '../core/errors';
import { ProjectValidationError, type Project, type SceneObject } from '../core/project';
import {
  addMessage,
  addObject,
  addSound,
  addVariable,
  assertVariableNameAvailable,
  childrenOf,
  deleteMessage,
  deleteObject,
  deleteSound,
  deleteVariable,
  duplicateObject,
  findObject,
  messageReferenceCount,
  renameObject,
  renameVariable,
  setParent,
  setVariableValue,
  soundReferenceCount,
  subtreeOf,
  validateName,
  variableReferenceCount,
} from '../core/sceneOps';
import { STAGE_TARGET_ID, type ObjectKind, type ScriptsJSON, type Vec3 } from '../core/types';
import { Engine, type EngineState } from '../engine/engine';
import { WebAudioHost, type AudioStatus } from '../audio/webAudioHost';
import { BUILTIN_SOUNDS, renderBuiltinWav } from '../audio/builtins';
import { ProjectService, exportFileName } from '../storage/projectService';
import type { ProjectStorage, ProjectSummary } from '../storage/database';
import type { LogEntry } from '../runtime/types';
import type { TransformMode, ViewMode } from '../stage/stageView';
import { platform } from './platform';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
export type RightTab = 'inspector' | 'sounds' | 'variables';

export type DialogState =
  | { type: 'new-project' }
  | { type: 'rename-project'; projectId: string }
  | { type: 'duplicate-project'; projectId: string }
  | { type: 'delete-project'; projectId: string }
  | { type: 'open-project' }
  | { type: 'import' }
  | { type: 'new-variable' }
  | { type: 'new-message' }
  | null;

export interface Notice {
  id: number;
  kind: 'info' | 'success' | 'error';
  text: string;
}

export interface StudioState {
  ready: boolean;
  startupError: string | null;
  project: Project | null;
  revision: number;
  projects: ProjectSummary[];
  saveStatus: SaveStatus;
  saveError: string | null;
  lastSavedAt: string | null;
  /** The object selected in the hierarchy and viewport (null: none, the Stage is selected). */
  selectedId: string | null;
  /** Whose scripts the block editor shows: STAGE_TARGET_ID or an object id. */
  scriptTarget: string;
  viewMode: ViewMode;
  transformMode: TransformMode;
  runState: EngineState;
  logs: readonly LogEntry[];
  audioStatus: AudioStatus;
  notices: Notice[];
  dialog: DialogState;
  rightTab: RightTab;
  /** Set by the diagnostics list; the block editor selects this block and clears the value. */
  focusBlockId: string | null;
  /** Bumped when runtime diagnostics change so the editor refreshes its block warnings. */
  diagnosticsVersion: number;
}

const AUTOSAVE_DELAY_MS = 800;
const NOTICE_LIFETIME_MS = 6000;
const DEFAULT_PROJECT_NAME = 'Untitled project';

export class Studio {
  readonly store = createStore<StudioState>(() => ({
    ready: false,
    startupError: null,
    project: null,
    revision: 0,
    projects: [],
    saveStatus: 'idle',
    saveError: null,
    lastSavedAt: null,
    selectedId: null,
    scriptTarget: STAGE_TARGET_ID,
    viewMode: 'edit',
    transformMode: 'translate',
    runState: 'idle',
    logs: [],
    audioStatus: 'suspended',
    notices: [],
    dialog: null,
    rightTab: 'inspector',
    focusBlockId: null,
    diagnosticsVersion: 0,
  }));

  readonly audio: WebAudioHost;
  readonly engine: Engine;
  private service: ProjectService | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<boolean> | null = null;
  /** The revision that is known to be on disk (or -1 when unknown). */
  private revisionSaved = -1;
  private noticeSeq = 0;

  private readonly frameListeners = new Set<() => void>();
  private lastLogCount = 0;

  constructor() {
    this.audio = new WebAudioHost((assetId) => this.assetBytes(assetId));
    this.engine = new Engine(this.audio);
    this.engine.subscribe(() => {
      const logs = this.engine.logs;
      // Bump the diagnostics version only when the log list changes, not on every stepped frame.
      const changed = logs.length !== this.lastLogCount;
      this.lastLogCount = logs.length;
      this.set({
        runState: this.engine.state,
        logs,
        ...(changed ? { diagnosticsVersion: this.get().diagnosticsVersion + 1 } : {}),
      });
    });
  }

  /** Called once per animation frame by the app: advances the program, then notifies the views. */
  tick(frameSeconds: number): void {
    if (this.engine.state === 'running') this.engine.advance(frameSeconds);
    for (const listener of this.frameListeners) listener();
  }

  onFrame(listener: () => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  private get(): StudioState {
    return this.store.getState();
  }

  private set(patch: Partial<StudioState>): void {
    this.store.setState(patch);
  }

  notify(kind: Notice['kind'], text: string): void {
    const id = ++this.noticeSeq;
    this.set({ notices: [...this.get().notices.slice(-3), { id, kind, text }] });
    setTimeout(() => this.dismissNotice(id), NOTICE_LIFETIME_MS);
  }

  dismissNotice(id: number): void {
    this.set({ notices: this.get().notices.filter((n) => n.id !== id) });
  }

  private async assetBytes(assetId: string): Promise<ArrayBuffer | null> {
    if (!this.service) return null;
    return this.service.assetBytes(assetId);
  }

  private requireService(): ProjectService {
    if (!this.service) throw new UserError('Project storage is not ready yet.');
    return this.service;
  }

  private errorText(error: unknown): string {
    if (error instanceof UserError) return error.message;
    if (error instanceof ProjectValidationError) return `${error.message} ${error.issues.slice(0, 3).join(' ')}`;
    if (error instanceof Error) return error.message;
    return String(error);
  }

  /** Opens the storage, lists projects, and opens the last project (or creates the first one). */
  async init(openStorage: () => Promise<ProjectStorage>): Promise<void> {
    platform.onBeforeUnload(() => this.hasUnsavedChanges());
    let storage: ProjectStorage;
    try {
      storage = await openStorage();
    } catch (error) {
      this.set({ ready: true, startupError: `Bite could not open its project storage: ${this.errorText(error)} Changes cannot be saved in this browser session.` });
      return;
    }
    this.service = new ProjectService(storage);
    try {
      await this.refreshProjectList();
      const lastId = await storage.getMeta<string>('lastProjectId');
      if (lastId && this.get().projects.some((p) => p.id === lastId)) {
        try {
          await this.openProjectById(lastId, { silent: true });
        } catch (error) {
          // A damaged project is kept in storage (never deleted automatically). A new one is created.
          this.set({
            startupError: `Your last project could not be opened: ${this.errorText(error)} It is still in storage. A new project was created so you can keep working.`,
          });
          await this.createProject(DEFAULT_PROJECT_NAME);
        }
      } else {
        await this.createProject(DEFAULT_PROJECT_NAME);
      }
      this.set({ ready: true });
    } catch (error) {
      this.set({ ready: true, startupError: `Bite could not read its project storage: ${this.errorText(error)}` });
    }
  }

  hasUnsavedChanges(): boolean {
    const s = this.get().saveStatus;
    return s === 'dirty' || s === 'saving' || s === 'error';
  }

  async enableAudio(): Promise<void> {
    try {
      const status = await this.audio.unlock();
      this.set({ audioStatus: status });
      if (status === 'running') this.notify('success', 'Audio is enabled.');
      else this.notify('error', 'The browser did not enable audio. Click the button again.');
    } catch (error) {
      this.notify('error', `Audio could not be enabled: ${this.errorText(error)}`);
    }
  }

  // ------------------------------------------------------------------ saving

  async refreshProjectList(): Promise<void> {
    this.set({ projects: await this.requireService().listProjects() });
  }

  /** Saves the open project if it has unsaved changes. Returns false (and reports) if saving failed. */
  async flush(): Promise<boolean> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.saving) await this.saving;
    const s = this.get();
    if (!s.project || s.revision === this.revisionSaved) return true;
    const revision = s.revision;
    const project = s.project;
    this.set({ saveStatus: 'saving', saveError: null });
    this.saving = (async () => {
      try {
        const stored = await this.requireService().saveProject(project);
        this.revisionSaved = revision;
        const current = this.get();
        if (current.revision === revision) {
          this.set({ saveStatus: 'saved', lastSavedAt: stored.updatedAt, project: { ...current.project!, updatedAt: stored.updatedAt } });
        } else {
          // Edits arrived while saving; they are saved by a new autosave.
          this.set({ saveStatus: 'dirty' });
          this.scheduleSave();
        }
        return true;
      } catch (error) {
        const message = this.errorText(error);
        this.set({ saveStatus: 'error', saveError: message });
        this.notify('error', `Saving failed: ${message}`);
        return false;
      } finally {
        this.saving = null;
      }
    })();
    return this.saving;
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, AUTOSAVE_DELAY_MS);
  }

  /** Explicit save (Ctrl/Cmd+S). */
  async saveNow(): Promise<void> {
    if (await this.flush()) this.notify('success', 'Project saved.');
  }

  /** Records a project that storage has just written as the open project, without saving again. */
  private adoptSaved(project: Project): void {
    this.set({ project, revision: this.get().revision + 1, saveStatus: 'saved', lastSavedAt: project.updatedAt });
    this.revisionSaved = this.get().revision;
  }

  /** Makes another project current. Saves the current one first; aborts if that fails. */
  private async switchTo(load: () => Promise<Project>): Promise<void> {
    if (!(await this.flush())) {
      throw new UserError('The current project could not be saved, so nothing was switched. Fix the save problem and try again.');
    }
    const project = await load();
    this.engine.reset(project);
    this.set({
      project,
      revision: this.get().revision + 1,
      selectedId: null,
      scriptTarget: STAGE_TARGET_ID,
      viewMode: 'edit',
      focusBlockId: null,
      dialog: null,
    });
    this.revisionSaved = this.get().revision;
    this.set({ saveStatus: 'saved', saveError: null, lastSavedAt: project.updatedAt });
    await this.requireService().storage.setMeta('lastProjectId', project.id);
    await this.refreshProjectList();
  }

  async openProjectById(id: string, options: { silent?: boolean } = {}): Promise<void> {
    if (this.get().project?.id === id) return;
    await this.switchTo(() => this.requireService().loadProject(id));
    if (!options.silent) this.notify('info', `Opened "${this.get().project!.name}".`);
  }

  /** Opens a project from the project list. Errors are shown, not thrown. */
  async openProject(id: string): Promise<void> {
    try {
      await this.openProjectById(id);
    } catch (error) {
      this.notify('error', `Could not open the project: ${this.errorText(error)}`);
    }
  }

  async createProject(name: string): Promise<void> {
    try {
      const service = this.requireService();
      const project = await service.createProject(name);
      await this.switchTo(async () => project);
      this.notify('success', `Created "${project.name}".`);
    } catch (error) {
      this.notify('error', `Could not create the project: ${this.errorText(error)}`);
    }
  }

  async renameProject(id: string, name: string): Promise<void> {
    try {
      if (!(await this.flush())) throw new UserError('Save the project first (see the save error).');
      const service = this.requireService();
      const current = this.get().project;
      const project = current?.id === id ? current : await service.loadProject(id);
      const renamed = await service.renameProject(project, name);
      if (current?.id === id) this.adoptSaved(renamed);
      await this.refreshProjectList();
      this.set({ dialog: null });
      this.notify('success', `Renamed to "${renamed.name}".`);
    } catch (error) {
      this.notify('error', `Rename failed: ${this.errorText(error)}`);
    }
  }

  async duplicateProject(id: string, name: string): Promise<void> {
    try {
      if (!(await this.flush())) throw new UserError('The current project could not be saved first.');
      const copy = await this.requireService().duplicateProject(id, name);
      await this.switchTo(async () => copy);
      this.notify('success', `Duplicated as "${copy.name}". The copy is now open.`);
    } catch (error) {
      this.notify('error', `Duplicate failed: ${this.errorText(error)}`);
    }
  }

  /**
   * Deletes a project after the user typed its exact name. If it is the open project, another one
   * is opened (or a new one created) so the editor is never left without a project.
   */
  async deleteProject(id: string, typedName: string): Promise<void> {
    const summary = this.get().projects.find((p) => p.id === id);
    if (!summary) {
      this.notify('error', 'That project no longer exists.');
      return;
    }
    if (typedName.trim() !== summary.name) {
      this.notify('error', `Type the project name "${summary.name}" exactly to delete it.`);
      return;
    }
    try {
      const service = this.requireService();
      const isOpen = this.get().project?.id === id;
      if (isOpen) {
        // The open project is being deleted, so its pending changes are discarded on purpose.
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = null;
        if (this.saving) await this.saving;
        this.revisionSaved = this.get().revision;
        this.engine.stop();
      }
      await service.deleteProject(id);
      await this.refreshProjectList();
      this.set({ dialog: null });
      this.notify('info', `Deleted "${summary.name}".`);
      if (isOpen) {
        const next = this.get().projects[0];
        if (next) await this.switchTo(() => service.loadProject(next.id));
        else await this.switchTo(() => service.createProject(DEFAULT_PROJECT_NAME));
      }
    } catch (error) {
      this.notify('error', `Delete failed: ${this.errorText(error)}`);
    }
  }

  /** Imports a `.bite` package or a `.json` project as a new project. The current project is saved first. */
  async importFile(file: File): Promise<void> {
    try {
      if (!(await this.flush())) throw new UserError('The current project could not be saved, so the import was cancelled.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { project, notes } = await this.requireService().importFile(file.name, bytes);
      await this.switchTo(async () => project);
      this.notify('success', `Imported "${project.name}".${notes.length ? ` ${notes.join(' ')}` : ''}`);
    } catch (error) {
      this.notify('error', `Import failed: ${this.errorText(error)} The current project was not changed.`);
    }
  }

  async exportProject(): Promise<void> {
    try {
      const project = this.get().project;
      if (!project) return;
      if (!(await this.flush())) throw new UserError('Save the project before exporting (see the save error).');
      const bytes = await this.requireService().exportProject(project);
      const fileName = exportFileName(project.name);
      if (await platform.saveFile(fileName, bytes, 'application/zip')) this.notify('success', `Exported "${fileName}".`);
    } catch (error) {
      this.notify('error', `Export failed: ${this.errorText(error)}`);
    }
  }

  // ------------------------------------------------------------------ editing

  /** Runs an edit on a copy of the project. Failures are reported and leave the project unchanged. */
  mutate<T>(label: string, edit: (draft: Project) => T): T | undefined {
    const current = this.get().project;
    if (!current) return undefined;
    try {
      const draft = structuredClone(current);
      const result = edit(draft);
      this.set({ project: draft, revision: this.get().revision + 1, saveStatus: 'dirty' });
      this.scheduleSave();
      return result;
    } catch (error) {
      this.notify('error', `${label}: ${this.errorText(error)}`);
      return undefined;
    }
  }

  /** Scene edits are disabled while the program runs. */
  private canEditScene(): boolean {
    if (this.get().runState === 'running') {
      this.notify('info', 'Stop the program before editing objects.');
      return false;
    }
    return true;
  }

  private syncObject(id: string): void {
    const project = this.get().project;
    if (project) this.engine.syncObject(project, id);
  }

  private rebuildLive(): void {
    const project = this.get().project;
    if (project) this.engine.rebuildFromProject(project);
  }

  selectObject(id: string | null): void {
    this.set({ selectedId: id, scriptTarget: id ?? STAGE_TARGET_ID, rightTab: id ? 'inspector' : this.get().rightTab });
  }

  setScriptTarget(target: string): void {
    this.set({ scriptTarget: target });
  }

  createObject(kind: ObjectKind): void {
    if (!this.canEditScene()) return;
    const selected = this.get().selectedId;
    const parent = selected ? findObject(this.get().project!, selected) : undefined;
    const parentId = parent?.kind === 'group' ? parent.id : null;
    const created = this.mutate('Could not add the object', (p) => addObject(p, kind, { parentId }));
    if (!created) return;
    this.rebuildLive();
    this.set({ selectedId: created.id, scriptTarget: created.id, rightTab: 'inspector' });
  }

  duplicateSelected(): void {
    const id = this.get().selectedId;
    if (!id || !this.canEditScene()) return;
    const copy = this.mutate('Could not duplicate', (p) => duplicateObject(p, id));
    if (!copy) return;
    this.rebuildLive();
    this.set({ selectedId: copy.id, scriptTarget: copy.id });
    this.notify('success', `Duplicated as "${copy.name}".`);
  }

  deleteSelected(): void {
    const id = this.get().selectedId;
    if (!id || !this.canEditScene()) return;
    const removed = this.mutate('Could not delete', (p) => deleteObject(p, id));
    if (!removed) return;
    this.rebuildLive();
    this.set({ selectedId: null, scriptTarget: STAGE_TARGET_ID });
    this.notify('info', `Deleted ${removed.length} object(s).`);
  }

  renameObject(id: string, name: string): void {
    if (!this.canEditScene()) return;
    if (this.mutate('Rename failed', (p) => renameObject(p, id, name)) !== undefined) this.rebuildLive();
  }

  /** Gizmo or inspector change to an object's authored transform (degrees for rotation). */
  setTransform(id: string, patch: { position?: Vec3; rotation?: Vec3; scale?: Vec3 }): void {
    if (!this.canEditScene()) return;
    const ok = this.mutate('Transform not applied', (p) => {
      const obj = findObject(p, id);
      if (!obj) throw new UserError('That object no longer exists.');
      if (patch.position) obj.transform.position = patch.position.map(finite) as Vec3;
      if (patch.rotation) obj.transform.rotation = patch.rotation.map(finite) as Vec3;
      if (patch.scale) obj.transform.scale = patch.scale.map((v) => Math.max(0.001, Math.abs(finite(v)))) as Vec3;
      return true;
    });
    if (ok) this.syncObject(id);
  }

  /** Edits any other property of one object. Applies it to the live scene right away when stopped. */
  updateObject(id: string, label: string, edit: (obj: SceneObject, project: Project) => void): void {
    if (!this.canEditScene()) return;
    const ok = this.mutate(label, (p) => {
      const obj = findObject(p, id);
      if (!obj) throw new UserError('That object no longer exists.');
      edit(obj, p);
    });
    if (ok !== undefined) this.rebuildLive();
  }

  setObjectParent(id: string, parentId: string | null): void {
    if (!this.canEditScene()) return;
    if (parentId && subtreeOf(this.get().project!, id).some((o) => o.id === parentId)) {
      this.notify('error', 'An object cannot be placed inside itself.');
      return;
    }
    if (this.mutate('Could not change parent', (p) => setParent(p, id, parentId)) !== undefined) this.rebuildLive();
  }

  children(id: string | null): SceneObject[] {
    return childrenOf(this.get().project!, id);
  }

  /** Writes one target's scripts (called by the block editor after each user edit). */
  setScripts(target: string, scripts: ScriptsJSON): void {
    this.mutate('Could not save scripts', (p) => {
      if (target === STAGE_TARGET_ID) {
        p.stage.scripts = scripts as Project['stage']['scripts'];
        return;
      }
      const obj = findObject(p, target);
      if (!obj) throw new UserError('That object no longer exists.');
      obj.scripts = scripts as SceneObject['scripts'];
    });
  }

  /** Changes stage-wide settings (gravity, background, grid, stage camera). */
  setSettings(patch: Partial<Project['settings']>): void {
    if (!this.canEditScene()) return;
    if (this.mutate('Could not change the stage', (p) => {
      Object.assign(p.settings, patch);
      if (patch.stageCameraId !== undefined && patch.stageCameraId !== null && !findObject(p, patch.stageCameraId)) {
        throw new UserError('The chosen stage camera no longer exists.');
      }
    }) !== undefined) {
      this.rebuildLive();
    }
  }

  setTransformMode(mode: TransformMode): void {
    this.set({ transformMode: mode });
  }

  setViewMode(mode: ViewMode): void {
    this.set({ viewMode: mode });
  }

  setRightTab(tab: RightTab): void {
    this.set({ rightTab: tab });
  }

  openDialog(dialog: DialogState): void {
    this.set({ dialog });
  }

  focusBlock(blockId: string | null): void {
    this.set({ focusBlockId: blockId });
  }

  // ------------------------------------------------------------------ variables, messages, sounds

  createVariable(name: string, scope: 'global' | 'local', ownerId: string | null): void {
    const created = this.mutate('Could not create the variable', (p) => addVariable(p, { name, scope, ownerId, value: 0 }));
    if (created) this.set({ dialog: null });
  }

  renameVariable(id: string, name: string): void {
    this.mutate('Rename failed', (p) => {
      const variable = p.variables.find((v) => v.id === id);
      if (!variable) throw new UserError('That variable no longer exists.');
      const clean = validateName(name, 'Variable');
      assertVariableNameAvailable(p, clean, variable.scope, variable.ownerId, id);
      renameVariable(p, id, clean);
    });
  }

  /** Sets a variable's starting value from text. Numbers and true/false are converted; other text is kept. */
  setVariableInitialValue(id: string, raw: string): void {
    this.mutate('Could not set the value', (p) => {
      const trimmed = raw.trim();
      const value = trimmed !== '' && Number.isFinite(Number(trimmed)) ? Number(trimmed) : trimmed === 'true' ? true : trimmed === 'false' ? false : raw;
      setVariableValue(p, id, value);
    });
  }

  removeVariable(id: string): void {
    const refs = variableReferenceCount(this.get().project!, id);
    if (refs > 0) {
      this.notify('error', `This variable is used by ${refs} block(s). Remove those blocks before deleting it.`);
      return;
    }
    if (this.mutate('Could not delete the variable', (p) => deleteVariable(p, id)) !== undefined) this.rebuildLive();
  }

  createMessage(name: string): void {
    const created = this.mutate('Could not create the message', (p) => addMessage(p, name));
    if (created) this.set({ dialog: null });
  }

  removeMessage(id: string): void {
    const refs = messageReferenceCount(this.get().project!, id);
    if (refs > 0) {
      this.notify('error', `This message is used by ${refs} block(s). Remove those blocks first.`);
      return;
    }
    this.mutate('Could not delete the message', (p) => deleteMessage(p, id));
  }

  /** Adds a sound from a user file. The file is validated before it is stored. */
  async addSoundFile(file: File): Promise<void> {
    try {
      if (!(await this.flush())) throw new UserError('The current project could not be saved first.');
      const project = this.get().project;
      if (!project) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const saved = await this.requireService().addSoundFile(project, file.name, file.type, bytes);
      this.adoptSaved(saved);
      this.notify('success', `Added sound "${file.name}".`);
    } catch (error) {
      this.notify('error', `Could not add the sound: ${this.errorText(error)}`);
    }
  }

  /** Adds one of the built-in generated sounds. */
  async addBuiltinSound(builtinName: string): Promise<void> {
    try {
      const builtin = BUILTIN_SOUNDS.find((s) => s.name === builtinName);
      if (!builtin) throw new UserError(`Unknown built-in sound "${builtinName}".`);
      const assetId = await this.requireService().storage.putAsset(renderBuiltinWav(builtin), `${builtin.name}.wav`, 'audio/wav');
      if (this.mutate('Could not add the sound', (p) => addSound(p, builtin.name, assetId)) !== undefined) {
        this.notify('success', `Added the built-in sound "${builtin.name}".`);
      }
    } catch (error) {
      this.notify('error', `Could not add the sound: ${this.errorText(error)}`);
    }
  }

  removeSound(id: string): void {
    const refs = soundReferenceCount(this.get().project!, id);
    if (refs > 0) {
      this.notify('error', `This sound is used by ${refs} block(s). Remove those blocks first.`);
      return;
    }
    this.mutate('Could not delete the sound', (p) => deleteSound(p, id));
  }

  /** Plays a sound from the Sounds panel. Not available while the program runs (it reloads the sound buffers). */
  async previewSound(soundId: string): Promise<void> {
    const project = this.get().project;
    const sound = project?.sounds.find((s) => s.id === soundId);
    if (!project || !sound) return;
    if (this.get().runState === 'running') {
      this.notify('info', 'Stop the program to preview sounds.');
      return;
    }
    if (this.audio.status() !== 'running') {
      this.notify('error', 'Enable audio first (button in the toolbar), then preview the sound.');
      return;
    }
    try {
      const errors = await this.audio.load(project.sounds.map((s) => ({ id: s.id, name: s.name, assetId: s.assetId })));
      const failure = errors.get(soundId);
      if (failure) throw new UserError(failure);
      this.audio.play(soundId, null, 100);
    } catch (error) {
      this.notify('error', `Could not play "${sound.name}": ${this.errorText(error)}`);
    }
  }

  // ------------------------------------------------------------------ run

  async run(): Promise<void> {
    const project = this.get().project;
    if (!project || this.get().runState === 'running') return;
    if (this.audio.status() !== 'running' && project.sounds.length > 0) {
      this.notify('info', 'Audio is off. Click "Enable audio" in the toolbar to hear sounds.');
    }
    this.set({ viewMode: 'stage' });
    try {
      const result = await this.engine.run(project);
      if (result.soundErrors.length > 0) this.notify('error', `${result.soundErrors.length} sound(s) could not be loaded. See Diagnostics.`);
    } catch (error) {
      this.notify('error', `The program could not start: ${this.errorText(error)}`);
      this.engine.stop();
    }
  }

  stop(): void {
    this.engine.stop();
  }

  /** Restores the authored layout (objects return to their saved positions). */
  reset(): void {
    const project = this.get().project;
    if (project) this.engine.reset(project);
  }
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
