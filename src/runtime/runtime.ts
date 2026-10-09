import { Box3, Matrix4 } from 'three';
import { worldMatrix } from '../model/transform';
import type { Project, Script, SceneObject, SoundAsset, Vec3 } from '../model/types';
import { objectWorldAabb } from './geometry';
import { BlockError, OpContext, ScriptStop } from './context';
import { HAT_TO_EVENT } from './opcodes/events';
import { REPORTERS } from './opcodes';
import { runStack } from './runner';
import type { ReporterImpl } from './opcodes/types';
import { DiagnosticsLog } from './diagnostics';
import type {
  AudioPort,
  LogEntry,
  PhysicsPort,
  RuntimeEvent,
  RuntimeState,
  RuntimeTarget,
  Thread,
} from './types';

export interface RuntimePorts {
  physics: PhysicsPort;
  audio: AudioPort;
}

/** Upper bound on simultaneously running threads, protecting the frame from event storms. */
export const MAX_THREADS = 2000;
/** Largest simulated step; longer real frames (tab switches) are clamped so physics stays stable. */
export const MAX_STEP_SECONDS = 0.1;

const NOOP_GEN = (function* noop(): Generator<void, void, void> {})();

/**
 * The play-mode engine. It owns cloned copies of every object and script, runs scripts as cooperative
 * generators, and advances simulated time in fixed steps driven by `tick`. Nothing here touches the DOM,
 * so the whole engine can be tested in Node with real physics and fake audio at the boundary.
 */
export class Runtime {
  readonly state: RuntimeState;
  readonly log = new DiagnosticsLog();
  readonly stage: RuntimeTarget;
  /** Mutable object copies, in project order. Parent links point into this array. */
  readonly objects: SceneObject[];
  readonly physics: PhysicsPort;
  readonly audio: AudioPort;

  private readonly targetById = new Map<string, RuntimeTarget>();
  private readonly objectTargetList: RuntimeTarget[] = [];
  private readonly soundIds: Set<string>;
  private threads: Thread[] = [];
  private nextThreadId = 1;
  private stopAllRequested = false;
  private current: Thread | null = null;
  private listeners = new Set<(event: RuntimeEvent) => void>();
  private disposed = false;

  constructor(project: Project, ports: RuntimePorts) {
    const copy = structuredClone(project);
    this.physics = ports.physics;
    this.audio = ports.audio;
    this.objects = copy.objects;
    this.soundIds = new Set(copy.sounds.map((s: SoundAsset) => s.id));
    this.state = {
      clock: 0,
      timerStart: 0,
      gravity: [...copy.settings.gravity] as Vec3,
      backgroundColor: copy.settings.backgroundColor,
      activeCameraId: copy.settings.activeCameraId,
      masterVolume: copy.settings.masterVolume,
      mouseDown: false,
      mouseX: 0,
      mouseY: 0,
      keysDown: new Set<string>(),
    };
    this.stage = {
      id: 'stage',
      name: copy.stage.name,
      isStage: true,
      object: null,
      variables: copy.stage.variables,
      scripts: copy.stage.scripts,
      says: null,
      poseDirty: false,
      pendingImpulse: null,
      pendingVelocity: null,
    };
    this.targetById.set(this.stage.id, this.stage);
    for (const o of this.objects) {
      const t: RuntimeTarget = {
        id: o.id,
        name: o.name,
        isStage: false,
        object: o,
        variables: o.variables,
        scripts: o.scripts,
        says: null,
        poseDirty: false,
        pendingImpulse: null,
        pendingVelocity: null,
      };
      this.targetById.set(o.id, t);
      this.objectTargetList.push(t);
    }
    this.physics.setGravity(this.state.gravity);
    this.audio.setMasterVolume(this.state.masterVolume / 100);
  }

  /** Every object target (not the stage), in project order. */
  objectTargets(): readonly RuntimeTarget[] {
    return this.objectTargetList;
  }

  /** Object target by id, or undefined for unknown ids and for "stage". */
  /** Current speech bubble text of an object, or null. Used by tests and the debug snapshot. */
  speechOf(targetId: string): string | null {
    return this.objectTarget(targetId)?.says?.text ?? null;
  }

  objectTarget(id: string): RuntimeTarget | undefined {
    const t = this.targetById.get(id);
    return t && !t.isStage ? t : undefined;
  }

  reporterOf(opcode: string): ReporterImpl | undefined {
    return REPORTERS[opcode];
  }

  hasSound(id: string): boolean {
    return this.soundIds.has(id);
  }

