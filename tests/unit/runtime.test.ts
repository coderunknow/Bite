import { describe, expect, it } from 'vitest';
import { createEmptyProject, type Project } from '../../src/core/project';
import { addObject, addVariable, addMessage, addSound } from '../../src/core/sceneOps';
import { buildHats, buildLiveTargets, buildRuntimeModel } from '../../src/runtime/model';
import { Runtime } from '../../src/runtime/runtime';
import { SceneState } from '../../src/runtime/sceneState';
import type { LogEntry } from '../../src/runtime/types';
import { FakeAudio } from '../helpers/fakes';
import { blk, num, txt, workspace, chain } from '../helpers/scripts';
import type { ScriptsJSON } from '../../src/core/types';

const DT = 1 / 60;

interface Fixture {
  project: Project;
  scene: SceneState;
  runtime: Runtime;
  logs: LogEntry[];
  audio: FakeAudio;
  objectId: (name: string) => string;
  run: (ticks: number) => void;
}

/**
 * Builds a project with the given objects (name → scripts), then a runtime for it.
 * The physics host is null here; physics behavior is tested in physics.test.ts.
 */
type ScriptSource = ScriptsJSON | ((ids: Record<string, string>) => ScriptsJSON);

function setup(config: {
  objects?: Array<{ name: string; kind?: 'cube' | 'sphere' | 'group'; scripts?: ScriptSource; position?: [number, number, number]; rotation?: [number, number, number] }>;
  stageScripts?: ScriptSource;
  /** Runs after the objects exist and before scripts are built, so scripts can reference new variables. */
  setupProject?: (project: Project, ids: Record<string, string>) => void;
  sounds?: string[];
}): Fixture {
  const project = createEmptyProject({ id: 'p1', name: 'Test', now: new Date(0) });
  const ids: Record<string, string> = {};
  for (const o of config.objects ?? []) {
    const obj = addObject(project, o.kind ?? 'cube', { name: o.name });
    ids[o.name] = obj.id;
    obj.transform.position = o.position ?? [0, 0, 0];
    if (o.rotation) obj.transform.rotation = o.rotation;
  }
  config.setupProject?.(project, ids);
  for (const o of config.objects ?? []) {
    if (o.scripts) {
      const obj = project.objects.find((x) => x.id === ids[o.name])!;
      obj.scripts = (typeof o.scripts === 'function' ? o.scripts(ids) : o.scripts) as typeof obj.scripts;
    }
  }
  if (config.stageScripts) {
    project.stage.scripts = (typeof config.stageScripts === 'function' ? config.stageScripts(ids) : config.stageScripts) as typeof project.stage.scripts;
  }
  const scene = new SceneState();
  scene.replaceAll(buildLiveTargets(project));
  const logs: LogEntry[] = [];
  const audio = new FakeAudio();
  for (const s of config.sounds ?? []) audio.sounds.add(s);
  const runtime = new Runtime({
    model: buildRuntimeModel(project),
    hats: buildHats(project),
    scene,
    audio,
    physics: null,
    rng: (() => {
      let seed = 42;
      return () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
    })(),
    onLog: (e) => logs.push(e),
  });
  return {
    project,
    scene,
    runtime,
    logs,
    audio,
    objectId: (name: string) => {
      const id = ids[name];
      if (!id) throw new Error(`no object ${name}`);
      return id;
    },
    run: (ticks: number) => {
      for (let i = 0; i < ticks; i += 1) runtime.tick(DT);
    },
  };
}

const flag = () => blk('event_whenflagclicked');

