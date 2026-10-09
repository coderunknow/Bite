/**
 * The Studio wires the framework-free engines (3D view, Blockly editor, audio, runtime) to the React store.
 * It owns the animation loop, the play session lifecycle (Run / Stop / Reset) and autosave.
 */
import { AudioEngine } from '../audio/audioEngine';
import { CodeEditor } from '../blocks/codeEditor';
import { optionsFor, type ProjectOptions } from '../blocks/options';
import { patchObject, setScripts } from '../editor/edit';
import { RapierPhysics } from '../physics/rapierPhysics';
import { preloadSounds, validateForRun } from '../runtime/preRun';
import { normalizeKey } from '../runtime/keys';
import { Runtime } from '../runtime/runtime';
import type { LogEntry } from '../runtime/types';
import { SceneView } from '../scene/sceneView';
import type { Project, SceneObject } from '../model/types';
import type { ProjectService } from '../storage/projectService';
import { isDirty, useAppStore, type Mode } from './store';

export const STAGE_ID = 'stage';
const EMPTY_SET = new Set<string>();

export class Studio {
  readonly audio = new AudioEngine();
  private view: SceneView | null = null;
  private editor: CodeEditor | null = null;
  private runtime: Runtime | null = null;
  private unsubRuntimeLog: (() => void) | null = null;
  private unsubRuntime: (() => void) | null = null;
  private raf = 0;
  private last = 0;
  private frames = 0;
  private startToken = 0;
  private loadedKey = '';
  private autosaveTimer: number | null = null;
  private autosaveInFlight: Promise<void> = Promise.resolve();
  private unsubStore: (() => void) | null = null;
  private readonly listeners: { target: EventTarget; type: string; fn: (e: Event) => void }[] = [];
  private lastProject: Project | null = null;
  private lastTab: string | null = null;

  constructor(readonly service: ProjectService) {}

  get mode(): Mode {
    return useAppStore.getState().mode;
  }

  /** The runtime of the current play session (read-only for tests and the debug accessor). */
  get currentRuntime(): Runtime | null {
    return this.runtime;
  }

  get viewObjectCount(): number {
    return this.view?.objectCount ?? 0;
  }

  mount(viewport: HTMLElement, codeHost: HTMLElement): void {
    this.view = new SceneView(viewport, {
      onSelect: (id) => useAppStore.getState().select(id),
      onTransformCommit: (id, transform) => {
        useAppStore.getState().edit((p) => patchObject(p, id, (o) => {
          o.transform = transform;
        }));
      },
      onPick: (id) => {
        if (useAppStore.getState().mode === 'running') this.runtime?.clickObject(id);
      },
    });
    this.editor = new CodeEditor(codeHost, {
      onChange: (scripts) => {
        const target = this.codeTarget();
        useAppStore.getState().edit((p) => setScripts(p, target, scripts));
      },
    });
    this.bindInput(viewport);
    this.unsubStore = useAppStore.subscribe((state) => this.onStore(state));
    this.onStore(useAppStore.getState());
    this.raf = requestAnimationFrame(this.frame);
  }

  unmount(): void {
    cancelAnimationFrame(this.raf);
    this.unsubStore?.();
    this.disposeRuntime();
    for (const l of this.listeners) l.target.removeEventListener(l.type, l.fn);
    this.listeners.length = 0;
    if (this.autosaveTimer !== null) window.clearTimeout(this.autosaveTimer);
    this.editor?.dispose();
    this.view?.dispose();
    this.editor = null;
    this.view = null;
  }

  /** Releases the audio device. Called once when the page is being torn down for good. */
  async closeAudio(): Promise<void> {
    await this.audio.close();
  }

  /** Target whose scripts the code editor shows. */
  codeTarget(): string {
    const sel = useAppStore.getState().selection;
    const p = useAppStore.getState().project;
    if (!sel || sel === STAGE_ID) return STAGE_ID;
    return p?.objects.some((o) => o.id === sel) ? sel : STAGE_ID;
  }

