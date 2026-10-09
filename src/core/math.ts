/**
 * Coordinate-system conventions for Bite (see DESIGN_LOG.md, decision D-07).
 *
 * - Right-handed, Y-up, units are meters. The ground plane is y = 0.
 * - Position is the object origin (the center of primitives).
 * - Rotation is Euler angles in DEGREES with order 'YXZ':
 *     x = pitch (about X), y = yaw / heading (about Y), z = roll (about Z).
 *   The orientation is yaw · pitch · roll (roll is applied first, in local space).
 * - An object's forward direction is its local -Z axis after rotation.
 *   At rotation (0,0,0) forward is (0,0,-1).
 * - "Turn right" is clockwise when viewed from above (yaw decreases); "turn left" increases yaw.
 */
import type { Vec3 } from './types';

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Converts a finite number, or returns the fallback for NaN/Infinity. */
export function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return [x, y, z];
}

export function cloneVec3(v: Vec3): Vec3 {
  return [v[0], v[1], v[2]];
}

export function vecEquals(a: Vec3, b: Vec3, epsilon = 1e-9): boolean {
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon && Math.abs(a[2] - b[2]) <= epsilon;
}

/** Forward direction (local -Z) for a YXZ-euler rotation given in degrees. */
export function forwardFromRotation(rotationDeg: Vec3): Vec3 {
  const pitch = rotationDeg[0] * DEG_TO_RAD;
  const yaw = rotationDeg[1] * DEG_TO_RAD;
  // R = Ry * Rx * Rz applied to (0,0,-1): roll (Rz) leaves the vector unchanged.
  return [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
}

/** Heading (yaw in degrees) that makes an object's forward vector point toward (dx, dz). */
export function yawToward(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz) * RAD_TO_DEG;
}

/** Scratch-style "size" percentage: 100 × the average of the three scale components. */
export function sizePercent(scale: Vec3): number {
  return ((scale[0] + scale[1] + scale[2]) / 3) * 100;
}

export function distance(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Wrap an angle into (-180, 180]. Used to keep yaw values readable. */
export function wrapDegrees(angle: number): number {
  let a = ((angle + 180) % 360 + 360) % 360 - 180;
  if (a === -180) a = 180;
  return a;
}

export const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;
export type Axis = keyof typeof AXIS_INDEX;
