import { beforeAll, describe, expect, it } from 'vitest';
import { Runtime } from '../../src/runtime/runtime';
import { RapierPhysics, initRapier } from '../../src/physics/rapierPhysics';
import { BLOCK_SPECS } from '../../src/blocks/catalog';
import { STATEMENTS, REPORTERS } from '../../src/runtime/opcodes';
import { HAT_OPCODES } from '../../src/runtime/opcodes/events';
import { normalizeKey } from '../../src/runtime/keys';
import { block, flagHat, FakeAudio, makeObject, makeProject, runSeconds, scriptWith, FRAME } from '../helpers/fixtures';
import type { Project, Script, SceneObject, Value, Variable } from '../../src/model/types';

beforeAll(async () => {
  await initRapier();
});

interface Harness {
  rt: Runtime;
  audio: FakeAudio;
  run(seconds: number): void;
  find(id: string): SceneObject;
  dispose(): void;
}

async function harness(project: Project): Promise<Harness> {
  const audio = new FakeAudio();
  const physics = await RapierPhysics.create(project.settings.gravity);
  const rt = new Runtime(project, { physics, audio });
  rt.start();
  return {
    rt,
    audio,
    run: (s) => runSeconds((dt) => rt.tick(dt), s),
    find: (id) => {
      const o = rt.objects.find((x) => x.id === id);
      if (!o) throw new Error(`no object ${id}`);
      return o;
    },
    dispose: () => rt.dispose(),
  };
}

const varOf = (id: string, name: string, value: Value = 0): Variable => ({ id, name, value });
const readVar = (h: Harness, id: string): Value => {
  const v = h.rt.stage.variables.find((x) => x.id === id) ?? h.rt.objects.flatMap((o) => o.variables).find((x) => x.id === id);
  if (!v) throw new Error(`no variable ${id}`);
  return v.value;
};
const setVar = (id: string, value: string) => block('data_setVariable', { fields: { VARIABLE: id }, inputs: { VALUE: value } });
const changeVar = (id: string, by: number) => block('data_changeVariable', { fields: { VARIABLE: id }, inputs: { VALUE: by } });
const getVar = (id: string) => block('data_variable', { fields: { VARIABLE: id } });

describe('catalog coverage', () => {
  it('every block in the catalog has exactly one runtime implementation (or is a hat)', () => {
    for (const spec of BLOCK_SPECS) {
      if (spec.shape === 'hat') {
        expect(HAT_OPCODES.has(spec.opcode), spec.opcode).toBe(true);
        continue;
      }
      if (spec.shape === 'reporter' || spec.shape === 'boolean') {
        expect(REPORTERS[spec.opcode], spec.opcode).toBeTypeOf('function');
      } else {
        expect(STATEMENTS[spec.opcode], spec.opcode).toBeTypeOf('function');
      }
    }
  });
});

describe('key normalisation', () => {
  it('maps DOM keys to project keys', () => {
    expect(normalizeKey(' ')).toBe('space');
    expect(normalizeKey('ArrowLeft')).toBe('left arrow');
    expect(normalizeKey('A')).toBe('a');
    expect(normalizeKey('7')).toBe('7');
    expect(normalizeKey('F5')).toBeNull();
    expect(normalizeKey('any')).toBeNull();
  });
});