describe('runtime: motion', () => {
  it('a Start event followed by a move block changes the object position (forward is -Z at rotation 0)', () => {
    const f = setup({
      objects: [{ name: 'Cube', scripts: workspace([flag(), blk('motion_moveforward', { values: { STEPS: 5 } })]) }],
    });
    f.runtime.start();
    f.run(2);
    const cube = f.scene.get(f.objectId('Cube'))!;
    expect(cube.position[0]).toBeCloseTo(0);
    expect(cube.position[2]).toBeCloseTo(-5);
    expect(f.logs).toHaveLength(0);
  });

  it('move forward follows the object orientation in 3D (yaw 90 faces -X)', () => {
    const f = setup({
      objects: [{ name: 'Cube', rotation: [0, 90, 0], scripts: workspace([flag(), blk('motion_moveforward', { values: { STEPS: 2 } })]) }],
    });
    f.runtime.start();
    f.run(1);
    const cube = f.scene.get(f.objectId('Cube'))!;
    expect(cube.position[0]).toBeCloseTo(-2);
    expect(cube.position[2]).toBeCloseTo(0, 6);
  });

  it('turn right is clockwise from above (yaw decreases) and turn left increases yaw', () => {
    const f = setup({
      objects: [
        { name: 'R', scripts: workspace([flag(), blk('motion_turnright', { values: { DEGREES: 90 } })]) },
        { name: 'L', scripts: workspace([flag(), blk('motion_turnleft', { values: { DEGREES: 90 } })]) },
      ],
    });
    f.runtime.start();
    f.run(1);
    expect(f.scene.get(f.objectId('R'))!.rotation[1]).toBeCloseTo(-90);
    expect(f.scene.get(f.objectId('L'))!.rotation[1]).toBeCloseTo(90);
  });

  it('set and change position/rotation on each axis', () => {
    const f = setup({
      objects: [
        {
          name: 'Cube',
          scripts: workspace([
            flag(),
            blk('motion_setposition', { fields: { AXIS: 'x' }, values: { VALUE: 3 } }),
            blk('motion_changeposition', { fields: { AXIS: 'y' }, values: { DELTA: 2 } }),
            blk('motion_setposition', { fields: { AXIS: 'z' }, values: { VALUE: -4 } }),
            blk('motion_setrotation', { fields: { AXIS: 'x' }, values: { VALUE: 30 } }),
            blk('motion_changerotation', { fields: { AXIS: 'z' }, values: { DELTA: 15 } }),
            blk('motion_gotoxyz', { values: { X: 1, Y: 2, Z: 3 } }),
          ]),
        },
      ],
    });
    f.runtime.start();
    f.run(1);
    const cube = f.scene.get(f.objectId('Cube'))!;
    expect(cube.position).toEqual([1, 2, 3]);
    expect(cube.rotation[0]).toBeCloseTo(30);
    expect(cube.rotation[2]).toBeCloseTo(15);
  });

  it('glide interpolates over time and lands exactly on the target', () => {
    const f = setup({
      objects: [{ name: 'Cube', scripts: workspace([flag(), blk('motion_glide', { values: { SECS: 1, X: 10, Y: 0, Z: 0 } })]) }],
    });
    f.runtime.start();
    f.run(30); // half a second
    const mid = f.scene.get(f.objectId('Cube'))!.position[0];
    expect(mid).toBeGreaterThan(4);
    expect(mid).toBeLessThan(6);
    f.run(40);
    expect(f.scene.get(f.objectId('Cube'))!.position[0]).toBe(10);
  });

  it('point towards another object sets the heading toward it', () => {
    const f = setup({
      objects: [
        { name: 'Seeker', position: [0, 0, 0], scripts: (ids) => workspace([flag(), blk('motion_pointtowards', { fields: { TARGET: ids.Goal } })]) },
        { name: 'Goal', position: [10, 0, 0] },
      ],
    });
    f.runtime.start();
    f.runtime.tick(DT);
    // Facing +X means yaw -90 (forward = (-sin(yaw), 0, -cos(yaw)) = (1, 0, 0)).
    expect(f.scene.get(f.objectId('Seeker'))!.rotation[1]).toBeCloseTo(-90);
    expect(f.logs).toHaveLength(0);
  });
});

