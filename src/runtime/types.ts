/**
 * Interfaces between the block runtime and the services it drives (scene, physics, audio).
 * The runtime depends only on these interfaces, so it can be tested deterministically
 * and the renderer / physics / audio implementations can evolve independently.
 */
import type { ObjectKind, ScriptsJSON, Vec3 } from '../core/types';
import type { ScriptNode } from '../core/scripts';
import type { SceneState, LiveTarget } from './sceneState';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  /** Object id, `stage`, or null for runtime-wide messages. */
  targetId: string | null;
  /** Runtime clock (seconds since Run started) when the message was logged. */
  time: number;
  /** Id of the block that produced the message, if any. */
  blockId?: string;
}

export interface RuntimeModelObject {
  id: string;
  name: string;
  kind: ObjectKind;
  parentId: string | null;
}

/** Names and scopes the runtime needs to resolve references in scripts. */
export interface RuntimeModel {
  objects: Map<string, RuntimeModelObject>;
  variables: Map<string, { id: string; name: string; scope: 'global' | 'local'; ownerId: string | null; initial: number | string | boolean }>;
  messages: Map<string, { id: string; name: string }>;
  sounds: Map<string, { id: string; name: string }>;
}

export interface Hat {
  targetId: string;
  node: ScriptNode;
}

export interface SoundHandle {
  readonly done: boolean;
  stop(): void;
  setVolume(percent: number): void;
}

export interface AudioHost {
  hasSound(soundId: string): boolean;
  /** Starts playback. Throws if the sound is unknown or cannot be played. */
  play(soundId: string, targetId: string | null, volumePercent: number): SoundHandle;
  stopSound(soundId: string): void;
  stopAll(): void;
  /** Applies a volume change to the sounds an object is currently playing. */
  setTargetVolume(targetId: string, percent: number): void;
}

export interface PhysicsHost {
  /** Applies an impulse (instant change of momentum). Returns false if the object has no dynamic body. */
  applyImpulse(targetId: string, impulse: Vec3): boolean;
  /** Sets the linear velocity (m/s). Returns false if the object has no dynamic body. */
  setVelocity(targetId: string, velocity: Vec3): boolean;
  getVelocity(targetId: string): Vec3 | null;
  hasDynamicBody(targetId: string): boolean;
  setGravity(gravity: Vec3): void;
  /** True if the two objects currently touch (solid contact or sensor overlap). */
  touching(aId: string, bId: string): boolean;
  /** True if the object touches any other object that has a collider. */
  touchingAny(aId: string): boolean;
}

export interface Thread {
  id: number;
  targetId: string | null;
  hat: Hat;
  generator: Generator<void, void, unknown> | null;
  done: boolean;
  /** Once-per-thread message keys already reported, to keep repeated warnings from spamming the log. */
  reported: Set<string>;
}

/** The subset of the runtime that block implementations use. */
export interface RuntimeCore {
  /** Runtime clock: seconds since Run started. */
  readonly time: number;
  /** Seconds since the last timer reset (or Run start). */
  readonly timer: number;
  readonly model: RuntimeModel;
  readonly scene: SceneState;
  readonly audio: AudioHost;
  readonly physics: PhysicsHost | null;
  readonly keys: ReadonlySet<string>;
  readonly mouseDown: boolean;
  /** Sound volume (0-100) of the Stage, which has no object volume of its own. */
  stageVolume: number;
  rng(): number;
  readVariable(variableId: string, target: LiveTarget | null): number | string | boolean;
  writeVariable(variableId: string, target: LiveTarget | null, value: number | string | boolean): void;
  broadcast(messageId: string): Thread[];
  /** Ends every script (including the caller) and stops the run. */
  stopAll(fromThread: Thread | null): void;
  stopOtherThreadsOf(targetId: string | null, except: Thread): void;
  resetTimer(): void;
  log(level: LogLevel, message: string, thread: Thread | null, blockId?: string): void;
}

export type ScriptsByTarget = Record<string, ScriptsJSON>;