  /** Green flag. Snapshots the authored project into a new runtime. Must be called from a user gesture. */
  async run(): Promise<void> {
    const store = useAppStore.getState();
    if (!store.project) return;
    const token = ++this.startToken;
    this.disposeRuntime();
    store.setMode('running');
    store.setDiagnostics([]);
    this.editor?.clearWarnings();
    this.view?.setMode('play');
    const project = store.project;
    const issues = validateForRun(project);

    try {
      const unlocked = await this.audio.unlock();
      useAppStore.getState().setAudioBlocked(!unlocked);
    } catch {
      useAppStore.getState().setAudioBlocked(true);
    }
    const soundIssues = await preloadSounds(project, this.audio, { readSound: (id) => this.service.readSound(project.id, id) }, () => token === this.startToken);
    if (token !== this.startToken) return;

    const physics = await RapierPhysics.create(project.settings.gravity);
    if (token !== this.startToken) {
      physics.dispose();
      return;
    }
    const runtime = new Runtime(project, { physics, audio: this.audio });
    this.runtime = runtime;
    this.unsubRuntimeLog = runtime.log.subscribe((entries: readonly LogEntry[]) => {
      useAppStore.getState().setDiagnostics([...entries]);
    });
    this.unsubRuntime = runtime.subscribe((ev) => {
      if (ev.type === 'error' && ev.blockId && this.editor && ev.targetId === this.codeTarget()) {
        this.editor.setError(ev.blockId, ev.message);
      }
    });
    for (const issue of [...issues, ...soundIssues]) {
      runtime.log.add(issue.level, issue.message, 0, { targetId: issue.targetId, blockId: issue.blockId });
      if (issue.blockId && issue.targetId === this.codeTarget()) this.editor?.setError(issue.blockId, issue.message);
    }
    runtime.start();
  }

  /** Stop: halts every script and sound and freezes the simulation. The scene keeps its last state. */
  stop(): void {
    this.startToken++;
    this.runtime?.stopAll();
    this.audio.stopAll();
    useAppStore.getState().setMode('stopped');
    this.editor?.highlight(EMPTY_SET);
  }

  /** Reset: discards the play session and returns to editing with the authored project. */
  reset(): void {
    this.startToken++;
    this.disposeRuntime();
    this.audio.stopAll();
    useAppStore.getState().setMode('edit');
    this.view?.setMode('edit');
    this.editor?.clearWarnings();
    this.editor?.highlight(EMPTY_SET);
  }

  /** True while an autosave is scheduled or running. */
  get autosavePending(): boolean {
    return this.autosaveTimer !== null;
  }

  /** Writes the working copy immediately (used before switching projects and on Save). */
  async flushAutosave(): Promise<void> {
    if (this.autosaveTimer !== null) {
      window.clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
      await this.writeWorking();
    }
    await this.autosaveInFlight;
  }

  /** Explicit save: the working copy becomes the saved snapshot. */
  async save(): Promise<void> {
    const store = useAppStore.getState();
    if (!store.project) return;
    await this.flushAutosave();
    const project = useAppStore.getState().project!;
    store.setSaveState('saving');
    try {
      await this.service.save(project);
      useAppStore.getState().setSaved(project);
      useAppStore.getState().toast('Project saved.');
    } catch (err) {
      useAppStore.getState().setSaveState('unsaved');
      useAppStore.getState().toast(`Could not save: ${errorText(err)}`, 'error');
    }
  }

  /** Dispatches a DOM key event to the running project. Returns true if the key was used. */
  handleKey(e: KeyboardEvent, down: boolean): boolean {
    if (useAppStore.getState().mode !== 'running' || !this.runtime) return false;
    if (isTypingTarget(e.target)) return false;
    const key = normalizeKey(e.key);
    if (!key) return false;
    if (down) {
      if (!e.repeat) this.runtime.keyDown(key);
    } else {
      this.runtime.keyUp(key);
    }
    if (key === 'space' || key.endsWith('arrow')) e.preventDefault();
    return true;
  }

  private bindInput(viewport: HTMLElement): void {
    const on = (target: EventTarget, type: string, fn: (e: Event) => void) => {
      target.addEventListener(type, fn);
      this.listeners.push({ target, type, fn });
    };
    on(window, 'keydown', (e) => this.handleKey(e as KeyboardEvent, true));
    on(window, 'keyup', (e) => this.handleKey(e as KeyboardEvent, false));
    on(window, 'blur', () => this.runtime?.state.keysDown.clear());
    const pointer = (e: Event, down: boolean) => {
      const pe = e as PointerEvent;
      const r = viewport.getBoundingClientRect();
      this.runtime?.setPointer(pe.clientX - r.left, pe.clientY - r.top, down);
    };
    on(viewport, 'pointerdown', (e) => pointer(e, true));
    on(viewport, 'pointermove', (e) => pointer(e, (e as PointerEvent).buttons > 0));
    on(viewport, 'pointerup', (e) => pointer(e, false));
    on(viewport, 'pointerleave', (e) => pointer(e, false));
  }

  private disposeRuntime(): void {
    this.unsubRuntimeLog?.();
    this.unsubRuntime?.();
    this.unsubRuntimeLog = null;
    this.unsubRuntime = null;
    this.runtime?.dispose();
    this.runtime = null;
  }

