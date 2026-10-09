/**
 * Physics bridge between the play-mode runtime and Rapier (compat build, WASM inlined, no network).
 *
 * Only top-level objects with a body type other than "none" and with a geometry kind get a body.
 * Dynamic bodies are simulated and their poses are written back to the object each frame. Static and
 * kinematic bodies are authored/script-driven: scripts push their poses. Scripted writes to dynamic
 * bodies teleport them and keep their velocity.
 */
import RAPIER, { type Collider, type RigidBody, type World } from '@dimforge/rapier3d-compat';
import { eulerDegToQuaternion, quaternionToEulerDeg } from '../model/transform';
import type { BodyType, ColliderShape, ObjectKind, SceneObject, Vec3 } from '../model/types';
import { UNIT_HALF_EXTENTS } from '../runtime/geometry';
import type { PhysicsPort, RuntimeTarget } from '../runtime/types';

/** Fixed simulation step. Real frames are split into whole steps with an accumulator. */
export const PHYSICS_STEP = 1 / 60;
const MAX_SUBSTEPS = 4;
const BODY_KINDS = new Set<ObjectKind>(['cube', 'sphere', 'cylinder', 'plane']);

interface BodyRecord {
  body: RigidBody;
  collider: Collider;
  type: BodyType;
  signature: string;
}

let initPromise: Promise<void> | null = null;

/** Loads the Rapier WASM module once. */
export function initRapier(): Promise<void> {
  initPromise ??= RAPIER.init();
  return initPromise;
}

/** Whether an object gets a physics body at all. */
export function needsBody(o: SceneObject): boolean {
  return o.parentId === null && o.physics.bodyType !== 'none' && BODY_KINDS.has(o.kind);
}

function resolvedShape(o: SceneObject): Exclude<ColliderShape, 'auto'> {
  if (o.physics.shape !== 'auto') return o.physics.shape;
  if (o.kind === 'sphere') return 'sphere';
  if (o.kind === 'cylinder') return 'cylinder';
  return 'box';
}

function signatureOf(o: SceneObject): string {
  const p = o.physics;
  return [o.kind, p.bodyType, resolvedShape(o), p.mass, p.friction, p.restitution, p.gravityScale, p.lockRotation, o.transform.scale.join(',')].join('|');
}

export class RapierPhysics implements PhysicsPort {
  private readonly world: World;
  private readonly records = new Map<string, BodyRecord>();
  private accumulator = 0;
  private disposed = false;

  private constructor(gravity: Vec3) {
    this.world = new RAPIER.World({ x: gravity[0], y: gravity[1], z: gravity[2] });
  }

  /** Creates a world after the WASM module has loaded. */
  static async create(gravity: Vec3): Promise<RapierPhysics> {
    await initRapier();
    return new RapierPhysics(gravity);
  }

  get bodyCount(): number {
    return this.records.size;
  }

  setGravity(gravity: Vec3): void {
    this.world.gravity = { x: gravity[0], y: gravity[1], z: gravity[2] };
  }

  syncFromScripts(targets: Iterable<RuntimeTarget>): void {
    this.assertLive();
    const alive = new Set<string>();
    for (const t of targets) {
      const o = t.object;
      if (!o) continue;
      if (!needsBody(o)) {
        this.remove(o.id);
        t.pendingImpulse = null;
        t.pendingVelocity = null;
        t.poseDirty = false;
        continue;
      }
      alive.add(o.id);
      const sig = signatureOf(o);
      let rec = this.records.get(o.id);
      if (!rec || rec.signature !== sig) {
        this.remove(o.id);
        rec = this.create(o);
        t.poseDirty = true;
      }
      if (t.poseDirty) {
        this.pushPose(rec, o);
        t.poseDirty = false;
      }
      if (t.pendingImpulse) {
        const v = t.pendingImpulse;
        if (rec.type === 'dynamic') rec.body.applyImpulse({ x: v[0], y: v[1], z: v[2] }, true);
        t.pendingImpulse = null;
      }
      if (t.pendingVelocity) {
        const v = t.pendingVelocity;
        if (rec.type === 'dynamic') rec.body.setLinvel({ x: v[0], y: v[1], z: v[2] }, true);
        t.pendingVelocity = null;
      }
    }
    for (const id of [...this.records.keys()]) if (!alive.has(id)) this.remove(id);
  }

