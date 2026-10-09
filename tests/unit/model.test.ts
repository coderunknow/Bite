import { describe, expect, it } from 'vitest';
import { createStarterProject, createProject, createSceneObject } from '../../src/model/defaults';
import { validateProject } from '../../src/model/validate';
import { validateCatalog, BLOCK_SPECS, parseTemplate, getBlockSpec } from '../../src/blocks/catalog';
import { BUILT_IN_SOUNDS } from '../../src/model/builtInSounds';
import { forwardOf, yawTowards, worldPosition, localMatrix, wrapDegrees } from '../../src/model/transform';
import type { Project } from '../../src/model/types';

function starter(): Project {
  return createStarterProject('Test', BUILT_IN_SOUNDS);
}

describe('block catalog', () => {
  it('is internally consistent', () => {
    expect(validateCatalog()).toEqual([]);
  });

  it('parses label templates into text, argument and stack parts', () => {
    expect(parseTemplate('repeat [TIMES]\n{BODY}')).toEqual([
      { kind: 'text', text: 'repeat ' },
      { kind: 'arg', name: 'TIMES' },
      { kind: 'newline' },
      { kind: 'stack', name: 'BODY' },
    ]);
  });

  it('has unique opcodes that all use a known category', () => {
    const ops = BLOCK_SPECS.map((s) => s.opcode);
    expect(new Set(ops).size).toBe(ops.length);
    expect(getBlockSpec('motion_moveForward')?.targets).toEqual(['object']);
    expect(getBlockSpec('scene_setGravity')?.targets).toEqual(['stage']);
  });
});

describe('transform conventions', () => {
  it('uses -Z as forward at yaw 0 and turns counter-clockwise for positive yaw', () => {
    const f0 = forwardOf([0, 0, 0]);
    expect(f0[0]).toBeCloseTo(0);
    expect(f0[2]).toBeCloseTo(-1);
    // yaw +90 about +Y (counter-clockwise seen from above) turns -Z into -X.
    const f90 = forwardOf([0, 90, 0]);
    expect(f90[0]).toBeCloseTo(-1);
    expect(f90[2]).toBeCloseTo(0, 5);
  });

  it('computes yaw towards a target', () => {
    expect(yawTowards([0, 0, 0], [0, 0, -5])).toBeCloseTo(0);
    expect(yawTowards([0, 0, 0], [-5, 0, 0])).toBeCloseTo(90);
    expect(yawTowards([0, 0, 0], [5, 0, 0])).toBeCloseTo(-90);
  });

  it('composes parent transforms for world positions', () => {
    const parent = createSceneObject('group', 'P', { position: [10, 0, 0] });
    const child = createSceneObject('cube', 'C', { position: [0, 2, 0] });
    child.parentId = parent.id;
    expect(worldPosition([parent, child], child.id)[0]).toBeCloseTo(10);
    expect(worldPosition([parent, child], child.id)[1]).toBeCloseTo(2);
    const m = localMatrix(child.transform);
    expect(m.elements[13]).toBeCloseTo(2);
  });

  it('wraps degrees into (-180, 180]', () => {
    expect(wrapDegrees(190)).toBe(-170);
    expect(wrapDegrees(-180)).toBe(180);
    expect(wrapDegrees(45)).toBe(45);
  });
});

describe('project validation', () => {
  it('accepts the starter project and round-trips it through JSON', () => {
    const p = starter();
    const result = validateProject(JSON.parse(JSON.stringify(p)));
    expect(result.ok).toBe(true);
    expect(result.project!.objects.map((o) => o.name)).toEqual(['Ground', 'Cube', 'Sun']);
    expect(result.project!.objects[1]!.scripts[0]!.nodes[0]!.opcode).toBe('event_whenkeypressed');
  });

  it('accepts an empty project', () => {
    expect(validateProject(createProject('Empty')).ok).toBe(true);
  });

  it('rejects non-objects, foreign formats and future versions with clear messages', () => {
    expect(validateProject(null).errors[0]).toMatch(/JSON object/);
    expect(validateProject({ format: 'other' }).errors[0]).toMatch(/not a Bite project/);
    const future = { ...starter(), formatVersion: 2 };
    expect(validateProject(future).errors[0]).toMatch(/unsupported project format version/);
  });

  it('reports type errors with paths instead of accepting corrupted data', () => {
    const bad = JSON.parse(JSON.stringify(starter()));
    bad.objects[0].transform.position = ['a', 0, 0];
    bad.objects[1].physics.mass = -2;
    bad.objects[1].kind = 'spaceship';
    const result = validateProject(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/objects\[0\]\.transform\.position/);
    expect(result.errors.join('\n')).toMatch(/objects\[1\]\.physics\.mass/);
    expect(result.errors.join('\n')).toMatch(/objects\[1\]\.kind/);
  });

  it('rejects unknown block opcodes and reporters used as stack blocks', () => {
    const bad = JSON.parse(JSON.stringify(starter()));
    bad.objects[1].scripts[0].nodes.push({ id: 'x1', opcode: 'does_not_exist' });
    bad.objects[1].scripts[0].nodes.push({ id: 'x2', opcode: 'operator_add', inputs: { A: 1, B: 2 } });
    const result = validateProject(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/unknown block type "does_not_exist"/);
    expect(result.errors.join('\n')).toMatch(/reporter "operator_add" cannot be a stack block/);
  });

  it('rejects duplicate block ids and parent cycles', () => {
    const bad = JSON.parse(JSON.stringify(starter()));
    bad.objects[2].parentId = bad.objects[1].id;
    bad.objects[1].parentId = bad.objects[2].id;
    bad.objects[1].scripts[0].nodes[1].id = bad.objects[1].scripts[0].nodes[0].id;
    const result = validateProject(bad);
    expect(result.errors.join('\n')).toMatch(/parent cycle/);
    expect(result.errors.join('\n')).toMatch(/duplicate block id/);
  });

  it('rejects references to missing parents', () => {
    const bad = JSON.parse(JSON.stringify(starter()));
    bad.objects[1].parentId = 'nope';
    expect(validateProject(bad).errors.join('\n')).toMatch(/missing object "nope"/);
  });

  it('warns (not errors) about sound references that do not exist', () => {
    const p = starter();
    p.objects[1]!.scripts[0]!.nodes.push({ id: 'snd1', opcode: 'sound_play', fields: { SOUND: 'ghost' } });
    const result = validateProject(JSON.parse(JSON.stringify(p)));
    expect(result.ok).toBe(true);
    expect(result.warnings.join('\n')).toMatch(/sound "ghost" does not exist/);
  });

  it('drops an active camera id that does not refer to a camera object', () => {
    const p = starter();
    p.settings.activeCameraId = 'missing';
    const result = validateProject(JSON.parse(JSON.stringify(p)));
    expect(result.ok).toBe(true);
    expect(result.project!.settings.activeCameraId).toBeNull();
    expect(result.warnings.join('\n')).toMatch(/active camera/);
  });

  it('never throws on arbitrary garbage', () => {
    const samples: unknown[] = [undefined, 42, 'x', [], { format: 'bite-project', formatVersion: 1 }, { format: 'bite-project', formatVersion: 1, objects: 5, stage: 3 }];
    for (const s of samples) expect(() => validateProject(s)).not.toThrow();
  });
});
