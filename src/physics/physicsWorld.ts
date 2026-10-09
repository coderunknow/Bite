/**
 * Rapier-backed physics for the stage (decision D-05, D-10, D-11, D-12).
 *
 * Ownership rules that keep programmed motion and physics from fighting:
 * - The program (and the editor) writes poses into the live SceneState and marks them dirty.
 * - `syncFromProgram` pushes dirty poses into the physics bodies, then clears the dirty flag.
 * - `step` advances the engine and reads dynamic bodies back into the live state WITHOUT marking
 *   them dirty, so a readback is never pushed back into the engine.
 * - Kinematic bodies receive the program's pose as a next-step target, so the engine computes their
 *   velocity and pushes dynamic bodies. Static and sensor-only ("none") bodies are teleported.
 */
import * as RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Quaternion } from 'three';
import type { Project, SceneObject } from '../core/project';
import type { ObjectKind, PhysicsMode, Vec3 } from '../core/types';
import { DEG_TO_RAD, RAD_TO_DEG } from '../core/math';
import type { PhysicsHost } from '../runtime/types';
import type { LiveTarget, SceneState } from '../runtime/sceneState';

export const PHYSICS_STEP_SECONDS = 1 / 60;
const PLANE_HALF_THICKNESS = 0.01;
const MIN_SCALE = 0.001;

/** Kinds that have a physical shape. Groups, lights and cameras never collide. */
const SHAPE_KINDS: ReadonlySet<ObjectKind> = new Set<ObjectKind>(['cube', 'sphere', 'cylinder', 'plane']);

interface Entry {
  id: string;
  kind: ObjectKind;
  mode: PhysicsMode;
  mass: number;
  friction: number;
  restitution: number;
  scale: Vec3;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
}

export function eulerDegToQuaternion(rotation: Vec3): Quaternion {
  const euler = new Euler(rotation[0] * DEG_TO_RAD, rotation[1] * DEG_TO_RAD, rotation[2] * DEG_TO_RAD, 'YXZ');
  return new Quaternion().setFromEuler(euler);
}

export function quaternionToEulerDeg(q: { x: number; y: number; z: number; w: number }): Vec3 {
  const euler = new Euler().setFromQuaternion(new Quaternion(q.x, q.y, q.z, q.w), 'YXZ');
  return [euler.x * RAD_TO_DEG, euler.y * RAD_TO_DEG, euler.z * RAD_TO_DEG];
}

function sameVec(a: Vec3, b: Vec3): boolean {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9 && Math.abs(a[2] - b[2]) < 1e-9;
}

/** Unit-size vertices for convex-hull shapes (cube-like extent of ±1, centre at origin). */
function unitVertices(kind: ObjectKind): number[][] {
  if (kind === 'sphere') {
    const points: number[][] = [];
    for (let i = 0; i <= 8; i += 1) {
      const theta = (i / 8) * Math.PI;
      for (let j = 0; j < 12; j += 1) {
        const phi = (j / 12) * Math.PI * 2;
        points.push([Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)]);
      }
    }
    return points;
  }
  if (kind === 'cylinder') {
    const points: number[][] = [];
    for (const y of [-1, 1]) {
      for (let j = 0; j < 16; j += 1) {
        const phi = (j / 16) * Math.PI * 2;
        points.push([Math.cos(phi), y, Math.sin(phi)]);
      }
    }
    return points;
  }
  return [
    [-1, -1, -1],
    [1, -1, -1],
    [-1, 1, -1],
    [1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [-1, 1, 1],
    [1, 1, 1],
  ];
}

/**
 * Builds the collider for a primitive at the given scale. Uniform scale uses analytic shapes;
 * non-uniform scale uses a convex hull of the scaled unit shape (decision: see DESIGN_LOG D-07/PHY).
 */