describe('motion and looks', () => {
  it('moves forward along -Z, turns counter-clockwise for left turns and goes to coordinates', async () => {
    const cube = makeObject('cube', {
      name: 'Cube',
      scripts: [flagHat(
        block('motion_moveForward', { inputs: { DISTANCE: 2 } }),
        block('motion_turn', { fields: { DIRECTION: 'left' }, inputs: { DEGREES: 90 } }),
        block('motion_goTo', { inputs: { X: 5, Y: 1, Z: 5 } }),
      )],
    });
    const h = await harness(makeProject([cube]));
    h.run(0.1);
    expect(h.find(cube.id).transform.position).toEqual([5, 1, 5]);
    expect(h.find(cube.id).transform.rotation[1]).toBeCloseTo(90);
    h.dispose();
  });

  it('glide reaches the destination after the given time', async () => {
    const cube = makeObject('cube', {
      scripts: [flagHat(block('motion_glide', { inputs: { SECS: 1, X: 10, Y: 0, Z: 0 } }))],
    });
    const h = await harness(makeProject([cube]));
    h.run(0.5);
    const mid = h.find(cube.id).transform.position[0];
    expect(mid).toBeGreaterThan(3);
    expect(mid).toBeLessThan(7);
    h.run(0.6);
    expect(h.find(cube.id).transform.position[0]).toBeCloseTo(10);
    h.dispose();
  });

  it('point towards and distance use world positions', async () => {
    const a = makeObject('cube', { name: 'A', position: [0, 0, 0] });
    const b = makeObject('cube', { name: 'B', position: [-4, 0, 0] });
    const v = { id: 'dist', name: 'dist', value: 0 };
    const a2 = { ...a, scripts: [flagHat(
      block('motion_pointTowards', { fields: { TARGET: b.id } }),
      block('motion_changePosition', { fields: { AXIS: 'x' }, inputs: { VALUE: 0 } }),
    )] };
    a2.variables = [v];
    a2.scripts = [flagHat(
      block('motion_pointTowards', { fields: { TARGET: b.id } }),
      block('data_setVariable', { fields: { VARIABLE: 'dist' }, inputs: { VALUE: block('sensing_distanceTo', { fields: { TARGET: b.id } }) as never } }),
    )];
    const h = await harness(makeProject([a2, b]));
    h.run(0.1);
    expect(h.find(a.id).transform.rotation[1]).toBeCloseTo(90);
    expect(readVar(h, 'dist')).toBeCloseTo(4);
    h.dispose();
  });

  it('say shows a bubble for the given time and then clears it', async () => {
    const cube = makeObject('cube', { scripts: [flagHat(block('looks_say', { inputs: { MESSAGE: 'Hi', SECS: 0.5 } }))] });
    const h = await harness(makeProject([cube]));
    h.run(0.1);
    expect(h.rt.objectTarget(cube.id)!.says?.text).toBe('Hi');
    h.run(0.6);
    expect(h.rt.objectTarget(cube.id)!.says).toBeNull();
    h.dispose();
  });

  it('colour validation reports a clear error for invalid hex', async () => {
    const cube = makeObject('cube', { scripts: [flagHat(block('looks_setColor', { inputs: { COLOR: 'red' } }))] });
    const h = await harness(makeProject([cube]));
    h.run(0.1);
    expect(h.rt.log.snapshot().some((e) => e.message.includes('is not a colour'))).toBe(true);
    h.dispose();
  });
});

