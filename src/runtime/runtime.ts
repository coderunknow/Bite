/**
 * The block runtime: a cooperative scheduler for script threads (see DESIGN_LOG.md, D-09).
 *
 * - `tick(dt)` advances the runtime clock and resumes every running thread once. A thread
 *   runs until its next yield (a loop iteration or a wait), so the tick always returns.
 * - Events (green flag, key press, click, broadcast) start threads. Restarting a script that
 *   is already running stops the old thread first (Scratch semantics).
 * - Stop (`halt`) finishes every thread and is effective immediately, even for loops.
 */
import { HAT_BLOCK_TYPES } from '../core/blockTypes';
import { ANY_KEY } from '../core/keys';
import { parseScriptTree, topLevelRawBlocks, type ScriptNode } from '../core/scripts';
import type { ScriptsJSON } from '../core/types';
import { ScriptError, ThreadStop, runChain, type ExecContext } from './blocks';
import type { LiveTarget, SceneState } from './sceneState';
import type { AudioHost, Hat, LogEntry, LogLevel, PhysicsHost, RuntimeCore, RuntimeModel, Thread } from './types';

export interface RuntimeOptions {
  model: RuntimeModel;
  hats: Hat[];
  scene: SceneState;
  audio: AudioHost;
  physics: PhysicsHost | null;
  rng?: () => number;
  stageVolume?: number;
  onLog?: (entry: LogEntry) => void;
  /** Called after a "stop all" block halted the run, so the host can stop physics and sounds. */
  onStopAll?: () => void;
}

const STAGE_ID = 'stage';

function fieldOf(hat: Hat, name: string): string {
  const value = hat.node.fields[name];
  return value === undefined || value === null ? '' : String(value);
}

export class Runtime implements RuntimeCore {
  private clock = 0;
  private timerStart = 0;
  private readonly values = new Map<string, number | string | boolean>();
  private threads: Thread[] = [];
  private nextThreadId = 1;
  private readonly pressed = new Set<string>();
  private pointerDown = false;
  private halted = false;
  private executing: Thread | null = null;
  private readonly options: RuntimeOptions;

  stageVolume: number;

  constructor(options: RuntimeOptions) {
    this.options = options;
    this.stageVolume = options.stageVolume ?? 100;
    for (const variable of options.model.variables.values()) {
      this.values.set(variable.id, variable.initial);
    }
  }

  // ----------------------------------------------------- RuntimeCore getters

  get model(): RuntimeModel {
    return this.options.model;
  }
  get scene(): SceneState {
    return this.options.scene;
  }
  get audio(): AudioHost {
    return this.options.audio;
  }
  get physics(): PhysicsHost | null {
    return this.options.physics;
  }
  get time(): number {
    return this.clock;
  }
  get timer(): number {
    return this.clock - this.timerStart;
  }
  get keys(): ReadonlySet<string> {
    return this.pressed;
  }
  get mouseDown(): boolean {
    return this.pointerDown;
  }
  get isRunning(): boolean {
    return !this.halted;
  }
  get activeThreadCount(): number {
    return this.threads.filter((t) => !t.done).length;
  }
  get threadSnapshot(): ReadonlyArray<{ targetId: string | null; hatId: string; done: boolean }> {
    return this.threads.map((t) => ({ targetId: t.targetId, hatId: t.hat.node.id, done: t.done }));
  }

  rng(): number {
    return (this.options.rng ?? Math.random)();
  }

  // ------------------------------------------------------------- lifecycle

  /** Starts the run: resets the clock and starts every "when green flag clicked" script. */
  start(): void {
    this.clock = 0;
    this.timerStart = 0;
    this.halted = false;
    for (const hat of this.options.hats) {
      if (hat.node.type === 'event_whenflagclicked') this.startThread(hat);
    }
  }

  /** Advances the clock by `dt` seconds and resumes each running thread once. */
  tick(dt: number): void {
    if (this.halted) return;
    this.clock += dt;
    for (const thread of [...this.threads]) {
      if (this.halted) break;
      if (thread.done) continue;
      this.resume(thread);
    }
    this.threads = this.threads.filter((t) => !t.done);
    for (const target of this.options.scene.list()) {
      const speech = target.speech;
      if (speech && speech.until !== null && this.clock >= speech.until) target.speech = null;
    }
  }

  /** Ends all threads and stops the run (the Stop button). Safe to call at any time. */
  halt(): void {
    this.halted = true;
    for (const thread of this.threads) this.finish(thread);
    this.threads = this.threads.filter((t) => !t.done);
  }

  // ---------------------------------------------------------------- events

  pressKey(key: string): void {
    if (this.halted) return;
    if (this.pressed.has(key)) return; // key repeat is not a new press
    this.pressed.add(key);
    for (const hat of this.options.hats) {
      if (hat.node.type !== 'event_whenkeypressed') continue;
      const wanted = fieldOf(hat, 'KEY');
      if (wanted === key || wanted === ANY_KEY) this.startThread(hat);
    }
  }

  releaseKey(key: string): void {
    this.pressed.delete(key);
  }

  releaseAllKeys(): void {
    this.pressed.clear();
  }