function buildColliderDesc(kind: ObjectKind, scale: Vec3): RAPIER.ColliderDesc {
  const sx = Math.max(MIN_SCALE, Math.abs(scale[0]));
  const sy = Math.max(MIN_SCALE, Math.abs(scale[1]));
  const sz = Math.max(MIN_SCALE, Math.abs(scale[2]));
  const uniform = Math.abs(sx - sy) < 1e-9 && Math.abs(sy - sz) < 1e-9;
  if (uniform) {
    if (kind === 'sphere') return RAPIER.ColliderDesc.ball(sx / 2);
    if (kind === 'cylinder') return RAPIER.ColliderDesc.cylinder(sy / 2, sx / 2);
    if (kind === 'plane') {
      return RAPIER.ColliderDesc.cuboid(sx / 2, PLANE_HALF_THICKNESS, sz / 2).setTranslation(0, -PLANE_HALF_THICKNESS, 0);
    }
    return RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2);
  }
  const flat = kind === 'plane' ? PLANE_HALF_THICKNESS : 1;
  const points = new Float32Array(unitVertices(kind).flatMap(([x, y, z]) => [x * sx / 2, y * flat * sy / 2, z * sz / 2]));
  const hull = RAPIER.ColliderDesc.convexHull(points);
  if (hull) return hull;
  return RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2);
}

/** Warnings about physics settings that cannot take effect (shown in the diagnostics panel before Run). */
export function physicsWarnings(project: Pick<Project, 'objects'>): string[] {
  const warnings: string[] = [];
  for (const obj of project.objects) {
    if (obj.physics.mode === 'none') continue;
    if (obj.parentId !== null) {
      warnings.push(
        `"${obj.name}" has a physics mode but is inside a group. Physics applies to top-level objects; it moves with its parent visually.`,
      );
    } else if (!SHAPE_KINDS.has(obj.kind)) {
      warnings.push(`"${obj.name}" is a ${obj.kind} and has no collision shape, so its physics mode is ignored.`);
    }
  }
  return warnings;
}

export class PhysicsWorld implements PhysicsHost {
  private readonly world: RAPIER.World;
  private readonly entries = new Map<string, Entry>();
  private disposed = false;

  private constructor(gravity: Vec3) {
    this.world = new RAPIER.World({ x: gravity[0], y: gravity[1], z: gravity[2] });
    this.world.timestep = PHYSICS_STEP_SECONDS;
  }

  /** Creates a world with bodies for every top-level physical object, using the live poses. */
  static async create(project: Project, scene: SceneState): Promise<PhysicsWorld> {
    await RAPIER.init();
    const world = new PhysicsWorld(project.settings.gravity);
    for (const obj of project.objects) {
      const live = scene.get(obj.id);
      if (!live) continue;
      world.addObject(obj, live);
    }
    return world;
  }

  get bodyCount(): number {
    return this.entries.size;
  }

  private addObject(obj: SceneObject, live: LiveTarget): void {
    // Children move with their parent visually (D-12); only top-level shapes get bodies.
    if (obj.parentId !== null || !SHAPE_KINDS.has(obj.kind)) return;
    const mode = obj.physics.mode;
    const entry = {
      id: obj.id,
      kind: obj.kind,
      mode,
      mass: obj.physics.mass,
      friction: obj.physics.friction,
      restitution: obj.physics.restitution,
      scale: [...live.scale] as Vec3,
    };
    const created = this.createBody(entry, live.position, live.rotation);
    this.entries.set(obj.id, { ...entry, body: created.body, collider: created.collider });
  }

  private createBody(entry: Pick<Entry, 'kind' | 'mode' | 'mass' | 'friction' | 'restitution' | 'scale'>, position: Vec3, rotation: Vec3): { body: RAPIER.RigidBody; collider: RAPIER.Collider } {
    const q = eulerDegToQuaternion(rotation);
    let bodyDesc: RAPIER.RigidBodyDesc;
    if (entry.mode === 'dynamic') bodyDesc = RAPIER.RigidBodyDesc.dynamic();
    else if (entry.mode === 'kinematic') bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
    else bodyDesc = RAPIER.RigidBodyDesc.fixed();
    bodyDesc.setTranslation(position[0], position[1], position[2]).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = buildColliderDesc(entry.kind, entry.scale)
      .setFriction(entry.friction)
      .setRestitution(entry.restitution)
      .setSensor(entry.mode === 'none');
    if (entry.mode === 'dynamic') colliderDesc.setMass(Math.max(0.001, entry.mass));
    const collider = this.world.createCollider(colliderDesc, body);
    return { body, collider };
  }