describe('runtime: control flow', () => {
  it('repeat runs the body the given number of times, one iteration per tick', () => {
    const f = setup({
      objects: [{ name: 'Cube', scripts: workspace([flag(), blk('control_repeat', { values: { TIMES: 4 }, inputs: { SUBSTACK: [blk('motion_changeposition', { fields: { AXIS: 'x' }, values: { DELTA: 1 } })] } })]) }],
    });
    f.runtime.start();
    f.run(1);
    expect(f.scene.get(f.objectId('Cube'))!.position[0]).toBe(1);
    f.run(10);
    expect(f.scene.get(f.objectId('Cube'))!.position[0]).toBe(4);
    expect(f.runtime.activeThreadCount).toBe(0);
  });

  it('if / else chooses the branch from a boolean operator', () => {
    const f = setup({
      objects: [
        {
          name: 'Cube',
          scripts: workspace([
            flag(),
            blk('control_if_else', {
              inputs: {
                CONDITION: blk('operator_gt', { inputs: { OPERAND1: num(5), OPERAND2: num(3) } }),
                SUBSTACK: [blk('motion_changeposition', { fields: { AXIS: 'x' }, values: { DELTA: 1 } })],
                SUBSTACK2: [blk('motion_changeposition', { fields: { AXIS: 'x' }, values: { DELTA: -1 } })],
              },
            }),
          ]),
        },
      ],
    });
    f.runtime.start();
    f.run(2);
    expect(f.scene.get(f.objectId('Cube'))!.position[0]).toBe(1);
  });

  it('wait N seconds delays the next block by about N seconds', () => {
    const f = setup({
      objects: [{ name: 'Cube', scripts: workspace([flag(), blk('control_wait', { values: { SECS: 0.5 } }), blk('motion_changeposition', { fields: { AXIS: 'y' }, values: { DELTA: 1 } })]) }],
    });
    f.runtime.start();
    // 0.5 s at 60 Hz is 30 ticks: after 25 ticks (~0.42 s) the next block must not have run yet.
    f.run(25);
    expect(f.scene.get(f.objectId('Cube'))!.position[1]).toBe(0);
    f.run(10);
    expect(f.scene.get(f.objectId('Cube'))!.position[1]).toBe(1);
    f.run(20);
    expect(f.scene.get(f.objectId('Cube'))!.position[1]).toBe(1);
  });

  it('wait until blocks until the condition becomes true', () => {
    const f = setup({
      objects: [
        { name: 'Cube', scripts: workspace([flag(), blk('control_wait_until', { inputs: { CONDITION: blk('sensing_keypressed', { fields: { KEY: 'space' } }) } }), blk('looks_hide')]) },
      ],
    });
    f.runtime.start();
    f.run(5);
    expect(f.scene.get(f.objectId('Cube'))!.visible).toBe(true);
    f.runtime.pressKey('space');
    f.run(2);
    expect(f.scene.get(f.objectId('Cube'))!.visible).toBe(false);
  });

  it('repeat until stops when the condition holds', () => {
    const f = setup({
      objects: [
        {
          name: 'Cube',
          scripts: workspace([
            flag(),
            blk('control_repeat_until', {
              inputs: {
                CONDITION: blk('operator_gt', { inputs: { OPERAND1: blk('motion_getposition', { fields: { AXIS: 'x' } }), OPERAND2: num(2.5) } }),
                SUBSTACK: [blk('motion_changeposition', { fields: { AXIS: 'x' }, values: { DELTA: 1 } })],
              },
            }),
          ]),
        },
      ],
    });
    f.runtime.start();
    f.run(20);
    expect(f.scene.get(f.objectId('Cube'))!.position[0]).toBe(3);
    expect(f.runtime.activeThreadCount).toBe(0);
  });
});