  setPointerDown(down: boolean): void {
    this.pointerDown = down;
  }

  /** Starts "when this object clicked" scripts of an object. */
  clickTarget(targetId: string): void {
    if (this.halted) return;
    for (const hat of this.options.hats) {
      if (hat.node.type === 'event_whenthisspriteclicked' && hat.targetId === targetId) this.startThread(hat);
    }
  }

  broadcast(messageId: string): Thread[] {
    const started: Thread[] = [];
    if (this.halted) return started;
    for (const hat of this.options.hats) {
      if (hat.node.type !== 'event_whenbroadcastreceived') continue;
      if (fieldOf(hat, 'MESSAGE') !== messageId) continue;
      const thread = this.startThread(hat);
      if (thread) started.push(thread);
    }
    return started;
  }

  // --------------------------------------------------------- RuntimeCore API

  readVariable(variableId: string, target: LiveTarget | null): number | string | boolean {
    const variable = this.requireVariable(variableId, target);
    return this.values.get(variable.id) ?? variable.initial;
  }

  writeVariable(variableId: string, target: LiveTarget | null, value: number | string | boolean): void {
    const variable = this.requireVariable(variableId, target);
    this.values.set(variable.id, value);
  }

  /** Current value of a variable, for display. Returns undefined for unknown ids. */
  variableValue(variableId: string): number | string | boolean | undefined {
    return this.values.get(variableId);
  }

  resetTimer(): void {
    this.timerStart = this.clock;
  }

  stopAll(fromThread: Thread | null): void {
    this.haltExcept(fromThread);
    this.options.onStopAll?.();
  }

  stopOtherThreadsOf(targetId: string | null, except: Thread): void {
    for (const thread of this.threads) {
      if (thread !== except && thread.targetId === targetId) this.finish(thread);
    }
  }

  log(level: LogLevel, message: string, thread: Thread | null, blockId?: string): void {
    this.options.onLog?.({
      level,
      message,
      targetId: thread?.targetId ?? null,
      time: this.clock,
      blockId,
    });
  }

  // ----------------------------------------------------------- internals

  private haltExcept(fromThread: Thread | null): void {
    this.halted = true;
    for (const thread of this.threads) {
      if (thread !== fromThread) this.finish(thread);
    }
  }

  private requireVariable(variableId: string, target: LiveTarget | null) {
    const variable = this.options.model.variables.get(variableId);
    if (!variable) throw new ScriptError('A variable used by this block no longer exists. Choose another variable.');
    if (variable.scope === 'local' && variable.ownerId !== (target?.id ?? null)) {
      throw new ScriptError(`The local variable "${variable.name}" belongs to another object and is not available to this script.`);
    }
    return variable;
  }

  private startThread(hat: Hat): Thread | null {
    if (hat.targetId !== STAGE_ID && !this.options.scene.has(hat.targetId)) return null;
    // Restarting: a running copy of the same script is stopped first.
    for (const existing of this.threads) {
      if (!existing.done && existing.hat.node.id === hat.node.id) this.finish(existing);
    }
    const thread: Thread = {
      id: this.nextThreadId++,
      targetId: hat.targetId === STAGE_ID ? null : hat.targetId,
      hat,
      generator: null,
      done: false,
      reported: new Set(),
    };
    const target = thread.targetId ? (this.options.scene.get(thread.targetId) ?? null) : null;
    const ctx: ExecContext = { core: this, target, thread };
    thread.generator = runChain(ctx, hat.node.next);
    this.threads.push(thread);
    return thread;
  }

  private resume(thread: Thread): void {
    const generator = thread.generator;
    if (!generator) {
      thread.done = true;
      return;
    }
    this.executing = thread;
    try {
      const result = generator.next();
      if (result.done) {
        this.finish(thread);
      } else if (thread.done) {
        // Finished by a restart/stop while it was suspended: release it now.
        generator.return(undefined);
      }
    } catch (error) {
      this.finish(thread);
      if (error instanceof ThreadStop) return;
      if (error instanceof ScriptError) {
        this.log('error', error.message, thread, error.blockId);
      } else {
        const detail = error instanceof Error ? error.message : String(error);
        this.log('error', `Unexpected runtime error: ${detail}`, thread);
      }
    } finally {
      this.executing = null;
    }
  }

  private finish(thread: Thread): void {
    if (thread.done) return;
    thread.done = true;
    // The executing generator cannot be closed from inside itself; it unwinds via ThreadStop.
    if (thread !== this.executing && thread.generator) thread.generator.return(undefined);
  }
}

/** Parses the scripts of every target into hats. Non-hat stacks are ignored at runtime (validation warns). */
export function collectHats(scriptsByTarget: Array<{ targetId: string; scripts: ScriptsJSON }>): Hat[] {
  const hats: Hat[] = [];
  for (const { targetId, scripts } of scriptsByTarget) {
    for (const raw of topLevelRawBlocks(scripts)) {
      if (!HAT_BLOCK_TYPES.has(String(raw.type))) continue;
      const node: ScriptNode = parseScriptTree(raw);
      hats.push({ targetId, node });
    }
  }
  return hats;
}