  private onStore(state: ReturnType<typeof useAppStore.getState>): void {
    const project = state.project;
    if (!this.view || !this.editor) return;
    this.view.setSelected(state.selection && state.selection !== STAGE_ID ? state.selection : null);
    this.view.setMode(state.mode === 'edit' ? 'edit' : 'play');
    if (project && project !== this.lastProject) {
      this.lastProject = project;
      this.editor.setOptions(optionsOf(project, this.codeTarget()));
      if (state.projectId) this.scheduleAutosave();
    }
    this.editor.setReadOnly(state.mode !== 'edit');
    if (state.tab !== this.lastTab) {
      this.lastTab = state.tab;
      requestAnimationFrame(() => this.editor?.resize());
    }
    if (state.tab === 'code' && project) {
      const target = this.codeTarget();
      const key = `${state.projectId}|${state.epoch}|${target}`;
      if (key !== this.loadedKey) {
        this.loadedKey = key;
        const scripts = target === STAGE_ID ? project.stage.scripts : project.objects.find((o) => o.id === target)?.scripts ?? [];
        this.editor.load(target, target === STAGE_ID ? 'stage' : 'object', scripts, optionsOf(project, target));
      }
    }
  }

  private scheduleAutosave(): void {
    if (this.autosaveTimer !== null) window.clearTimeout(this.autosaveTimer);
    useAppStore.getState().setSaveState('unsaved');
    this.autosaveTimer = window.setTimeout(() => {
      this.autosaveTimer = null;
      this.autosaveInFlight = this.writeWorking();
    }, 700);
  }

  private async writeWorking(): Promise<void> {
    const project = useAppStore.getState().project;
    if (!project) return;
    try {
      await this.service.saveWorking(project);
      const st = useAppStore.getState();
      st.setSaveState(isDirty(st.project, st.saved) ? 'unsaved' : 'saved');
    } catch (err) {
      useAppStore.getState().setSaveState('unsaved');
      useAppStore.getState().toast(`Autosave failed: ${errorText(err)}`, 'error');
    }
  }

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.last ? (now - this.last) / 1000 : 0;
    this.last = now;
    const st = useAppStore.getState();
    if (!this.view || !st.project) return;
    try {
      if (this.runtime && st.mode === 'running') this.runtime.tick(dt);
    } catch (err) {
      console.error(err);
      this.stop();
      useAppStore.getState().toast(`The simulation stopped unexpectedly: ${errorText(err)}`, 'error');
    }
    const playing = this.runtime !== null && st.mode !== 'edit';
    const objects: readonly SceneObject[] = playing ? this.runtime!.objects : st.project.objects;
    this.view.sync(objects, st.project.settings, playing ? { backgroundColor: this.runtime!.state.backgroundColor, activeCameraId: this.runtime!.state.activeCameraId } : undefined);
    this.view.render(playing ? this.runtime!.state.activeCameraId : null);
    this.frames++;
    if (this.editor && st.tab === 'code' && this.frames % 6 === 0) {
      this.editor.highlight(this.runtime && st.mode === 'running' ? this.runtime.activeBlockIds() : EMPTY_SET);
    }
  };

  /** Viewport canvas for screenshots. Null until mounted. */
  screenshot(): string | null {
    return this.view ? this.view.snapshotPng() : null;
  }

  focusSelection(): void {
    const id = useAppStore.getState().selection;
    if (id && id !== STAGE_ID) this.view?.focus(id);
  }

  /** Read-only snapshot used by the E2E tests and the in-page debug hook. */
  debugSnapshot(): Record<string, unknown> {
    const st = useAppStore.getState();
    const rt = this.runtime;
    const objects = (rt && st.mode !== 'edit' ? rt.objects : st.project?.objects ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      kind: o.kind,
      visible: o.visible,
      position: [...o.transform.position],
      rotation: [...o.transform.rotation],
      scale: [...o.transform.scale],
      says: rt ? rt.speechOf(o.id) : null,
    }));
    return {
      mode: st.mode,
      tab: st.tab,
      projectId: st.projectId,
      projectName: st.project?.name ?? null,
      saveState: st.saveState,
      dirty: isDirty(st.project, st.saved),
      selection: st.selection,
      objects,
      messages: st.diagnostics.map((d) => ({ level: d.level, message: d.message, targetId: d.targetId })),
      viewObjectCount: this.viewObjectCount,
      backend: st.backend,
    };
  }
}

/** Dropdown options for the code editor: the target's own variables plus the stage's global variables. */
export function optionsOf(p: Project, target: string): ProjectOptions {
  const own = p.objects.find((o) => o.id === target)?.variables ?? [];
  return {
    objects: p.objects.filter((o) => o.kind !== 'camera').map((o) => ({ id: o.id, name: o.name })),
    cameras: p.objects.filter((o) => o.kind === 'camera').map((o) => ({ id: o.id, name: o.name })),
    variables: [
      ...own.map((v) => ({ id: v.id, name: v.name })),
      ...p.stage.variables.map((v) => ({ id: v.id, name: `${v.name} (stage)` })),
    ],
    messages: p.messages,
    sounds: p.sounds.map((s) => ({ id: s.id, name: s.name })),
  };
}

export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Exposed so the Blockly dropdowns and tests can read the same option list. */
export { optionsFor };