describe('runtime: stop and responsiveness', () => {
  it('an infinite loop keeps yielding, and halt() stops it immediately', () => {
    const f = setup({
      objects: [{ name: 'Cube', scripts: workspace([flag(), blk('control_forever', { inputs: { SUBSTACK: [blk('motion_changeposition', { fields: { AXIS: 'x' }, values: { DELTA: 1 }})] } })]) }],
    });
    f.runtime.start();
    f.run(100);
    const x = f.scene.get(f.objectId('Cube'))!.position[0];
    expect(x).toBeCloseTo(100, 0);
    f.runtime.halt();
    f.run(100);
    expect(f.scene.get(f.objectId('Cube'))!.position[0]).toBe(x);
    expect(f.runtime.activeThreadCount).toBe(0);
    expect(f.runtime.isRunning).toBe(false);
  });

  it('a forever loop with an empty body still yields each tick (no synchronous hang)', () => {
    const f = setup({ objects: [{ name: 'Cube', scripts: workspace([flag(), blk('control_forever')]) }] });
    f.runtime.start();
    const started = Date.now();
    f.run(5000);
    expect(f.runtime.activeThreadCount).toBe(1);
    expect(Date.now() - started).toBeLessThan(5000);
    f.runtime.halt();
  });

  it('stop this script ends only the current script', () => {
    const f = setup({
      objects: [
        {
          name: 'A',
          scripts: workspace([flag(), blk('control_forever', { inputs: { SUBSTACK: [blk('motion_changeposition', { fields: { AXIS: 'x' }, values: { DELTA: 1 } }), blk('control_stop', { fields: { OPTION: 'this script' } })] } })]),
        },
        {
          name: 'B',
          scripts: workspace([flag(), blk('control_forever', { inputs: { SUBSTACK: [blk('motion_changeposition', { fields: { AXIS: 'y' }, values: { DELTA: 1 } })] } })]),
        },
      ],
    });
    f.runtime.start();
    f.run(30);
    expect(f.scene.get(f.objectId('A'))!.position[0]).toBe(1);
    expect(f.scene.get(f.objectId('B'))!.position[1]).toBeGreaterThan(20);
  });

  it('stop all ends every script and reports to the host', () => {
    let stoppedCallback = 0;
    const f = setup({
      objects: [
        { name: 'A', scripts: workspace([flag(), blk('control_forever', { inputs: { SUBSTACK: [blk('motion_changeposition', { fields: { AXIS: 'x' }, values: { DELTA: 1 } })] } })]) },
        { name: 'B', scripts: workspace([flag(), blk('control_wait', { values: { SECS: 0.1 } }), blk('control_stop', { fields: { OPTION: 'all' } }), blk('motion_changeposition', { fields: { AXIS: 'y' }, values: { DELTA: 1 } })]) },
      ],
    });
    // Reconstruct the runtime with an onStopAll callback.
    const runtime = new Runtime({
      model: buildRuntimeModel(f.project),
      hats: buildHats(f.project),
      scene: f.scene,
      audio: f.audio,
      physics: null,
      onLog: (e) => f.logs.push(e),
      onStopAll: () => {
        stoppedCallback += 1;
      },
    });
    runtime.start();
    for (let i = 0; i < 60; i += 1) runtime.tick(DT);
    expect(stoppedCallback).toBe(1);
    expect(runtime.isRunning).toBe(false);
    expect(f.scene.get(f.objectId('B'))!.position[1]).toBe(0);
    const x = f.scene.get(f.objectId('A'))!.position[0];
    runtime.tick(DT);
    expect(f.scene.get(f.objectId('A'))!.position[0]).toBe(x);
  });
});