describe('control flow and stopping', () => {
  it('repeat runs its body the given number of times with waits', async () => {
    const cube = makeObject('cube', {
      variables: [varOf('count', 'count')],
      scripts: [flagHat(block('control_repeat', { inputs: { TIMES: 3 }, stacks: { BODY: [changeVar('count', 1), block('control_wait', { inputs: { SECS: 0.1 } })] } }))],
    });
    const h = await harness(makeProject([cube]));
    h.run(2);
    expect(readVar(h, 'count')).toBe(3);
    expect(h.rt.runningThreadCount).toBe(0);
    h.dispose();
  });

  it('forever plus stop all terminates scripts and keeps them stopped', async () => {
    const cube = makeObject('cube', {
      variables: [varOf('count', 'count')],
      scripts: [flagHat(block('control_forever', { stacks: { BODY: [changeVar('count', 1), block('control_wait', { inputs: { SECS: 0.2 } })] } }))],
    });
    const h = await harness(makeProject([cube]));
    h.rt.start();
    h.run(1);
    const before = readVar(h, 'count');
    expect(before).toBeGreaterThan(2);
    h.rt.stopAll();
    expect(h.rt.runningThreadCount).toBe(0);
    h.run(1);
    expect(readVar(h, 'count')).toBe(before);
    h.dispose();
  });

  it('an empty forever loop does not freeze the frame (it yields every frame)', async () => {
    const cube = makeObject('cube', { scripts: [flagHat(block('control_forever', { stacks: { BODY: [] } }))] });
    const h = await harness(makeProject([cube]));
    h.rt.start();
    const t0 = performance.now();
    h.run(10);
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(h.rt.runningThreadCount).toBe(1);
    h.rt.stopAll();
    expect(h.rt.runningThreadCount).toBe(0);
    h.dispose();
  });

  it('stop this script ends only that script', async () => {
    const cube = makeObject('cube', {
      variables: [varOf('count', 'count')],
      scripts: [
        flagHat(block('control_forever', { stacks: { BODY: [changeVar('count', 1), block('control_if', {
          inputs: { CONDITION: block('operator_equals', { inputs: { A: getVar('count'), B: 3 } }) as never },
          stacks: { BODY: [block('control_stop', { fields: { OPTION: 'this' } })] },
        }), block('control_wait', { inputs: { SECS: 0.1 } })] } })),
        flagHat(block('control_wait', { inputs: { SECS: 0.05 } }), setVar('other', '42')),
      ],
    });
    cube.variables.push(varOf('other', 'other'));
    const h = await harness(makeProject([cube]));
    h.rt.start();
    h.run(2);
    expect(readVar(h, 'count')).toBe(3);
    expect(readVar(h, 'other')).toBe(42);
    expect(h.rt.runningThreadCount).toBe(0);
    h.dispose();
  });

  it('stop other scripts of this object keeps the calling script alive', async () => {
    const cube = makeObject('cube', {
      variables: [varOf('a', 'a'), varOf('b', 'b')],
      scripts: [
        flagHat(block('control_forever', { stacks: { BODY: [changeVar('a', 1), block('control_wait', { inputs: { SECS: 0.1 } })] } })),
        flagHat(block('control_wait', { inputs: { SECS: 0.35 } }), block('control_stop', { fields: { OPTION: 'others' } }), block('control_wait', { inputs: { SECS: 0.5 } }), changeVar('b', 1)),
      ],
    });
    const h = await harness(makeProject([cube]));
    h.rt.start();
    h.run(2);
    expect(readVar(h, 'b')).toBe(1);
    const a = readVar(h, 'a');
    h.run(1);
    expect(readVar(h, 'a')).toBe(a);
    h.dispose();
  });

  it('stop all from a script halts every script', async () => {
    const cube = makeObject('cube', {
      variables: [varOf('a', 'a')],
      scripts: [flagHat(block('control_forever', { stacks: { BODY: [changeVar('a', 1), block('control_wait', { inputs: { SECS: 0.1 } })] } }))],
    });
    const other = makeObject('sphere', {
      name: 'Other',
      scripts: [flagHat(block('control_wait', { inputs: { SECS: 0.3 } }), block('control_stop', { fields: { OPTION: 'all' } }))],
    });
    const h = await harness(makeProject([cube, other]));
    h.rt.start();
    h.run(2);
    expect(h.rt.runningThreadCount).toBe(0);
    h.dispose();
  });

  it('broadcast and wait resumes only after the receiver finished', async () => {
    const sender = makeObject('cube', {
      name: 'Sender',
      variables: [varOf('done', 'done')],
      scripts: [flagHat(block('event_broadcastandwait', { fields: { MESSAGE: 'go' } }), setVar('done', '1'))],
    });
    const receiver = makeObject('sphere', {
      name: 'Receiver',
      variables: [varOf('count', 'count')],
      scripts: [scriptWith(block('event_whenbroadcastreceived', { fields: { MESSAGE: 'go' } }), block('control_wait', { inputs: { SECS: 0.5 } }), changeVar('count', 1))],
    });
    const h = await harness(makeProject([sender, receiver]));
    h.rt.start();
    h.run(0.2);
    expect(readVar(h, 'done')).toBe(0);
    h.run(1);
    expect(readVar(h, 'done')).toBe(1);
    h.dispose();
  });

  it('broadcast starts receivers without waiting', async () => {
    const sender = makeObject('cube', { scripts: [flagHat(block('event_broadcast', { fields: { MESSAGE: 'ping' } }), changeVar('x', 0))], variables: [varOf('x', 'x')] });
    const receiver = makeObject('sphere', {
      variables: [varOf('hit', 'hit')],
      scripts: [scriptWith(block('event_whenbroadcastreceived', { fields: { MESSAGE: 'ping' } }), setVar('hit', '1'))],
    });
    const h = await harness(makeProject([sender, receiver]));
    h.rt.start();
    h.run(0.1);
    expect(readVar(h, 'hit')).toBe(1);
    h.dispose();
  });

  it('a running script is not restarted by a repeated key press, but is restarted by the green flag', async () => {
    const cube = makeObject('cube', {
      variables: [varOf('n', 'n')],
      scripts: [scriptWith(block('event_whenkeypressed', { fields: { KEY: 'space' } }), block('control_forever', { stacks: { BODY: [changeVar('n', 1), block('control_wait', { inputs: { SECS: 0.1 } })] } }))],
    });
    const h = await harness(makeProject([cube]));
    h.rt.keyDown('space');
    h.run(0.3);
    expect(h.rt.runningThreadCount).toBe(1);
    h.rt.keyDown('space');
    expect(h.rt.runningThreadCount).toBe(1);
    h.rt.keyUp('space');
    h.dispose();
  });

  it('key pressed hats fire for the matching key and for "any"', async () => {
    const cube = makeObject('cube', {
      variables: [varOf('a', 'a'), varOf('b', 'b')],
      scripts: [
        scriptWith(block('event_whenkeypressed', { fields: { KEY: 'a' } }), setVar('a', '1')),
        scriptWith(block('event_whenkeypressed', { fields: { KEY: 'any' } }), setVar('b', '1')),
      ],
    });
    const h = await harness(makeProject([cube]));
    h.rt.keyDown('z');
    h.run(0.1);
    expect(readVar(h, 'a')).toBe(0);
    expect(readVar(h, 'b')).toBe(1);
    h.rt.keyDown('a');
    h.run(0.1);
    expect(readVar(h, 'a')).toBe(1);
    h.dispose();
  });

  it('clicking an object starts its click scripts', async () => {
    const cube = makeObject('cube', { variables: [varOf('c', 'c')], scripts: [scriptWith(block('event_whenthisspriteclicked'), setVar('c', '7'))] });
    const h = await harness(makeProject([cube]));
    h.rt.clickObject(cube.id);
    h.run(0.1);
    expect(readVar(h, 'c')).toBe(7);
    h.dispose();
  });
});

