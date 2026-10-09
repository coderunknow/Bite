import { Box3, Matrix4, Vector3 } from 'three';
import type { ObjectKind } from '../model/types';

/**
 * Half-extents of the unit geometry of each kind, before the object's world matrix (which includes scale)
 * is applied. Kinds without geometry (groups, lights, cameras) never touch anything.
 */
export const UNIT_HALF_EXTENTS: Partial<Record<ObjectKind, [number, number, number]>> = {
  cube: [0.5, 0.5, 0.5],
  sphere: [0.5, 0.5, 0.5],
  cylinder: [0.5, 0.5, 0.5],
  plane: [0.5, 0.01, 0.5],
};

/** World-space AABB of an object's geometry, or null when the kind has no geometry. */
export function objectWorldAabb(kind: ObjectKind, worldMatrix: Matrix4): Box3 | null {
  const h = UNIT_HALF_EXTENTS[kind];
  if (!h) return null;
  const box = new Box3();
  const v = new Vector3();
  for (const x of [-h[0], h[0]])
    for (const y of [-h[1], h[1]])
      for (const z of [-h[2], h[2]]) {
        v.set(x, y, z).applyMatrix4(worldMatrix);
        box.expandByPoint(v);
      }
  return box;
}
