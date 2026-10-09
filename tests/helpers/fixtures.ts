import { createProject, createSceneObject } from '../../src/model/defaults';
import { newId } from '../../src/model/ids';
import type { AudioPort, PlaybackHandle } from '../../src/runtime/types';
import type { BlockNode, InputValue, ObjectKind, Project, SceneObject, Script, Variable, Vec3 } from '../../src/model/types';

export interface BlockOptions {
  id?: string;
  fields?: Record<string, string | number | boolean>;
  inputs?: Record<string, InputValue>;
  stacks?: Record<string, BlockNode[]>;
}

export function block(opcode: string, opts: BlockOptions = {}): BlockNode {
  return { id: opts.id ?? newId(), opcode, fields: opts.fields, inputs: opts.inputs, stacks: opts.stacks };
}

export function flagHat(...body: BlockNode[]): Script {
  return { id: newId(), position: { x: 0, y: 0 }, nodes: [block('event_whenflagclicked'), ...body] };
}

export function scriptWith(hat: BlockNode, ...body: BlockNode[]): Script {
  return { id: newId(), position: { x: 0, y: 0 }, nodes: [hat, ...body] };
}

export interface ObjOptions {
  name?: string;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  bodyType?: SceneObject['physics']['bodyType'];
  mass?: number;
  scripts?: Script[];
  variables?: Variable[];
  visible?: boolean;
}

export function makeObject(kind: ObjectKind, o: ObjOptions = {}): SceneObject {
  const obj = createSceneObject(kind, o.name, {
    position: o.position ?? [0, 0, 0],
    rotation: o.rotation ?? [0, 0, 0],
    scale: o.scale ?? [1, 1, 1],
  });
  if (o.bodyType) obj.physics.bodyType = o.bodyType;
  else obj.physics.bodyType = 'none';
  if (o.mass !== undefined) obj.physics.mass = o.mass;
  obj.scripts = o.scripts ?? [];
  obj.variables = o.variables ?? [];
  if (o.visible !== undefined) obj.visible = o.visible;
  return obj;
}

export function makeProject(objects: SceneObject[], opts: { stageScripts?: Script[]; stageVariables?: Variable[]; sounds?: Project['sounds'] } = {}): Project {
  const p = createProject('Test', new Date('2026-01-01T00:00:00Z'));
  p.objects = objects;
  p.stage.scripts = opts.stageScripts ?? [];
  p.stage.variables = opts.stageVariables ?? [];
  p.sounds = opts.sounds ?? [];
  return p;
}

/** Audio boundary double: records calls and lets a test finish playback on demand. */
export class FakeAudio implements AudioPort {
  readonly played: string[] = [];
  readonly stopped: string[] = [];
  stopAllCount = 0;
  masterVolume = 1;
  private handles: { id: string; done: boolean }[] = [];
  /** When true, play() throws with this message (simulating a decode failure). */
  failWith: string | null = null;

  play(soundId: string): PlaybackHandle {
    if (this.failWith) throw new Error(this.failWith);
    this.played.push(soundId);
    const h = { id: soundId, done: false };
    this.handles.push(h);
    return { isPlaying: () => !h.done };
  }
  stop(soundId: string): void {
    this.stopped.push(soundId);
    for (const h of this.handles) if (h.id === soundId) h.done = true;
  }
  stopAll(): void {
    this.stopAllCount++;
    for (const h of this.handles) h.done = true;
  }
  setMasterVolume(volume: number): void {
    this.masterVolume = volume;
  }
  finishAll(): void {
    for (const h of this.handles) h.done = true;
  }
  get activeCount(): number {
    return this.handles.filter((h) => !h.done).length;
  }
}

export const FRAME = 1 / 60;

export function runSeconds(tick: (dt: number) => void, seconds: number): void {
  const n = Math.round(seconds / FRAME);
  for (let i = 0; i < n; i++) tick(FRAME);
}
