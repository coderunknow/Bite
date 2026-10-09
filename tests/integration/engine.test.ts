import { describe, it, expect } from 'vitest';
import { Engine, MAX_FRAME_SECONDS, MAX_STEPS_PER_FRAME } from '../../src/engine/engine';
import { createEmptyProject, createSceneObject, type Project } from '../../src/core/project';
import { createStarterProject } from '../../src/core/templates';
import { blk, workspace } from '../helpers/scripts';
import { FakeAudio } from '../helpers/fakes';

/** One cube whose flag script moves it 2 m along +X, then the program waits. */
function movingProject(extra?: (p: Project) => void): Project {
  const project = createEmptyProject({ id: 'p', name: 'P', now: new Date(0) });
  const cube = createSceneObject({ id: 'cube', name: 'Cube', kind: 'cube' });
  cube.transform.position = [0, 0, 0];
  cube.scripts = workspace([blk('event_whenflagclicked'), blk('motion_changeposition', { fields: { AXIS: 'x' }, values: { DELTA: 2 } })]) as typeof cube.scripts;
  project.objects.push(cube);
  extra?.(project);
  return project;
}

const x = (engine: Engine) => engine.scene.get('cube')!.position[0];

describe('engine: run, stop, reset', () => {
  it('run starts the program; the flag script moves the object on the first step', async () => {
    const engine = new Engine(new FakeAudio());
    const project = movingProject();
    expect(engine.state).toBe('idle');
    await engine.run(project);
    expect(engine.state).toBe('running');
    engine.advance(1 / 60);
    expect(engine.lastStepCount).toBe(1);
    expect(x(engine)).toBeCloseTo(2, 6);
    engine.stop();
  });

  it('advance caps long frames and limits the number of steps per frame', async () => {
    const engine = new Engine(new FakeAudio());
    await engine.run(movingProject());
    engine.advance(1); // a 1 s hitch is clamped to MAX_FRAME_SECONDS
    expect(engine.lastStepCount).toBe(Math.round(MAX_FRAME_SECONDS * 60));
    expect(MAX_STEPS_PER_FRAME).toBeGreaterThanOrEqual(engine.lastStepCount);
    engine.stop();
  });

  it('stop ends the program and keeps the live state (state becomes stopped)', async () => {
    const audio = new FakeAudio();
    const engine = new Engine(audio);
    await engine.run(movingProject());
    engine.advance(1 / 60);
    engine.stop();
    expect(engine.state).toBe('stopped');
    expect(x(engine)).toBeCloseTo(2, 6);
    expect(audio.stopAllCalls).toBeGreaterThan(0);
    engine.advance(1); // no effect after stop
    expect(x(engine)).toBeCloseTo(2, 6);
  });

  it('reset restores the authored layout and sets the state to idle', async () => {
    const engine = new Engine(new FakeAudio());
    const project = movingProject();
    await engine.run(project);
    engine.advance(1 / 60);
    engine.reset(project);
    expect(engine.state).toBe('idle');
    expect(x(engine)).toBe(0);
    expect(engine.logs).toHaveLength(0);
  });

  it('a second run starts from the authored layout, not from the previous run', async () => {
    const engine = new Engine(new FakeAudio());
    const project = movingProject();
    await engine.run(project);
    engine.advance(1 / 60);
    engine.stop();
    await engine.run(project);
    expect(x(engine)).toBe(0);
    engine.stop();
  });

  it('syncObject updates one object while stopped and leaves the others alone', async () => {
    const engine = new Engine(new FakeAudio());
    const project = movingProject((p) => {
      const other = createSceneObject({ id: 'other', name: 'Other', kind: 'cube' });
      other.transform.position = [5, 0, 0];
      p.objects.push(other);
    });
    engine.reset(project);
    engine.scene.setPose('other', { position: [9, 9, 9] });
    project.objects[0]!.transform.position = [-4, 1, 0];
    engine.syncObject(project, 'cube');
    expect(engine.scene.get('cube')!.position).toEqual([-4, 1, 0]);
    expect(engine.scene.get('other')!.position).toEqual([9, 9, 9]);
  });

  it('a script error is reported in the log with the block id, and the run keeps going', async () => {
    const engine = new Engine(new FakeAudio());
    const project = createEmptyProject({ id: 'p', name: 'P', now: new Date(0) });
    const cube = createSceneObject({ id: 'cube', name: 'Cube', kind: 'cube' });
    cube.scripts = workspace([blk('event_whenflagclicked'), blk('sound_play', { fields: { SOUND: '' } })]) as typeof cube.scripts;
    project.objects.push(cube);
    await engine.run(project);
    engine.advance(1 / 60);
    const errors = engine.logs.filter((l) => l.level === 'error' || l.level === 'warn');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.targetId).toBe('cube');
    expect(errors[0]!.blockId).toBeTruthy();
    engine.stop();
  });

  it('an unsupported block is reported as an error on that block, not ignored', async () => {
    const engine = new Engine(new FakeAudio());
    const project = createEmptyProject({ id: 'p', name: 'P', now: new Date(0) });
    const cube = createSceneObject({ id: 'cube', name: 'Cube', kind: 'cube' });
    cube.scripts = workspace([blk('event_whenflagclicked'), blk('motion_doesnotexist')]) as typeof cube.scripts;
    project.objects.push(cube);
    await engine.run(project);
    engine.advance(1 / 60);
    const message = engine.logs.find((l) => l.level === 'error');
    expect(message?.message).toContain('motion_doesnotexist');
    expect(message?.targetId).toBe('cube');
    engine.stop();
  });

  it('a stopped run leaves no physics bodies behind (dispose)', async () => {
    const engine = new Engine(new FakeAudio());
    await engine.run(movingProject());
    expect(engine.physicsBodyCount).toBeGreaterThanOrEqual(0);
    engine.stop();
    expect(engine.physicsBodyCount).toBe(0);
  });
});

describe('starter project through the engine', () => {
  const starter = () => createStarterProject({ id: 's', name: 'Starter', now: new Date(0), soundAssetId: 'asset-chime' });

  it('the Ball lands on the Bouncer and plays Chime when it touches it', async () => {
    const audio = new FakeAudio();
    const engine = new Engine(audio);
    const project = starter();
    await engine.run(project);
    const ballId = project.objects.find((o) => o.name === 'Ball')!.id;
    const bouncerId = project.objects.find((o) => o.name === 'Bouncer')!.id;
    const chime = project.sounds[0]!.id;
    let landedOnBouncer = false;
    for (let i = 0; i < 60 * 2; i += 1) {
      engine.advance(1 / 60);
      const ball = engine.scene.get(ballId)!;
      const bouncer = engine.scene.get(bouncerId)!;
      // The Bouncer is on the floor (top at about 1 m). A ball resting on it sits near y = 1.5.
      if (ball.position[1] > 1.3 && ball.position[1] < 1.8 && Math.abs(ball.position[0] - bouncer.position[0]) < 1) landedOnBouncer = true;
    }
    expect(landedOnBouncer).toBe(true);
    expect(audio.played.filter((p) => p.soundId === chime).length).toBeGreaterThanOrEqual(1);
    expect(engine.logs.filter((l) => l.level === 'error')).toHaveLength(0);
    engine.stop();
  });
});
