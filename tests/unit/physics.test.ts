import { describe, it, expect } from 'vitest';
import { createEmptyProject, createSceneObject } from '../../src/core/project';
import { buildLiveTargets } from '../../src/runtime/model';
import { SceneState } from '../../src/runtime/sceneState';
import { PhysicsWorld, physicsWarnings } from '../../src/physics/physicsWorld';
import type { Project } from '../../src/core/project';

function makeProject(objects: Array<{ id: string; kind: 'cube' | 'sphere' | 'plane'; mode: 'none' | 'static' | 'dynamic' | 'kinematic'; pos?: [number, number, number]; scale?: [number, number, number] }>): Project {
  const project = createEmptyProject({ id: 'p', name: 'P', now: new Date(0) });
  for (const o of objects) {
    const obj = createSceneObject({ id: o.id, name: o.id, kind: o.kind });
    obj.transform.position = o.pos ?? [0, 0, 0];
    if (o.scale) obj.transform.scale = o.scale;
    obj.physics.mode = o.mode;
    project.objects.push(obj);
  }
  return project;
}

async function world(project: Project) {
  const scene = new SceneState();
  scene.replaceAll(buildLiveTargets(project));
  const physics = await PhysicsWorld.create(project, scene);
  return { scene, physics };
}

function run(scene: SceneState, physics: PhysicsWorld, seconds: number) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) {
    physics.syncFromProgram(scene);
    physics.step(scene);
  }
}