describe('runtime: events', () => {
  it('broadcast starts receivers; broadcast and wait waits for them', () => {
    const f = setup({
      setupProject: (project) => {
        addMessage(project, 'go');
      },
      objects: [],
    });
    const msgId = f.project.messages[0].id;
    f.project.objects.length = 0;
    const sender = addObject(f.project, 'cube', { name: 'Sender' });
    const receiver = addObject(f.project, 'cube', { name: 'Receiver' });
    sender.scripts = workspace([
      flag(),
      blk('event_broadcastandwait', { fields: { MESSAGE: msgId } }),
      blk('motion_changeposition', { fields: { AXIS: 'y' }, values: { DELTA: 100 } }),
    ]) as typeof sender.scripts;
    receiver.scripts = workspace([
      blk('event_whenbroadcastreceived', { fields: { MESSAGE: msgId } }),
      blk('control_wait', { values: { SECS: 0.5 } }),
      blk('motion_changeposition', { fields: { AXIS: 'x' }, values: { DELTA: 7 } }),
    ]) as typeof receiver.scripts;
    const scene = new SceneState();
    scene.replaceAll(buildLiveTargets(f.project));
    const runtime = new Runtime({ model: buildRuntimeModel(f.project), hats: buildHats(f.project), scene, audio: f.audio, physics: null, onLog: (e) => f.logs.push(e) });
    runtime.start();
    runtime.tick(DT);
    expect(scene.get(sender.id)!.position[1]).toBe(0.5); // not yet: waiting for receiver
    for (let i = 0; i < 60; i += 1) runtime.tick(DT);
    expect(scene.get(receiver.id)!.position[0]).toBe(7);
    expect(scene.get(sender.id)!.position[1]).toBe(100.5);
  });

  it('when key pressed starts scripts on key down (and "any key" matches all keys)', () => {
    const f = setup({
      objects: [
        { name: 'Space', scripts: workspace([blk('event_whenkeypressed', { fields: { KEY: 'space' } }), blk('motion_changeposition', { fields: { AXIS: 'x' }, values: { DELTA: 1 } })]) },
        { name: 'Any', scripts: workspace([blk('event_whenkeypressed', { fields: { KEY: 'any key' } }), blk('motion_changeposition', { fields: { AXIS: 'y' }, values: { DELTA: 1 } })]) },
      ],
    });
    f.runtime.start();
    f.run(2);
    expect(f.scene.get(f.objectId('Space'))!.position[0]).toBe(0);
    f.runtime.pressKey('a');
    f.run(2);
    expect(f.scene.get(f.objectId('Any'))!.position[1]).toBe(1);
    expect(f.scene.get(f.objectId('Space'))!.position[0]).toBe(0);
    f.runtime.releaseKey('a');
    f.runtime.pressKey('space');
    f.run(2);
    expect(f.scene.get(f.objectId('Space'))!.position[0]).toBe(1);
  });

  it('sensing keypressed reports the held state; repeated presses do not retrigger hats', () => {
    const f = setup({
      objects: [
        { name: 'Cube', scripts: workspace([flag(), blk('control_wait_until', { inputs: { CONDITION: blk('sensing_keypressed', { fields: { KEY: 'up arrow' } }) } }), blk('motion_changeposition', { fields: { AXIS: 'z' }, values: { DELTA: 1 } })]) },
      ],
    });
    f.runtime.start();
    f.run(3);
    f.runtime.pressKey('up arrow');
    f.runtime.pressKey('up arrow');
    f.run(3);
    expect(f.scene.get(f.objectId('Cube'))!.position[2]).toBe(1);
  });

  it('clicking an object starts its "when this object clicked" scripts', () => {
    const f = setup({
      objects: [{ name: 'Button', scripts: workspace([blk('event_whenthisspriteclicked'), blk('looks_hide')]) }],
    });
    f.runtime.start();
    f.run(1);
    expect(f.scene.get(f.objectId('Button'))!.visible).toBe(true);
    f.runtime.clickTarget(f.objectId('Button'));
    f.run(1);
    expect(f.scene.get(f.objectId('Button'))!.visible).toBe(false);
  });
});