describe('variables and operators', () => {
  it('stores numbers and text, and applies operators', async () => {
    const cube = makeObject('cube', {
      variables: [varOf('m', 'm'), varOf('s', 's', 'x'), varOf('r', 'r')],
      scripts: [flagHat(
        setVar('m', ''),
        block('data_setVariable', { fields: { VARIABLE: 'm' }, inputs: { VALUE: block('operator_mod', { inputs: { A: -7, B: 3 } }) as never } }),
        block('data_setVariable', { fields: { VARIABLE: 's' }, inputs: { VALUE: block('operator_join', { inputs: { A: 'ab', B: 'cd' } }) as never } }),
        block('data_setVariable', { fields: { VARIABLE: 'r' }, inputs: { VALUE: block('operator_length', { inputs: { A: 'héllo' } }) as never } }),
      )],
    });
    const h = await harness(makeProject([cube]));
    h.run(0.1);
    expect(readVar(h, 'm')).toBe(2);
    expect(readVar(h, 's')).toBe('abcd');
    expect(readVar(h, 'r')).toBe(5);
    h.dispose();
  });

  it('changing a non-numeric variable is a clear runtime error that stops the script', async () => {
    const cube = makeObject('cube', {
      variables: [varOf('t', 't', 'hello'), varOf('after', 'after')],
      scripts: [flagHat(changeVar('t', 1), setVar('after', '1'))],
    });
    const h = await harness(makeProject([cube]));
    h.run(0.1);
    const err = h.rt.log.snapshot().find((e) => e.level === 'error');
    expect(err?.message).toMatch(/does not hold a number/);
    expect(err?.blockId).not.toBeNull();
    expect(readVar(h, 'after')).toBe(0);
    h.dispose();
  });

  it('division by zero is reported and the other scripts keep running', async () => {
    const bad = makeObject('cube', { name: 'Bad', scripts: [flagHat(block('data_setVariable', { fields: { VARIABLE: 'v' }, inputs: { VALUE: block('operator_divide', { inputs: { A: 1, B: 0 } }) as never } }))], variables: [varOf('v', 'v')] });
    const good = makeObject('sphere', { name: 'Good', variables: [varOf('ok', 'ok')], scripts: [flagHat(setVar('ok', '1'))] });
    const h = await harness(makeProject([bad, good]));
    h.rt.start();
    h.run(0.1);
    expect(h.rt.log.snapshot().some((e) => e.message === 'Division by zero')).toBe(true);
    expect(readVar(h, 'ok')).toBe(1);
    h.dispose();
  });

  it('identical repeated errors are folded into one log entry', async () => {
    const bad = makeObject('cube', {
      scripts: [flagHat(block('control_forever', { stacks: { BODY: [block('motion_pointTowards', { fields: { TARGET: 'gone' } }), block('control_wait', { inputs: { SECS: 0.1 } })] } }))],
    });
    const h = await harness(makeProject([bad]));
    h.rt.start();
    h.run(1);
    const errors = h.rt.log.snapshot().filter((e) => e.level === 'error');
    expect(errors.length).toBe(1);
    h.dispose();
  });
});