  step(dt: number): void {
    this.assertLive();
    if (!(dt > 0)) return;
    this.accumulator = Math.min(this.accumulator + dt, PHYSICS_STEP * MAX_SUBSTEPS);
    let steps = 0;
    while (this.accumulator >= PHYSICS_STEP - 1e-9 && steps < MAX_SUBSTEPS) {
      this.world.timestep = PHYSICS_STEP;
      this.world.step();
      this.accumulator -= PHYSICS_STEP;
      steps++;
    }
    if (steps === MAX_SUBSTEPS) this.accumulator = 0;
  }

  syncToScripts(targets: Iterable<RuntimeTarget>): void {
    this.assertLive();
    for (const t of targets) {
      const o = t.object;
      if (!o) continue;
      const rec = this.records.get(o.id);
      if (!rec || rec.type !== 'dynamic') continue;
      const tr = rec.body.translation();
      const rot = rec.body.rotation();
      o.transform.position = [tr.x, tr.y, tr.z];
      o.transform.rotation = quaternionToEulerDeg(rot);
    }
  }

  isInContact(a: RuntimeTarget, b: RuntimeTarget): boolean | null {
    if (!a.object || !b.object) return null;
    const ra = this.records.get(a.object.id);
    const rb = this.records.get(b.object.id);
    if (!ra || !rb) return null;
    let touching = false;
    this.world.contactPair(ra.collider, rb.collider, (manifold) => {
      if (manifold.numContacts() > 0) touching = true;
    });
    return touching;
  }

  linearVelocity(t: RuntimeTarget): Vec3 | null {
    if (!t.object) return null;
    const rec = this.records.get(t.object.id);
    if (!rec) return null;
    if (rec.type !== 'dynamic') return [0, 0, 0];
    const v = rec.body.linvel();
    return [v.x, v.y, v.z];
  }

  dispose(): void {
    if (this.disposed) return;
    this.records.clear();
    this.world.free();
    this.disposed = true;
  }

  private assertLive(): void {
    if (this.disposed) throw new Error('Physics world has been disposed');
  }

  private remove(id: string): void {
    const rec = this.records.get(id);
    if (!rec) return;
    this.world.removeRigidBody(rec.body);
    this.records.delete(id);
  }

  private create(o: SceneObject): BodyRecord {
    const type = o.physics.bodyType;
    const p = o.transform.position;
    const q = eulerDegToQuaternion(o.transform.rotation);
    let desc: RAPIER.RigidBodyDesc;
    if (type === 'dynamic') desc = RAPIER.RigidBodyDesc.dynamic();
    else if (type === 'kinematic') desc = RAPIER.RigidBodyDesc.kinematicPositionBased();
    else desc = RAPIER.RigidBodyDesc.fixed();
    desc.setTranslation(p[0], p[1], p[2]).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    if (type === 'dynamic') {
      desc.setGravityScale(o.physics.gravityScale);
      if (o.physics.lockRotation) desc.lockRotations();
    }
    const body = this.world.createRigidBody(desc);

    const s = o.transform.scale.map((c) => Math.max(0.01, Math.abs(c))) as Vec3;
    const shape = resolvedShape(o);
    const unit = UNIT_HALF_EXTENTS[o.kind] ?? [0.5, 0.5, 0.5];
    let cdesc: RAPIER.ColliderDesc;
    if (shape === 'sphere') {
      cdesc = RAPIER.ColliderDesc.ball(0.5 * ((s[0] + s[1] + s[2]) / 3));
    } else if (shape === 'cylinder') {
      cdesc = RAPIER.ColliderDesc.cylinder(0.5 * s[1], 0.5 * ((s[0] + s[2]) / 2));
    } else {
      cdesc = RAPIER.ColliderDesc.cuboid(unit[0] * s[0], unit[1] * s[1], unit[2] * s[2]);
    }
    cdesc.setFriction(o.physics.friction).setRestitution(o.physics.restitution);
    if (type === 'dynamic') cdesc.setMass(Math.max(0.001, o.physics.mass));
    const collider = this.world.createCollider(cdesc, body);
    const rec: BodyRecord = { body, collider, type, signature: signatureOf(o) };
    this.records.set(o.id, rec);
    return rec;
  }

  private pushPose(rec: BodyRecord, o: SceneObject): void {
    const p = o.transform.position;
    const q = eulerDegToQuaternion(o.transform.rotation);
    const rot = { x: q.x, y: q.y, z: q.z, w: q.w };
    if (rec.type === 'kinematic') {
      rec.body.setNextKinematicTranslation({ x: p[0], y: p[1], z: p[2] });
      rec.body.setNextKinematicRotation(rot);
    } else {
      rec.body.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
      rec.body.setRotation(rot, true);
    }
  }
}