describe('runtime: variables and scope', () => {
  it('global variables are shared; local variables belong to one object', () => {
    let globalId = '';
    let localId = '';
    const f = setup({
      objects: [
        {
          name: 'A',
          scripts: () =>
            workspace([
              flag(),
              blk('data_changevariableby', { fields: { VAR: globalId }, values: { VALUE: 2 } }),
              blk('data_setvariableto', { fields: { VAR: localId }, values: { VALUE: 9 } }),
            ]),
        },
        { name: 'B', scripts: () => workspace([flag(), blk('data_changevariableby', { fields: { VAR: globalId }, values: { VALUE: 3 } })]) },
      ],
      setupProject: (project, ids) => {
        globalId = addVariable(project, { name: 'score', scope: 'global', ownerId: null, value: 1 }).id;
        localId = addVariable(project, { name: 'mine', scope: 'local', ownerId: ids.A, value: 0 }).id;
      },
    });
    f.runtime.start();
    f.run(2);
    expect(f.runtime.readVariable(globalId, null)).toBe(6);
    expect(f.runtime.readVariable(localId, f.scene.get(f.objectId('A'))!)).toBe(9);
    expect(() => f.runtime.readVariable(localId, f.scene.get(f.objectId('B'))!)).toThrow(/belongs to another object/);
  });

  it('a script that reads an unavailable local variable reports an error and stops; other scripts keep running', () => {
    let localId = '';
    const f = setup({
      objects: [
        { name: 'A', scripts: workspace([flag(), blk('motion_changeposition', { fields: { AXIS: 'x' }, values: { DELTA: 1 } })]) },
        { name: 'B', scripts: () => workspace([flag(), blk('data_setvariableto', { fields: { VAR: localId }, values: { VALUE: 1 } }), blk('motion_changeposition', { fields: { AXIS: 'x' }, values: { DELTA: 100 } })]) },
        { name: 'Walker', scripts: workspace([flag(), blk('control_forever', { inputs: { SUBSTACK: [blk('motion_changeposition', { fields: { AXIS: 'y' }, values: { DELTA: 1 } })] } })]) },
      ],
      setupProject: (project, ids) => {
        localId = addVariable(project, { name: 'secret', scope: 'local', ownerId: ids.A, value: 0 }).id;
      },
    });
    f.runtime.start();
    f.run(3);
    const errors = f.logs.filter((l) => l.level === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/belongs to another object/);
    expect(errors[0].targetId).toBe(f.objectId('B'));
    expect(errors[0].blockId).toBeDefined();
    expect(f.scene.get(f.objectId('B'))!.position[0]).toBe(0);
    expect(f.scene.get(f.objectId('Walker'))!.position[1]).toBeGreaterThan(2);
  });
});