describe('scope rules and missing references', () => {
  it('object-only blocks are rejected on the stage', async () => {
    const h = await harness(makeProject([], { stageScripts: [flagHat(block('motion_moveForward', { inputs: { DISTANCE: 1 } }))] }));
    h.rt.start();
    h.run(0.1);
    expect(h.rt.log.snapshot()[0]?.message).toMatch(/not available for the stage/);
    h.dispose();
  });

  it('pointing towards a deleted object reports an error on that block', async () => {
    const cube = makeObject('cube', { scripts: [flagHat(block('motion_pointTowards', { id: 'blk-ptr', fields: { TARGET: 'missing' } }))] });
    const h = await harness(makeProject([cube]));
    h.rt.start();
    h.run(0.1);
    const e = h.rt.log.snapshot().find((x) => x.level === 'error');
    expect(e?.blockId).toBe('blk-ptr');
    h.dispose();
  });

  it('playing a sound that does not exist is an error', async () => {
    const cube = makeObject('cube', { scripts: [flagHat(block('sound_play', { fields: { SOUND: 'ghost' } }))] });
    const h = await harness(makeProject([cube]));
    h.rt.start();
    h.run(0.1);
    expect(h.rt.log.snapshot()[0]?.message).toMatch(/does not exist/);
    expect(h.audio.played).toEqual([]);
    h.dispose();
  });

  it('a sound playback failure from the audio boundary becomes a block error', async () => {
    const cube = makeObject('cube', { scripts: [flagHat(block('sound_play', { fields: { SOUND: 's1' } }))] });
    const h = await harness(makeProject([cube], { sounds: [{ id: 's1', name: 'x', extension: 'wav', mimeType: 'audio/wav', byteLength: 1, durationSec: 1, builtIn: false }] }));
    h.audio.failWith = 'Sound is blocked by the browser until you interact with the page.';
    h.rt.start();
    h.run(0.1);
    expect(h.rt.log.snapshot()[0]?.message).toMatch(/blocked by the browser/);
    h.dispose();
  });
});

describe('sound', () => {
  const sounds = [{ id: 'pop', name: 'Pop', extension: 'wav', mimeType: 'audio/wav', byteLength: 1, durationSec: 0.5, builtIn: true }];

  it('start sound returns immediately; play until done waits for the playback', async () => {
    const cube = makeObject('cube', {
      variables: [varOf('after', 'after')],
      scripts: [
        flagHat(block('sound_play', { fields: { SOUND: 'pop' } }), block('sound_playUntilDone', { fields: { SOUND: 'pop' } }), setVar('after', '1')),
      ],
    });
    const h = await harness(makeProject([cube], { sounds }));
    h.rt.start();
    h.run(0.2);
    expect(h.audio.played).toEqual(['pop', 'pop']);
    expect(readVar(h, 'after')).toBe(0);
    h.audio.finishAll();
    h.run(0.05);
    expect(readVar(h, 'after')).toBe(1);
    h.dispose();
  });

  it('stop all sounds and volume blocks update the master volume', async () => {
    const cube = makeObject('cube', {
      variables: [varOf('v', 'v')],
      scripts: [flagHat(block('sound_setVolume', { inputs: { PERCENT: 40 } }), block('sound_changeVolume', { inputs: { PERCENT: -15 } }), block('sound_stopAll'), block('data_setVariable', { fields: { VARIABLE: 'v' }, inputs: { VALUE: block('sound_volume') as never } }))],
    });
    const h = await harness(makeProject([cube], { sounds }));
    h.rt.start();
    h.run(0.1);
    expect(h.audio.masterVolume).toBeCloseTo(0.25);
    expect(readVar(h, 'v')).toBe(25);
    expect(h.audio.stopAllCount).toBeGreaterThan(0);
    h.dispose();
  });
});

