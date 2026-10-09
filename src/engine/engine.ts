/**
 * The execution engine: owns the runtime, physics world, audio host and live scene for one Run.
 *
 * Lifecycle (decision D-08):
 * - run():   rebuilds the live scene from the authored project, creates physics, and starts scripts.
 * - advance(): called once per display frame; runs fixed 1/60 s logic steps (program, then physics).
 * - stop():  ends every script, stops sounds and physics, but keeps the live state for inspection.
 * - reset(): stop, then restore the live scene from the authored project.
 *
 * Program writes are applied before physics in each step, and physics reads dynamic poses back once
 * per step, so the two never overwrite each other within a step (see src/physics/physicsWorld.ts).
 */
import type { Project } from '../core/project';
import { physicsWarnings, PhysicsWorld, PHYSICS_STEP_SECONDS } from '../physics/physicsWorld';
import { Runtime } from '../runtime/runtime';
import { buildHats, buildLiveTargets, buildRuntimeModel } from '../runtime/model';
import { SceneState } from '../runtime/sceneState';
import type { AudioHost, LogEntry } from '../runtime/types';
import type { WebAudioHost } from '../audio/webAudioHost';

export const LOGIC_STEP = PHYSICS_STEP_SECONDS;
/** Longest frame that will be simulated; longer gaps (tab switched, debugger) are dropped. */
export const MAX_FRAME_SECONDS = 0.25;
/** Safety valve: never run more than this many steps in one frame. */
export const MAX_STEPS_PER_FRAME = 15;
const MAX_LOG_ENTRIES = 300;

export type EngineState = 'idle' | 'running' | 'stopped';

/** The audio device the engine needs: playback from the runtime, plus loading sounds before a run. */
export type EngineAudio = AudioHost & Pick<WebAudioHost, 'load'>;

export interface RunResult {
  warnings: string[];
  soundErrors: string[];
}

export class Engine {
  readonly scene = new SceneState();
  private runtime: Runtime | null = null;
  private physics: PhysicsWorld | null = null;
  private accumulator = 0;
  private _state: EngineState = 'idle';
  private _logs: LogEntry[] = [];
  private readonly listeners = new Set<() => void>();
  private _lastStepCount = 0;

  constructor(readonly audio: EngineAudio) {}

  get state(): EngineState {
    return this._state;
  }

  get logs(): readonly LogEntry[] {
    return this._logs;
  }

  /** Steps taken during the most recent advance() call. Exposed for tests and diagnostics. */
  get lastStepCount(): number {
    return this._lastStepCount;
  }

  get activeThreadCount(): number {
    return this.runtime?.activeThreadCount ?? 0;
  }

  get physicsBodyCount(): number {
    return this.physics?.bodyCount ?? 0;
  }

  get runtimeTime(): number {
    return this.runtime?.time ?? 0;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private pushLog(entry: LogEntry): void {
    this._logs = [...this._logs.slice(-(MAX_LOG_ENTRIES - 1)), entry];
    this.emit();
  }

  clearLogs(): void {
    this._logs = [];
    this.emit();
  }

  /** Starts a run from the authored project. Any previous run is stopped first. */
  async run(project: Project): Promise<RunResult> {
    this.stop();
    this.clearLogs();
    this.scene.replaceAll(buildLiveTargets(project));
    const soundErrors: string[] = [];
    const errors = await this.audio.load(project.sounds.map((s) => ({ id: s.id, name: s.name, assetId: s.assetId })));
    for (const message of errors.values()) {
      soundErrors.push(message);
      this.pushLog({ level: 'warn', message, targetId: null, time: 0 });
    }
    const warnings = physicsWarnings(project);
    for (const message of warnings) this.pushLog({ level: 'warn', message, targetId: null, time: 0 });

    this.physics = await PhysicsWorld.create(project, this.scene);
    this.runtime = new Runtime({
      model: buildRuntimeModel(project),
      hats: buildHats(project),
      scene: this.scene,
      audio: this.audio,
      physics: this.physics,
      stageVolume: 100,
      onLog: (entry) => this.pushLog(entry),
      // The runtime has already halted the other scripts; only the host resources remain to release.
      onStopAll: () => this.releaseHostResources(),
    });
    this.accumulator = 0;
    this._state = 'running';
    this.runtime.start();
    this.emit();
    return { warnings, soundErrors };
  }

  /** Ends all scripts, stops sounds and physics. The live scene is kept so the user can inspect it. */
  stop(): void {
    if (this._state !== 'running' && !this.runtime) return;
    this.runtime?.halt();
    this.releaseHostResources();
  }

  private releaseHostResources(): void {
    this.runtime = null;
    this.audio.stopAll();
    this.physics?.dispose();
    this.physics = null;
    this.accumulator = 0;
    this._state = 'stopped';
    this.emit();
  }

  /** Stop, then restore the live scene to the authored layout. */
  reset(project: Project): void {
    this.stop();
    this.scene.replaceAll(buildLiveTargets(project));
    this._state = 'idle';
    this.clearLogs();
    this.emit();
  }

  /** Advances the simulation by a frame's wall-clock time, in fixed logic steps. */
  advance(frameSeconds: number): void {
    this._lastStepCount = 0;
    if (this._state !== 'running' || !this.runtime) return;
    const frame = Number.isFinite(frameSeconds) ? Math.max(0, Math.min(frameSeconds, MAX_FRAME_SECONDS)) : 0;
    this.accumulator += frame;
    while (this.accumulator >= LOGIC_STEP - 1e-12 && this._state === 'running' && this.runtime) {
      this.runtime.tick(LOGIC_STEP);
      this.physics?.syncFromProgram(this.scene);
      this.physics?.step(this.scene);
      this.accumulator -= LOGIC_STEP;
      this._lastStepCount += 1;
      if (this._lastStepCount >= MAX_STEPS_PER_FRAME) {
        this.accumulator = 0;
        break;
      }
    }
    if (this._lastStepCount > 0) this.emit();
  }

  /** Editor edit to one object while stopped or idle: update its live state without resetting others. */
  syncObject(project: Project, objectId: string): void {
    const obj = project.objects.find((o) => o.id === objectId);
    if (!obj) {
      this.scene.remove(objectId);
      return;
    }
    const init = buildLiveTargets({ ...project, objects: [obj] })[0];
    this.scene.upsert(init, this._state === 'running');
    this.emit();
  }

  /** Structural edits (add, delete, duplicate) rebuild the live scene from the authored layout. */
  rebuildFromProject(project: Project): void {
    if (this._state === 'running') return;
    this.scene.replaceAll(buildLiveTargets(project));
    this.emit();
  }
}