describe('runtime: operators and sensing', () => {
  it('computes arithmetic, comparison, boolean and join', () => {
    const f = setup({
      objects: [
        {
          name: 'Cube',
          scripts: workspace([
            flag(),
            blk('control_if', {
              inputs: {
                CONDITION: blk('operator_and', {
                  inputs: {
                    OPERAND1: blk('operator_equals', { inputs: { OPERAND1: blk('operator_mod', { inputs: { NUM1: num(-7), NUM2: num(3) } }), OPERAND2: num(2) } }),
                    OPERAND2: blk('operator_not', { inputs: { OPERAND: blk('operator_gt', { inputs: { OPERAND1: txt('ABC'), OPERAND2: txt('abd') } }) } }),
                  },
                }),
                SUBSTACK: [blk('motion_setposition', { fields: { AXIS: 'x' }, values: { VALUE: 1 } })],
              },
            }),
          ]),
        },
      ],
    });
    f.runtime.start();
    f.run(1);
    expect(f.scene.get(f.objectId('Cube'))!.position[0]).toBe(1);
  });

  it('distance between objects uses world positions', () => {
    let distanceVar = '';
    const f = setup({
      objects: [
        { name: 'A', position: [0, 0, 0], scripts: (ids) => workspace([flag(), blk('data_setvariableto', { fields: { VAR: distanceVar }, inputs: { VALUE: blk('sensing_distanceto', { fields: { OBJECT: ids.B } }) } })]) },
        { name: 'B', position: [3, 0, 4] },
      ],
      setupProject: (project) => {
        distanceVar = addVariable(project, { name: 'd', scope: 'global', ownerId: null, value: 0 }).id;
      },
    });
    const runtime = new Runtime({ model: buildRuntimeModel(f.project), hats: buildHats(f.project), scene: f.scene, audio: f.audio, physics: null, onLog: (e) => f.logs.push(e) });
    runtime.start();
    runtime.tick(DT);
    expect(runtime.readVariable(distanceVar, null)).toBeCloseTo(5);
  });

  it('random between integers returns integers within bounds', () => {
    let v = '';
    const f = setup({
      objects: [{ name: 'Cube', scripts: () => workspace([flag(), blk('data_setvariableto', { fields: { VAR: v }, inputs: { VALUE: blk('operator_random', { inputs: { FROM: num(1), TO: num(6) } }) } })]) }],
      setupProject: (project) => {
        v = addVariable(project, { name: 'r', scope: 'global', ownerId: null, value: 0 }).id;
      },
    });
    const runtime = new Runtime({ model: buildRuntimeModel(f.project), hats: buildHats(f.project), scene: f.scene, audio: f.audio, physics: null, rng: () => 0.999, onLog: (e) => f.logs.push(e) });
    runtime.start();
    runtime.tick(DT);
    expect(runtime.readVariable(v, null)).toBe(6);
    const low = new Runtime({ model: buildRuntimeModel(f.project), hats: buildHats(f.project), scene: f.scene, audio: f.audio, physics: null, rng: () => 0, onLog: (e) => f.logs.push(e) });
    low.start();
    low.tick(DT);
    expect(low.readVariable(v, null)).toBe(1);
  });

  it('timer and reset timer', () => {
    const f = setup({ objects: [{ name: 'Cube', scripts: workspace([flag(), blk('control_wait', { values: { SECS: 1 } }), blk('sensing_resettimer')]) }] });
    f.runtime.start();
    f.run(61);
    expect(f.runtime.timer).toBeCloseTo(0, 1);
    expect(f.runtime.time).toBeGreaterThan(1);
  });
});

describe('runtime: sound and looks', () => {
  it('play sound and play-until-done use the audio host and wait for completion', () => {
    let soundId = '';
    const f = setup({
      objects: [{ name: 'Cube', scripts: () => workspace([flag(), blk('sound_playuntildone', { fields: { SOUND: soundId } }), blk('looks_hide')]) }],
      setupProject: (project) => {
        soundId = addSound(project, 'Pop', 'a'.repeat(64)).id;
      },
    });
    f.audio.sounds.add(soundId);
    const runtime = new Runtime({ model: buildRuntimeModel(f.project), hats: buildHats(f.project), scene: f.scene, audio: f.audio, physics: null, onLog: (e) => f.logs.push(e) });
    runtime.start();
    runtime.tick(DT);
    expect(f.audio.played).toHaveLength(1);
    expect(f.audio.played[0].targetId).toBe(f.objectId('Cube'));
    expect(f.scene.get(f.objectId('Cube'))!.visible).toBe(true);
    f.audio.played[0].handle.finish();
    runtime.tick(DT);
    expect(f.scene.get(f.objectId('Cube'))!.visible).toBe(false);
  });

  it('volume blocks change the object volume used for playback', () => {
    let soundId = '';
    const f = setup({
      objects: [{ name: 'Cube', scripts: () => workspace([flag(), blk('sound_setvolume', { values: { VOLUME: 40 } }), blk('sound_play', { fields: { SOUND: soundId } })]) }],
      setupProject: (project) => {
        soundId = addSound(project, 'Chime', 'b'.repeat(64)).id;
      },
    });
    f.audio.sounds.add(soundId);
    const runtime = new Runtime({ model: buildRuntimeModel(f.project), hats: buildHats(f.project), scene: f.scene, audio: f.audio, physics: null, onLog: (e) => f.logs.push(e) });
    runtime.start();
    runtime.tick(DT);
    expect(f.audio.played[0].volume).toBe(40);
  });

  it('say-for shows speech for the given time and then clears it', () => {
    const f = setup({ objects: [{ name: 'Cube', scripts: workspace([flag(), blk('looks_sayfor', { values: { TEXT: 'Hi', SECS: 0.5 } })]) }] });
    f.runtime.start();
    f.run(1);
    expect(f.scene.get(f.objectId('Cube'))!.speech?.text).toBe('Hi');
    f.run(40);
    expect(f.scene.get(f.objectId('Cube'))!.speech).toBeNull();
  });

  it('size scales proportionally and reports the average size percent', () => {
    const f = setup({
      objects: [{ name: 'Cube', scripts: workspace([flag(), blk('looks_setsize', { values: { PERCENT: 200 } })]) }],
    });
    f.runtime.start();
    f.run(1);
    expect(f.scene.get(f.objectId('Cube'))!.scale).toEqual([2, 2, 2]);
  });

  it('set color validates the color value', () => {
    const f = setup({ objects: [{ name: 'Cube', scripts: workspace([flag(), blk('looks_setcolor', { values: { COLOR: 'not a color' } })]) }] });
    f.runtime.start();
    f.run(1);
    expect(f.logs.some((l) => l.level === 'error' && /not a color/.test(l.message))).toBe(true);
  });
});