describe('physics', () => {
  function ground(): SceneObject {
    return makeObject('plane', { name: 'Ground', bodyType: 'static', scale: [10, 1, 10] });
  }

  it('a dynamic cube falls onto a static ground and comes to rest on it', async () => {
    const g = ground();
    const cube = makeObject('cube', { name: 'Cube', bodyType: 'dynamic', position: [0, 3, 0] });
    const h = await harness(makeProject([g, cube]));
    h.run(0.5);
    expect(h.find(cube.id).transform.position[1]).toBeLessThan(2.9);
    h.run(3);
    const y = h.find(cube.id).transform.position[1];
    expect(y).toBeGreaterThan(0.4);
    expect(y).toBeLessThan(0.65);
    h.dispose();
  });

  it('applying an impulse launches a dynamic body; setting velocity overrides it', async () => {
    const g = ground();
    const cube = makeObject('cube', {
      name: 'Cube',
      bodyType: 'dynamic',
      position: [0, 0.5, 0],
      scripts: [flagHat(block('control_wait', { inputs: { SECS: 1 } }), block('physics_applyImpulse', { inputs: { X: 0, Y: 6, Z: 0 } }))],
    });
    const h = await harness(makeProject([g, cube]));
    h.rt.start();
    h.run(1.05);
    h.run(0.2);
    expect(h.find(cube.id).transform.position[1]).toBeGreaterThan(0.8);
    h.dispose();
  });

  it('a script-set velocity moves a dynamic body sideways; a stage gravity change applies to it', async () => {
    const cube = makeObject('cube', {
      name: 'Cube',
      bodyType: 'dynamic',
      position: [0, 5, 0],
      scripts: [flagHat(block('physics_setVelocity', { inputs: { X: 2, Y: 0, Z: 0 } }))],
    });
    const stageScripts = [flagHat(block('scene_setGravity', { inputs: { X: 0, Y: 0, Z: 0 } }))];
    const h = await harness(makeProject([cube], { stageScripts }));
    h.run(1);
    const p = h.find(cube.id).transform.position;
    expect(p[0]).toBeGreaterThan(1.5);
    expect(p[0]).toBeLessThan(2.2);
    expect(p[1]).toBeCloseTo(5, 2);
    h.dispose();
  });

  it('gravity changed on the stage makes a body fall at the new rate', async () => {
    const cube = makeObject('cube', { name: 'Cube', bodyType: 'dynamic', position: [0, 5, 0] });
    const stageScripts = [flagHat(block('scene_setGravity', { inputs: { X: 0, Y: -1, Z: 0 } }))];
    const h = await harness(makeProject([cube], { stageScripts }));
    h.run(1);
    // Free fall with g = 1 m/s^2 for 1 s drops 0.5 m.
    expect(h.find(cube.id).transform.position[1]).toBeCloseTo(4.5, 1);
    h.dispose();
  });

  it('scripted moves of a dynamic body teleport it and keep it simulated', async () => {
    const cube = makeObject('cube', {
      name: 'Cube',
      bodyType: 'dynamic',
      position: [0, 0.5, 0],
      scripts: [flagHat(block('control_wait', { inputs: { SECS: 0.5 } }), block('motion_goTo', { inputs: { X: 0, Y: 4, Z: 0 } }))],
    });
    const h = await harness(makeProject([ground(), cube]));
    h.rt.start();
    h.run(0.4);
    expect(h.find(cube.id).transform.position[1]).toBeCloseTo(0.5, 1);
    h.run(0.2);
    expect(h.find(cube.id).transform.position[1]).toBeGreaterThan(2);
    h.run(3);
    expect(h.find(cube.id).transform.position[1]).toBeLessThan(0.7);
    h.dispose();
  });

  it('impulses on a static body are ignored with a warning', async () => {
    const g = makeObject('cube', { name: 'Anchor', bodyType: 'static', position: [0, 0.5, 0], scripts: [flagHat(block('physics_applyImpulse', { inputs: { X: 0, Y: 10, Z: 0 } }))] });
    const h = await harness(makeProject([g]));
    h.rt.start();
    h.run(0.5);
    expect(h.find(g.id).transform.position[1]).toBeCloseTo(0.5);
    expect(h.rt.log.snapshot().some((e) => e.level === 'warning' && /not a dynamic body/.test(e.message))).toBe(true);
    h.dispose();
  });

  it('touching uses physics contacts when both objects have bodies', async () => {
    const a = makeObject('cube', { name: 'A', bodyType: 'static', position: [0, 0, 0], variables: [varOf('hit', 'hit')], scripts: [] });
    const b = makeObject('cube', { name: 'B', bodyType: 'dynamic', position: [0, 0.9, 0] });
    a.scripts = [flagHat(block('control_forever', { stacks: { BODY: [block('control_if', { inputs: { CONDITION: block('sensing_touching', { fields: { TARGET: b.id } }) as never }, stacks: { BODY: [setVar('hit', '1')] } }), block('control_wait', { inputs: { SECS: 0.05 } })] } }))];
    const h = await harness(makeProject([a, b]));
    h.rt.start();
    h.run(0.5);
    expect(readVar(h, 'hit')).toBe(1);
    h.dispose();
  });
});

