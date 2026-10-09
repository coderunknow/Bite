import { describe, expect, it } from 'vitest';
import * as E from '../../src/editor/edit';
import { block, flagHat, makeObject, makeProject } from '../helpers/fixtures';
import { validateProject } from '../../src/model/validate';

describe('project edits', () => {
  it('makes unique names', () => {
    expect(E.uniqueName('Cube', [])).toBe('Cube');
    expect(E.uniqueName('Cube', ['cube'])).toBe('Cube 2');
    expect(E.uniqueName('Cube', ['Cube', 'Cube 2'])).toBe('Cube 3');
  });

  it('adds objects with unique names and keeps the input immutable', () => {
    const p = makeProject([makeObject('cube', { name: 'Cube' })]);
    const { project, id } = E.addObject(p, 'cube');
    expect(project.objects.map((o) => o.name)).toEqual(['Cube', 'Cube 2']);
    expect(project.objects.find((o) => o.id === id)!.name).toBe('Cube 2');
    expect(p.objects.length).toBe(1);
  });

  it('refuses duplicate and empty names', () => {
    const p = makeProject([makeObject('cube', { name: 'A' }), makeObject('cube', { name: 'B' })]);
    expect(() => E.renameObject(p, p.objects[1]!.id, 'a')).toThrow(/already called/);
    expect(() => E.renameObject(p, p.objects[1]!.id, '   ')).toThrow(/cannot be empty/);
    expect(E.renameObject(p, p.objects[1]!.id, ' C ').objects[1]!.name).toBe('C');
  });

  it('deletes an object together with its children', () => {
    const group = makeObject('group', { name: 'G' });
    const child = makeObject('cube', { name: 'C' });
    child.parentId = group.id;
    const other = makeObject('cube', { name: 'O' });
    const p = E.deleteObject(makeProject([group, child, other]), group.id);
    expect(p.objects.map((o) => o.name)).toEqual(['O']);
  });

  it('duplicates objects and their scripts with fresh ids that still validate', () => {
    const cube = makeObject('cube', {
      name: 'Cube',
      scripts: [flagHat(block('data_setVariable', { fields: { VARIABLE: 'v1' }, inputs: { VALUE: 1 } }))],
      variables: [{ id: 'v1', name: 'score', value: 0 }],
    });
    const p = makeProject([cube]);
    const { project, id } = E.duplicateObject(p, cube.id);
    const copy = project.objects.find((o) => o.id === id)!;
    expect(copy.name).toBe('Cube copy');
    expect(copy.id).not.toBe(cube.id);
    expect(copy.scripts[0]!.nodes[1]!.id).not.toBe(cube.scripts[0]!.nodes[1]!.id);
    expect(copy.variables[0]!.id).not.toBe('v1');
    expect(copy.scripts[0]!.nodes[1]!.fields!.VARIABLE).toBe(copy.variables[0]!.id);
    expect(validateProject(project).ok).toBe(true);
  });

  it('duplicates a group with its children and remaps their parent ids', () => {
    const group = makeObject('group', { name: 'G' });
    const child = makeObject('cube', { name: 'C' });
    child.parentId = group.id;
    const { project } = E.duplicateObject(makeProject([group, child]), group.id);
    const newGroup = project.objects.find((o) => o.name === 'G copy')!;
    const newChild = project.objects.find((o) => o.parentId === newGroup.id)!;
    expect(newChild.id).not.toBe(child.id);
    expect(newChild.parentId).toBe(newGroup.id);
    expect(validateProject(project).ok).toBe(true);
  });

  it('prevents parent cycles', () => {
    const a = makeObject('group', { name: 'A' });
    const b = makeObject('group', { name: 'B' });
    b.parentId = a.id;
    const p = makeProject([a, b]);
    expect(() => E.setParent(p, a.id, b.id)).toThrow(/inside itself/);
    expect(E.setParent(p, b.id, null).objects[1]!.parentId).toBeNull();
  });

  it('renames messages everywhere they are used and deletes variables', () => {
    const sender = makeObject('cube', { scripts: [flagHat(block('event_broadcast', { fields: { MESSAGE: 'go' } }))] });
    const p = { ...makeProject([sender]), messages: ['go'] };
    const renamed = E.renameMessage(p, 'go', 'start');
    expect(renamed.messages).toEqual(['start']);
    expect(renamed.objects[0]!.scripts[0]!.nodes[1]!.fields!.MESSAGE).toBe('start');
    const withVar = E.addVariable(p, 'stage', 'score');
    const vid = withVar.stage.variables[0]!.id;
    expect(E.deleteVariable(withVar, 'stage', vid).stage.variables).toEqual([]);
    expect(() => E.patchVariable(withVar, 'stage', vid, { name: '' })).toThrow(/cannot be empty/);
  });

  it('removes the active camera when that camera is deleted', () => {
    const cam = makeObject('camera', { name: 'Cam' });
    const p = makeProject([cam]);
    p.settings.activeCameraId = cam.id;
    expect(E.deleteObject(p, cam.id).settings.activeCameraId).toBeNull();
  });
});
