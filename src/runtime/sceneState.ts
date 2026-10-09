/**
 * Live (runtime) state of every scene object: the pose, visibility and appearance that the
 * renderer draws and that physics writes into. It is initialized from the authored project and
 * is discarded by Reset. See DESIGN_LOG.md, D-08 (authored vs live) and D-10 (physics rules).
 */
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { DEG_TO_RAD, cloneVec3 } from '../core/math';
import type { ObjectKind, Vec3 } from '../core/types';

export interface LiveSpeech {
  text: string;
  /** Runtime clock time at which the bubble disappears, or null to keep it until replaced. */
  until: number | null;
}

export interface LiveTarget {
  id: string;
  name: string;
  kind: ObjectKind;
  parentId: string | null;
  /** Local transform (relative to the parent). Rotation is YXZ Euler degrees. */
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  visible: boolean;
  color: string;
  opacity: number;
  soundVolume: number;
  speech: LiveSpeech | null;
  /** Set when the program or the editor changed the pose; physics pushes dirty poses before stepping. */
  dirty: boolean;
}

export interface LiveTargetInit {
  id: string;
  name: string;
  kind: ObjectKind;
  parentId: string | null;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  visible: boolean;
  color: string;
  opacity: number;
  soundVolume: number;
}

const scratchEuler = new Euler(0, 0, 0, 'YXZ');
const scratchQuat = new Quaternion();
const scratchPos = new Vector3();
const scratchScale = new Vector3();

export class SceneState {
  private readonly targets = new Map<string, LiveTarget>();

  /** Replaces all live state with the given authored layout. */
  replaceAll(entries: LiveTargetInit[]): void {
    this.targets.clear();
    for (const entry of entries) {
      this.targets.set(entry.id, {
        ...entry,
        position: cloneVec3(entry.position),
        rotation: cloneVec3(entry.rotation),
        scale: cloneVec3(entry.scale),
        speech: null,
        dirty: false,
      });
    }
  }

  /**
   * Creates or updates one target from its authored state, keeping any live speech and the
   * current pose untouched when `keepPose` is set (used when the editor changes non-pose settings).
   */
  upsert(init: LiveTargetInit, keepPose = false): void {
    const existing = this.targets.get(init.id);
    if (!existing) {
      this.targets.set(init.id, { ...init, position: cloneVec3(init.position), rotation: cloneVec3(init.rotation), scale: cloneVec3(init.scale), speech: null, dirty: false });
      return;
    }
    existing.name = init.name;
    existing.kind = init.kind;
    existing.parentId = init.parentId;
    existing.visible = init.visible;
    existing.color = init.color;
    existing.opacity = init.opacity;
    existing.soundVolume = init.soundVolume;
    if (!keepPose) {
      existing.position = cloneVec3(init.position);
      existing.rotation = cloneVec3(init.rotation);
      existing.scale = cloneVec3(init.scale);
      existing.dirty = true;
    }
  }

  remove(id: string): void {
    this.targets.delete(id);
  }

  get(id: string | null | undefined): LiveTarget | undefined {
    return id ? this.targets.get(id) : undefined;
  }

  has(id: string): boolean {
    return this.targets.has(id);
  }

  list(): LiveTarget[] {
    return [...this.targets.values()];
  }

  get size(): number {
    return this.targets.size;
  }

  /** Writes a pose change and marks the target dirty for physics. */
  setPose(id: string, patch: { position?: Vec3; rotation?: Vec3; scale?: Vec3 }): void {
    const target = this.targets.get(id);
    if (!target) return;
    if (patch.position) target.position = cloneVec3(patch.position);
    if (patch.rotation) target.rotation = cloneVec3(patch.rotation);
    if (patch.scale) target.scale = cloneVec3(patch.scale);
    target.dirty = true;
  }

  /** Writes a pose coming from physics readback. Does not mark the target dirty. */
  setPhysicsPose(id: string, position: Vec3, rotation: Vec3): void {
    const target = this.targets.get(id);
    if (!target) return;
    target.position = cloneVec3(position);
    target.rotation = cloneVec3(rotation);
  }

  /** Local matrix: T · R · S using the YXZ rotation convention. */
  localMatrix(id: string): Matrix4 {
    const target = this.targets.get(id);
    const m = new Matrix4();
    if (!target) return m;
    scratchEuler.set(target.rotation[0] * DEG_TO_RAD, target.rotation[1] * DEG_TO_RAD, target.rotation[2] * DEG_TO_RAD, 'YXZ');
    scratchQuat.setFromEuler(scratchEuler);
    scratchPos.set(target.position[0], target.position[1], target.position[2]);
    scratchScale.set(target.scale[0], target.scale[1], target.scale[2]);
    return m.compose(scratchPos, scratchQuat, scratchScale);
  }

  /** World matrix composed through the parent chain (cycle-safe). */
  worldMatrix(id: string): Matrix4 {
    const chain: LiveTarget[] = [];
    const seen = new Set<string>();
    let cursor = this.targets.get(id);
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      chain.push(cursor);
      cursor = cursor.parentId ? this.targets.get(cursor.parentId) : undefined;
    }
    const world = new Matrix4();
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      world.multiply(this.localMatrix(chain[i].id));
    }
    return world;
  }

  worldPosition(id: string): Vec3 {
    const p = new Vector3().setFromMatrixPosition(this.worldMatrix(id));
    return [p.x, p.y, p.z];
  }
}
