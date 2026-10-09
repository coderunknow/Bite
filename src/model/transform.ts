/**
 * Coordinate-convention helpers shared by the runtime, physics, scene and inspector.
 * All angles at the model boundary are degrees; three.js uses radians internally.
 */
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { SceneObject, Transform, Vec3 } from './types';

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/** Euler order used for every object rotation in the project. */
export const ROTATION_ORDER = 'YXZ' as const;

export function identityTransform(): Transform {
  return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
}

export function cloneVec3(v: Vec3): Vec3 {
  return [v[0], v[1], v[2]];
}

/** Local matrix of a transform: T * R * S (R from degrees, Euler YXZ). */
export function localMatrix(t: Transform, target = new Matrix4()): Matrix4 {
  const q = new Quaternion().setFromEuler(new Euler(t.rotation[0] * DEG, t.rotation[1] * DEG, t.rotation[2] * DEG, ROTATION_ORDER));
  return target.compose(new Vector3(...t.position), q, new Vector3(...t.scale));
}

/**
 * World matrix of an object: product of local matrices along the parent chain.
 * Throws if the chain contains a cycle (a corrupted project); callers should validate first.
 */
export function worldMatrix(objects: readonly SceneObject[], id: string): Matrix4 {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const chain: SceneObject[] = [];
  const seen = new Set<string>();
  let current: SceneObject | undefined = byId.get(id);
  while (current) {
    if (seen.has(current.id)) throw new Error(`Parent cycle detected at object "${current.name}"`);
    seen.add(current.id);
    chain.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  const result = new Matrix4();
  for (let i = chain.length - 1; i >= 0; i--) {
    result.multiply(localMatrix(chain[i]!.transform));
  }
  return result;
}

/** World position of an object (its origin). */
export function worldPosition(objects: readonly SceneObject[], id: string): Vec3 {
  const p = new Vector3().setFromMatrixPosition(worldMatrix(objects, id));
  return [p.x, p.y, p.z];
}

/** Unit forward vector (local -Z) of a world orientation given as Euler degrees. */
export function forwardOf(rotationDeg: Vec3): Vec3 {
  const q = new Quaternion().setFromEuler(new Euler(rotationDeg[0] * DEG, rotationDeg[1] * DEG, rotationDeg[2] * DEG, ROTATION_ORDER));
  const f = new Vector3(0, 0, -1).applyQuaternion(q);
  return [f.x, f.y, f.z];
}

/** Yaw (degrees, about +Y) that makes an object at `from` face `to` in the XZ plane. */
export function yawTowards(from: Vec3, to: Vec3): number {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  if (dx === 0 && dz === 0) return 0;
  // forward at yaw θ is (-sin θ, 0, -cos θ). Solve for θ.
  return Math.atan2(-dx, -dz) * RAD;
}

export function eulerDegToQuaternion(rotation: Vec3): Quaternion {
  return new Quaternion().setFromEuler(new Euler(rotation[0] * DEG, rotation[1] * DEG, rotation[2] * DEG, ROTATION_ORDER));
}

export function quaternionToEulerDeg(q: { x: number; y: number; z: number; w: number }): Vec3 {
  const e = new Euler().setFromQuaternion(new Quaternion(q.x, q.y, q.z, q.w), ROTATION_ORDER);
  return [e.x * RAD, e.y * RAD, e.z * RAD];
}

/** Wraps an angle in degrees into (-180, 180]; keeps values tidy in the inspector. */
export function wrapDegrees(deg: number): number {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}