describe('physics: gravity, ground and collisions', () => {
  it('a dynamic cube falls under gravity and rests on a static ground plane', async () => {
    const project = makeProject([
      { id: 'ground', kind: 'plane', mode: 'static', scale: [20, 1, 20] },
      { id: 'box', kind: 'cube', mode: 'dynamic', pos: [0, 5, 0] },
    ]);
    const { scene, physics } = await world(project);
    expect(scene.get('box')!.position[1]).toBe(5);
    run(scene, physics, 0.2);
    const midFall = scene.get('box')!.position[1];
    expect(midFall).toBeLessThan(5);
    expect(midFall).toBeGreaterThan(0.5);
    run(scene, physics, 3);
    // Cube half-size is 0.5 and the ground top is at y = 0, so the resting centre is y = 0.5.
    // Measured: the steady rest height is about 0.495 m (about 5 mm of contact penetration, Rapier's default
    // allowed linear error). It does not drift over 10 s. Bound it tightly instead of using a loose tolerance.
    expect(scene.get('box')!.position[1]).toBeGreaterThan(0.49);
    expect(scene.get('box')!.position[1]).toBeLessThan(0.5);
    expect(physics.getVelocity('box')![1]).toBeCloseTo(0, 1);
    physics.dispose();
  });

  it('a falling sphere lands on a dynamic cube and both respond (collision response)', async () => {
    const project = makeProject([
      { id: 'ground', kind: 'plane', mode: 'static', scale: [20, 1, 20] },
      { id: 'base', kind: 'cube', mode: 'dynamic', pos: [0, 0.5, 0], scale: [2, 1, 2] },
      { id: 'ball', kind: 'sphere', mode: 'dynamic', pos: [0, 4, 0] },
    ]);
    const { scene, physics } = await world(project);
    run(scene, physics, 4);
    const ball = scene.get('ball')!.position[1];
    expect(ball).toBeGreaterThan(1.2);
    expect(ball).toBeLessThan(2.2);
    expect(physics.touching('ball', 'base')).toBe(true);
    physics.dispose();
  });

  it('a kinematic body moves the program pose and pushes a dynamic body', async () => {
    const project = makeProject([
      { id: 'ground', kind: 'plane', mode: 'static', scale: [20, 1, 20] },
      { id: 'pusher', kind: 'cube', mode: 'kinematic', pos: [-3, 0.5, 0], scale: [1, 1, 3] },
      { id: 'crate', kind: 'cube', mode: 'dynamic', pos: [0, 0.5, 0] },
    ]);
    const { scene, physics } = await world(project);
    run(scene, physics, 0.1);
    for (let i = 0; i < 120; i += 1) {
      const x = -3 + i * 0.05;
      scene.setPose('pusher', { position: [x, 0.5, 0] });
      physics.syncFromProgram(scene);
      physics.step(scene);
    }
    expect(scene.get('pusher')!.position[0]).toBeCloseTo(3, 1);
    expect(scene.get('crate')!.position[0]).toBeGreaterThan(0.5);
    physics.dispose();
  });

  it('program teleports are authoritative and do not fight the simulation', async () => {
    const project = makeProject([
      { id: 'ground', kind: 'plane', mode: 'static', scale: [20, 1, 20] },
      { id: 'box', kind: 'cube', mode: 'dynamic', pos: [0, 0.5, 0] },
    ]);
    const { scene, physics } = await world(project);
    run(scene, physics, 0.5);
    scene.setPose('box', { position: [0, 10, 0] });
    physics.syncFromProgram(scene);
    expect(scene.get('box')!.dirty).toBe(false);
    run(scene, physics, 0.1);
    // Still above the ground: the teleport was applied and gravity continues from there.
    expect(scene.get('box')!.position[1]).toBeGreaterThan(9.5);
    physics.dispose();
  });

  it('objects with mode none are still detected by touching (sensor), but do not collide', async () => {
    const project = makeProject([
      { id: 'ghost', kind: 'cube', mode: 'none', pos: [0, 0.5, 0] },
      { id: 'far', kind: 'cube', mode: 'none', pos: [10, 0.5, 0] },
      { id: 'faller', kind: 'sphere', mode: 'dynamic', pos: [0, 3, 0] },
    ]);
    const { scene, physics } = await world(project);
    // Place the sphere inside the ghost and freeze gravity: it must overlap without being pushed.
    physics.setGravity([0, 0, 0]);
    scene.setPose('faller', { position: [0, 0.5, 0] });
    physics.syncFromProgram(scene);
    run(scene, physics, 0.1);
    expect(scene.get('faller')!.position[1]).toBeCloseTo(0.5, 2);
    expect(physics.touching('faller', 'ghost')).toBe(true);
    expect(physics.touching('ghost', 'faller')).toBe(true);
    // Moving it outside the ghost ends the overlap (sensors do not push, so it stays put).
    scene.setPose('faller', { position: [0, 5, 0] });
    physics.syncFromProgram(scene);
    run(scene, physics, 0.05);
    expect(physics.touching('faller', 'ghost')).toBe(false);
    // Without gravity a sphere inside a sensor cube is not pushed out: no physical response.
    expect(scene.get('ghost')!.position[1]).toBeCloseTo(0.5, 5);
    expect(physics.touching('ghost', 'far')).toBe(false);
    expect(physics.touchingAny('far')).toBe(false);
    physics.dispose();
  });

  it('impulses and velocities act only on dynamic bodies', async () => {
    const project = makeProject([
      { id: 'box', kind: 'cube', mode: 'dynamic', pos: [0, 10, 0] },
      { id: 'fixed', kind: 'cube', mode: 'static', pos: [5, 0, 0] },
    ]);
    const { scene, physics } = await world(project);
    physics.setGravity([0, 0, 0]);
    expect(physics.applyImpulse('box', [2, 0, 0])).toBe(true);
    expect(physics.applyImpulse('fixed', [2, 0, 0])).toBe(false);
    expect(physics.getVelocity('box')![0]).toBeCloseTo(2, 3);
    expect(physics.getVelocity('fixed')).toBeNull();
    expect(physics.setVelocity('fixed', [0, 1, 0])).toBe(false);
    expect(physics.setVelocity('box', [0, 0, 1])).toBe(true);
    run(scene, physics, 0.5);
    // Velocity is applied in metres per second: 1 m/s along +Z for 0.5 s moves the box 0.5 m.
    expect(scene.get('box')!.position[2]).toBeCloseTo(0.5, 1);
    expect(scene.get('box')!.position[1]).toBeCloseTo(10, 2);
    physics.dispose();
  });

  it('non-uniform scale uses a hull collider and still rests on the ground', async () => {
    const project = makeProject([
      { id: 'ground', kind: 'plane', mode: 'static', scale: [20, 1, 20] },
      { id: 'slab', kind: 'cube', mode: 'dynamic', pos: [0, 3, 0], scale: [3, 0.5, 1] },
    ]);
    const { scene, physics } = await world(project);
    run(scene, physics, 3);
    expect(Math.abs(scene.get('slab')!.position[1] - 0.25)).toBeLessThan(0.05);
    physics.dispose();
  });

  it('a scale change during a run rebuilds the collider at the new size', async () => {
    const project = makeProject([
      { id: 'ground', kind: 'plane', mode: 'static', scale: [20, 1, 20] },
      { id: 'box', kind: 'cube', mode: 'dynamic', pos: [0, 0.5, 0] },
    ]);
    const { scene, physics } = await world(project);
    run(scene, physics, 0.5);
    scene.setPose('box', { scale: [2, 2, 2] });
    physics.syncFromProgram(scene);
    run(scene, physics, 4);
    // A 2 m cube rests with its centre at y = 1 on the ground (within the soft-contact tolerance).
    expect(Math.abs(scene.get('box')!.position[1] - 1)).toBeLessThan(0.05);
    physics.dispose();
  });

  it('physics settings produce warnings for children and for shapeless kinds', () => {
    const project = makeProject([{ id: 'a', kind: 'cube', mode: 'dynamic' }]);
    project.objects.push({ ...createSceneObject({ id: 'child', name: 'Child', kind: 'cube', parentId: 'a' }), physics: { mode: 'dynamic', mass: 1, friction: 0.5, restitution: 0 } });
    const group = createSceneObject({ id: 'g', name: 'G', kind: 'group' });
    group.physics.mode = 'dynamic';
    project.objects.push(group);
    const warnings = physicsWarnings(project);
    expect(warnings.some((w) => w.includes('"Child"'))).toBe(true);
    expect(warnings.some((w) => w.includes('"G"'))).toBe(true);
  });
});