  setMasterVolume(percent: number): void {
    const v = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0));
    this.state.masterVolume = v;
    this.audio.setMasterVolume(v / 100);
  }

  setGravity(g: Vec3): void {
    this.state.gravity = [...g] as Vec3;
    this.physics.setGravity(this.state.gravity);
  }

  isKeyDown(key: string): boolean {
    if (key === 'any') return this.state.keysDown.size > 0;
    return this.state.keysDown.has(key);
  }

  /** Simulated seconds since the timer was last reset. */
  timerValue(): number {
    return this.state.clock - this.state.timerStart;
  }

  /** True when the two targets overlap: physics contacts when both have bodies, otherwise AABB overlap. */
  isTouching(a: RuntimeTarget, b: RuntimeTarget): boolean {
    const physical = this.physics.isInContact(a, b);
    if (physical !== null) return physical;
    const ba = this.boundsOf(a);
    const bb = this.boundsOf(b);
    return ba !== null && bb !== null && ba.intersectsBox(bb);
  }

  private boundsOf(t: RuntimeTarget): Box3 | null {
    const o = t.object;
    if (!o || !o.visible) return null;
    const m: Matrix4 = worldMatrix(this.objects, o.id);
    return objectWorldAabb(o.kind, m);
  }

  /** Subscribes to log and error events. Returns the unsubscribe function. */
  subscribe(listener: (event: RuntimeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: RuntimeEvent): void {
    for (const l of this.listeners) l(event);
  }

  /** Green flag: starts every "when green flag clicked" script (stage first, then objects). */
  start(): number {
    this.assertLive();
    let started = 0;
    for (const t of this.allTargets()) {
      for (const script of t.scripts) {
        if (this.hatOf(script) === 'flag' && this.startThread(t, script, true)) started++;
      }
    }
    return started;
  }

  /** Starts receivers of a broadcast message. Restarts receivers that are already running. */
  broadcast(message: string): Thread[] {
    this.assertLive();
    const started: Thread[] = [];
    for (const t of this.allTargets()) {
      for (const script of t.scripts) {
        if (this.hatOf(script) === 'broadcast' && script.nodes[0]!.fields?.MESSAGE === message) {
          const th = this.startThread(t, script, true);
          if (th) started.push(th);
        }
      }
    }
    return started;
  }

  /** Key press: starts "when key pressed" scripts. Scripts that are already running are not restarted. */
  keyDown(key: string): void {
    this.assertLive();
    this.state.keysDown.add(key);
    for (const t of this.allTargets()) {
      for (const script of t.scripts) {
        if (this.hatOf(script) !== 'key') continue;
        const hatKey = String(script.nodes[0]!.fields?.KEY ?? '');
        if (hatKey === key || hatKey === 'any') this.startThread(t, script, false);
      }
    }
  }

  keyUp(key: string): void {
    this.state.keysDown.delete(key);
  }

  setPointer(x: number, y: number, down: boolean): void {
    this.state.mouseX = x;
    this.state.mouseY = y;
    this.state.mouseDown = down;
  }

  /** "When this object clicked": starts that object's click scripts. */
  clickObject(targetId: string): void {
    this.assertLive();
    const t = this.objectTarget(targetId);
    if (!t) return;
    for (const script of t.scripts) {
      if (this.hatOf(script) === 'click') this.startThread(t, script, true);
    }
  }

  /** Requests that every script stops at the end of the current frame (used by the "stop all" block). */
  requestStopAll(): void {
    this.stopAllRequested = true;
  }

  /** Stops every running script, the sounds, and the speech bubbles. The simulation state is kept. */
  stopAll(): void {
    for (const t of this.threads) this.stopThread(t);
    this.threads = [];
    this.stopAllRequested = false;
    for (const t of this.allTargets()) {
      t.says = null;
      t.pendingImpulse = null;
      t.pendingVelocity = null;
    }
    this.audio.stopAll();
  }

  /** "Stop other scripts of this object": stops every thread of the same target except `keep`. */
  stopOtherThreadsOfTarget(keep: Thread): void {
    for (const t of this.threads) {
      if (t !== keep && t.target === keep.target) this.stopThread(t);
    }
  }

  /** Blocks currently executing, for highlighting in the code editor. */
  activeBlockIds(): Set<string> {
    const ids = new Set<string>();
    for (const t of this.threads) {
      if (t.status === 'active' && t.currentBlockId) ids.add(t.currentBlockId);
    }
    return ids;
  }

  /** Hat block ids of running scripts. */
  activeHatIds(): Set<string> {
    const ids = new Set<string>();
    for (const t of this.threads) if (t.status === 'active') ids.add(t.hatId);
    return ids;
  }

  get runningThreadCount(): number {
    return this.threads.filter((t) => t.status === 'active').length;
  }

  /**
   * Advances the simulation by `dt` real seconds (clamped). Order per frame: scripts run, then the
   * physics bridge pushes script changes, steps the world and writes simulated poses back.
   */
  tick(dt: number): void {
    this.assertLive();
    if (!Number.isFinite(dt) || dt <= 0) return;
    const step = Math.min(dt, MAX_STEP_SECONDS);
    this.state.clock += step;

    for (const t of this.threads.slice()) {
      if (t.status !== 'active') continue;
      t.opsThisStep = 0;
      this.resume(t);
    }
    this.threads = this.threads.filter((t) => t.status === 'active');

    if (this.stopAllRequested) this.stopAll();

    this.expireSpeech();
    const targets = this.objectTargetList;
    this.physics.syncFromScripts(targets);
    this.physics.step(step);
    this.physics.syncToScripts(targets);
  }

  /** Releases resources. The runtime cannot be used afterwards. */
  dispose(): void {
    if (this.disposed) return;
    this.stopAll();
    this.physics.dispose();
    this.disposed = true;
  }

  private assertLive(): void {
    if (this.disposed) throw new Error('Runtime has been disposed');
  }

  private allTargets(): RuntimeTarget[] {
    return [this.stage, ...this.objectTargetList];
  }

  private hatOf(script: Script): string | null {
    const hat = script.nodes[0];
    if (!hat) return null;
    return HAT_TO_EVENT[hat.opcode] ?? null;
  }

  private startThread(target: RuntimeTarget, script: Script, restart: boolean): Thread | null {
    if (restart) {
      for (const t of this.threads) {
        if (t.status === 'active' && t.target === target && t.script === script) this.stopThread(t);
      }
    } else if (this.threads.some((t) => t.status === 'active' && t.target === target && t.script === script)) {
      return null;
    }
    if (this.runningThreadCount >= MAX_THREADS) {
      this.log.error(`Too many scripts are running (limit ${MAX_THREADS}). Some scripts were not started.`, this.state.clock, {
        targetId: target.id,
        targetName: target.name,
        blockId: script.nodes[0]?.id ?? null,
      });
      return null;
    }
    const thread: Thread = {
      id: this.nextThreadId++,
      target,
      script,
      hatId: script.nodes[0]?.id ?? '',
      gen: NOOP_GEN,
      status: 'active',
      currentBlockId: null,
      opsThisStep: 0,
    };
    thread.gen = this.runScript(thread);
    this.threads.push(thread);
    return thread;
  }

  private *runScript(thread: Thread): Generator<void, void, void> {
    const ctx = new OpContext(this, thread);
    yield* runStack(ctx, thread.script.nodes.slice(1));
  }

  private stopThread(t: Thread): void {
    if (t.status !== 'active') return;
    t.status = 'stopped';
    if (t !== this.current) closeGenerator(t.gen);
  }

  private resume(t: Thread): void {
    this.current = t;
    try {
      const r = t.gen.next();
      if (r.done && t.status === 'active') t.status = 'done';
    } catch (err) {
      if (err instanceof ScriptStop) {
        t.status = 'stopped';
      } else {
        t.status = 'error';
        this.reportError(t, err);
      }
    } finally {
      this.current = null;
    }
    // A thread stopped while it was running (e.g. it restarted itself) is closed at its suspension point.
    if (t.status === 'stopped') closeGenerator(t.gen);
  }

  private reportError(t: Thread, err: unknown): void {
    const context = { targetId: t.target.id, targetName: t.target.name };
    if (err instanceof BlockError) {
      const entry = this.log.error(err.message, this.state.clock, { ...context, blockId: err.blockId });
      this.emitError(entry, err.blockId, t.target.id);
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('Bite runtime internal error', err);
    const entry = this.log.error(`Internal error: ${message}`, this.state.clock, { ...context, blockId: t.currentBlockId });
    this.emitError(entry, t.currentBlockId, t.target.id);
  }

  private emitError(entry: LogEntry, blockId: string | null, targetId: string): void {
    this.emit({ type: 'log', entry });
    this.emit({ type: 'error', blockId, targetId, message: entry.message });
  }

  private expireSpeech(): void {
    for (const t of this.allTargets()) {
      if (t.says && t.says.until !== null && this.state.clock >= t.says.until) t.says = null;
    }
  }
}

function closeGenerator(gen: Generator<void, void, void>): void {
  try {
    gen.return();
  } catch {
    // The generator may be running or already finished; both are safe to ignore here.
  }
}