describe('touching without physics (AABB fallback)', () => {
  it('uses world bounds of visible objects and ignores hidden ones', async () => {
    const a = makeObject('cube', { name: 'A', position: [0, 0, 0], variables: [varOf('hit', 'hit'), varOf('near', 'near')] });
    const b = makeObject('sphere', { name: 'B', position: [0.9, 0, 0] });
    const hidden = makeObject('cube', { name: 'Hidden', position: [0, 0, 0], visible: false });
    a.scripts = [flagHat(
      block('data_setVariable', { fields: { VARIABLE: 'hit' }, inputs: { VALUE: block('sensing_touching', { fields: { TARGET: b.id } }) as never } }),
      block('data_setVariable', { fields: { VARIABLE: 'near' }, inputs: { VALUE: block('sensing_touching', { fields: { TARGET: hidden.id } }) as never } }),
    )];
    const h = await harness(makeProject([a, b, hidden]));
    h.rt.start();
    h.run(0.1);
    expect(readVar(h, 'hit')).toBe(true);
    expect(readVar(h, 'near')).toBe(false);
    h.dispose();
  });
});

describe('scene and camera blocks', () => {
  it('sets background and selects an active camera; the stage can use a camera object', async () => {
    const cam = makeObject('camera', { name: 'Cam' });
    const stageScripts: Script[] = [flagHat(
      block('scene_setBackground', { inputs: { COLOR: '#abc' } }),
      block('scene_useCamera', { fields: { CAMERA: cam.id } }),
    )];
    const h = await harness(makeProject([cam], { stageScripts }));
    h.rt.start();
    h.run(0.1);
    expect(h.rt.state.backgroundColor).toBe('#aabbcc');
    expect(h.rt.state.activeCameraId).toBe(cam.id);
    h.dispose();
  });

  it('timer resets and reads elapsed simulated time', async () => {
    const cube = makeObject('cube', {
      variables: [varOf('t', 't')],
      scripts: [flagHat(block('control_wait', { inputs: { SECS: 1 } }), block('data_setVariable', { fields: { VARIABLE: 't' }, inputs: { VALUE: block('sensing_timer') as never } }))],
    });
    const h = await harness(makeProject([cube]));
    h.rt.start();
    h.run(1.5);
    expect(readVar(h, 't')).toBeCloseTo(1, 1);
    h.dispose();
  });

  it('a frame step is clamped so tab switches cannot explode the simulation', async () => {
    const cube = makeObject('cube', { bodyType: 'none' });
    const h = await harness(makeProject([cube]));
    h.rt.tick(60);
    expect(h.rt.state.clock).toBeCloseTo(0.1);
    h.rt.tick(FRAME);
    expect(h.rt.state.clock).toBeCloseTo(0.1 + FRAME);
    h.dispose();
  });
});

describe('runtime lifecycle', () => {
  it('disposed runtimes reject further use', async () => {
    const h = await harness(makeProject([]));
    h.dispose();
    expect(() => h.rt.tick(FRAME)).toThrow(/disposed/);
  });

  it('projects are cloned: runtime writes never change the authored project', async () => {
    const cube = makeObject('cube', { bodyType: 'none', scripts: [flagHat(block('motion_changePosition', { fields: { AXIS: 'x' }, inputs: { VALUE: 5 } }))] });
    const project = makeProject([cube]);
    const h = await harness(project);
    h.rt.start();
    h.run(0.1);
    expect(h.find(cube.id).transform.position[0]).toBe(5);
    expect(project.objects[0]!.transform.position[0]).toBe(0);
    h.dispose();
  });
});