describe('runtime: diagnostics', () => {
  it('an unknown block type produces a readable error and stops only that script', () => {
    const f = setup({
      objects: [
        { name: 'Broken', scripts: workspace([flag(), blk('motion_teleport_everywhere', { values: {} }), blk('motion_changeposition', { fields: { AXIS: 'x' }, values: { DELTA: 1 } })]) },
        { name: 'Fine', scripts: workspace([flag(), blk('motion_changeposition', { fields: { AXIS: 'y' }, values: { DELTA: 1 } })]) },
      ],
    });
    f.runtime.start();
    f.run(2);
    const err = f.logs.find((l) => l.level === 'error');
    expect(err?.message).toMatch(/not supported/);
    expect(f.scene.get(f.objectId('Broken'))!.position[0]).toBe(0);
    expect(f.scene.get(f.objectId('Fine'))!.position[1]).toBe(1);
  });

  it('a sound that is not available is reported instead of silently skipped', () => {
    const f = setup({
      objects: [{ name: 'Cube', scripts: workspace([flag(), blk('sound_play', { fields: { SOUND: 'missing' } })]) }],
    });
    f.runtime.start();
    f.run(1);
    expect(f.logs.find((l) => l.level === 'error')?.message).toMatch(/no longer exists|not available/);
  });

  it('physics blocks report that physics is not running when no physics host exists', () => {
    const f = setup({ objects: [{ name: 'Cube', scripts: workspace([flag(), blk('physics_impulse', { values: { X: 0, Y: 5, Z: 0 } })]) }] });
    f.runtime.start();
    f.run(1);
    expect(f.logs.some((l) => l.level === 'error' && /Physics is not running/.test(l.message))).toBe(true);
  });

  it('stage scripts can use object-independent blocks and report object blocks clearly', () => {
    const f = setup({
      objects: [],
      stageScripts: workspace([flag(), blk('motion_moveforward', { values: { STEPS: 1 } })]),
    });
    f.runtime.start();
    f.run(1);
    expect(f.logs.some((l) => l.level === 'error' && /cannot be moved|needs an object/.test(l.message))).toBe(true);
  });

  it('loose blocks without a hat never run', () => {
    const f = setup({ objects: [{ name: 'Cube', scripts: { blocks: { blocks: [chain(blk('motion_changeposition', { fields: { AXIS: 'x' }, values: { DELTA: 1 } }))] } } as ScriptsJSON }] });
    f.runtime.start();
    f.run(3);
    expect(f.scene.get(f.objectId('Cube'))!.position[0]).toBe(0);
  });
});
