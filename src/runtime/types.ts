import type { BlockNode, Script, SceneObject, Variable, Vec3, Value } from '../model/types';

/** Runtime view of one target (a scene object or the stage). Scripts mutate these clones, never the project. */
export interface RuntimeTarget {
  /** Object id, or "stage". */
  readonly id: string;
  readonly isStage: boolean;
  /** Mutable copy of the object; null for the stage. */
  readonly object: SceneObject | null;
  /** Object-local variables (empty for the stage). */
  readonly variables: Variable[];
  readonly scripts: Script[];
  /** Speech bubble; `until` is simulated time or null for "until changed". */
  says: { text: string; until: number | null } | null;
  /** Set when a script wrote the transform; the physics bridge pushes the pose and clears the flag. */
  poseDirty: boolean;
  /** Physical intents queued by blocks and consumed by the physics bridge on the next step. */
  pendingImpulse: Vec3 | null;
  pendingVelocity: Vec3 | null;
  /** Name shown in diagnostics. */
  readonly name: string;
}

export type ThreadStatus = 'active' | 'done' | 'stopped' | 'error';

export interface Thread {
  readonly id: number;
  readonly target: RuntimeTarget;
  readonly script: Script;
  /** Id of the hat block that started the thread (used for highlighting). */
  readonly hatId: string;
  gen: Generator<void, void, void>;
  status: ThreadStatus;
  /** Block currently executing (for diagnostics and highlighting). */
  currentBlockId: string | null;
  /** Blocks executed during the current scheduler step (guards against runaway synchronous loops). */
  opsThisStep: number;
}

export type LogLevel = 'info' | 'warning' | 'error';

export interface LogEntry {
  id: number;
  level: LogLevel;
  message: string;
  /** Simulated time in seconds when the entry was recorded. */
  time: number;
  targetId: string | null;
  targetName: string | null;
  blockId: string | null;
  /** Number of identical messages folded into this entry. */
  count: number;
}

/** Physics bridge: implemented by the Rapier world, or by a test double at the boundary. */
export interface PhysicsPort {
  /** Creates/rebuilds bodies as needed and pushes script-driven poses and intents into the world. */
  syncFromScripts(targets: Iterable<RuntimeTarget>): void;
  step(dt: number): void;
  /** Writes simulated poses back into dynamic objects. */
  syncToScripts(targets: Iterable<RuntimeTarget>): void;
  /** True/false when both targets have a body; null when either has none. */
  isInContact(a: RuntimeTarget, b: RuntimeTarget): boolean | null;
  linearVelocity(target: RuntimeTarget): Vec3 | null;
  setGravity(gravity: Vec3): void;
  dispose(): void;
}

/** Audio bridge: implemented by the WebAudio engine, or by a test double at the boundary. */
export interface AudioPort {
  /** Starts playback. Throws an Error with a user-facing message when the sound cannot be played. */
  play(soundId: string, volume: number): PlaybackHandle;
  stop(soundId: string): void;
  stopAll(): void;
  setMasterVolume(volume: number): void;
}

export interface PlaybackHandle {
  isPlaying(): boolean;
}

export interface RuntimeState {
  /** Simulated seconds since the session started. */
  clock: number;
  timerStart: number;
  gravity: Vec3;
  backgroundColor: string;
  activeCameraId: string | null;
  /** Master volume in percent, 0..100. */
  masterVolume: number;
  mouseDown: boolean;
  mouseX: number;
  mouseY: number;
  readonly keysDown: Set<string>;
}

export type RuntimeEvent =
  | { type: 'log'; entry: LogEntry }
  | { type: 'error'; blockId: string | null; targetId: string; message: string }
  | { type: 'threads'; count: number };

export type { Value, BlockNode };