  /** Pushes poses the program or editor changed since the last step into the engine. */
  syncFromProgram(scene: SceneState): void {
    if (this.disposed) return;
    for (const entry of this.entries.values()) {
      const live = scene.get(entry.id);
      if (!live || !live.dirty) continue;
      if (!sameVec(live.scale, entry.scale)) {
        // Shape changed: rebuild the body at the new pose (rare: only size blocks/inspector).
        this.world.removeRigidBody(entry.body);
        entry.scale = [...live.scale] as Vec3;
        const created = this.createBody(entry, live.position, live.rotation);
        entry.body = created.body;
        entry.collider = created.collider;
      } else {
        const p = live.position;
        const q = eulerDegToQuaternion(live.rotation);
        if (entry.mode === 'kinematic') {
          entry.body.setNextKinematicTranslation({ x: p[0], y: p[1], z: p[2] });
          entry.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
        } else {
          entry.body.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
          entry.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
        }
      }
      live.dirty = false;
    }
  }

  /** Advances the simulation one fixed step and reads dynamic bodies back into the live state. */
  step(scene: SceneState): void {
    if (this.disposed) return;
    this.world.step();
    for (const entry of this.entries.values()) {
      if (entry.mode !== 'dynamic') continue;
      const t = entry.body.translation();
      const r = entry.body.rotation();
      scene.setPhysicsPose(entry.id, [t.x, t.y, t.z], quaternionToEulerDeg(r));
    }
  }

  applyImpulse(targetId: string, impulse: Vec3): boolean {
    const entry = this.entries.get(targetId);
    if (!entry || entry.mode !== 'dynamic' || this.disposed) return false;
    entry.body.applyImpulse({ x: impulse[0], y: impulse[1], z: impulse[2] }, true);
    return true;
  }

  setVelocity(targetId: string, velocity: Vec3): boolean {
    const entry = this.entries.get(targetId);
    if (!entry || entry.mode !== 'dynamic' || this.disposed) return false;
    entry.body.setLinvel({ x: velocity[0], y: velocity[1], z: velocity[2] }, true);
    return true;
  }

  getVelocity(targetId: string): Vec3 | null {
    const entry = this.entries.get(targetId);
    if (!entry || entry.mode !== 'dynamic' || this.disposed) return null;
    const v = entry.body.linvel();
    return [v.x, v.y, v.z];
  }

  hasDynamicBody(targetId: string): boolean {
    return this.entries.get(targetId)?.mode === 'dynamic';
  }

  setGravity(gravity: Vec3): void {
    if (this.disposed) return;
    this.world.gravity = { x: gravity[0], y: gravity[1], z: gravity[2] };
  }

  /**
   * Overlap test between two objects using the engine's shape query. It covers solid contacts,
   * sensors and sensor-to-sensor overlaps (which Rapier's contact pairs do not report).
   * Results reflect the most recent physics step.
   */
  touching(aId: string, bId: string): boolean {
    if (this.disposed || aId === bId) return false;
    const a = this.entries.get(aId);
    const b = this.entries.get(bId);
    if (!a || !b) return false;
    const t = b.collider.translation();
    const r = b.collider.rotation();
    let hit = false;
    this.world.intersectionsWithShape(
      { x: t.x, y: t.y, z: t.z },
      { x: r.x, y: r.y, z: r.z, w: r.w },
      b.collider.shape,
      (other) => {
        if (other.handle === a.collider.handle) hit = true;
        return !hit;
      },
      undefined,
      undefined,
      b.collider,
    );
    return hit;
  }

  touchingAny(aId: string): boolean {
    for (const id of this.entries.keys()) {
      if (id !== aId && this.touching(aId, id)) return true;
    }
    return false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.world.free();
    this.entries.clear();
  }
}
