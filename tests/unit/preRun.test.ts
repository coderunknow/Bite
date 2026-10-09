import { describe, expect, it } from 'vitest';
import { preloadSounds, validateForRun, type SoundLoader } from '../../src/runtime/preRun';
import { block, flagHat, makeObject, makeProject, scriptWith } from '../helpers/fixtures';
import type { Project } from '../../src/model/types';

const SOUND = { id: 'snd-1', name: 'Pop', mimeType: 'audio/wav', extension: 'wav', byteLength: 10, durationSec: null, builtIn: false };

function project(overrides: Partial<Project> = {}): Project {
  return { ...makeProject([makeObject('cube', { name: 'Box' })], { sounds: [SOUND] }), ...overrides };
}

describe('validateForRun', () => {
  it('reports nothing for a valid project', () => {
    const box = makeObject('cube', { name: 'Box', scripts: [flagHat(block('sound_play', { fields: { SOUND: 'snd-1' } }))] });
    expect(validateForRun(makeProject([box], { sounds: [SOUND] }))).toEqual([]);
  });

  it('reports a block whose object was deleted, pointing at that block', () => {
    const hat = block('event_whenflagclicked');
    const turn = block('motion_pointTowards', { fields: { TARGET: 'gone-object-id' } });
    const box = makeObject('cube', { name: 'Box', scripts: [{ id: 's', position: { x: 0, y: 0 }, nodes: [hat, turn] }] });
    const issues = validateForRun(makeProject([box]));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'error', targetId: box.id, blockId: turn.id });
    expect(issues[0]!.message).toMatch(/object was deleted/);
  });

  it('reports a sound block when the project has no sounds', () => {
    const box = makeObject('cube', { name: 'Box', scripts: [flagHat(block('sound_play', { fields: { SOUND: '__none__' } }))] });
    const issues = validateForRun(makeProject([box]));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/no sounds in this project/);
  });

  it('reports a variable that was deleted from the target and the stage', () => {
    const box = makeObject('cube', { name: 'Box', scripts: [flagHat(block('data_setVariable', { fields: { VARIABLE: 'nope', VALUE: '1' } }))] });
    expect(validateForRun(makeProject([box]))[0]).toMatchObject({ level: 'error' });
  });

  it('accepts a stage variable from an object script', () => {
    const stageVar = { id: 'v-stage', name: 'score', value: 0 };
    const box = makeObject('cube', { name: 'Box', scripts: [flagHat(block('data_setVariable', { fields: { VARIABLE: 'v-stage', VALUE: '1' } }))] });
    expect(validateForRun(makeProject([box], { stageVariables: [stageVar] }))).toEqual([]);
  });

  it('reports a broadcast to a message that no longer exists', () => {
    const stage = [scriptWith(block('event_whenflagclicked'), block('event_broadcast', { fields: { MESSAGE: 'ghost' } }))];
    const issues = validateForRun(makeProject([], { stageScripts: stage }));
    expect(issues.map((i) => i.message).join(' ')).toMatch(/message "ghost" no longer exists/);
  });

  it('finds references nested inside reporter inputs and C-block stacks', () => {
    const nested = block('sensing_touching', { fields: { TARGET: 'missing-1' } });
    const loop = block('control_repeat', { inputs: { TIMES: 2 }, stacks: { BODY: [block('sound_play', { fields: { SOUND: 'missing-2' } })] } });
    const box = makeObject('cube', { name: 'Box', scripts: [flagHat(block('control_if', { inputs: { CONDITION: nested }, stacks: { BODY: [loop] } }))] });
    const issues = validateForRun(makeProject([box], { sounds: [SOUND] }));
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.every((i) => i.level === 'error')).toBe(true);
  });

  it('warns that physics on a child object is ignored', () => {
    const parent = makeObject('group', { name: 'Group' });
    const child = { ...makeObject('cube', { name: 'Child', bodyType: 'dynamic' }), parentId: parent.id };
    const issues = validateForRun(makeProject([parent, child]));
    expect(issues).toEqual([expect.objectContaining({ level: 'warning', targetId: child.id })]);
  });

  it('warns when the play camera was deleted', () => {
    const p = project({ settings: { ...project().settings, activeCameraId: 'gone' } });
    expect(validateForRun(p).map((i) => i.level)).toEqual(['warning']);
  });

  it('does not mutate the project it checks', () => {
    const box = makeObject('cube', { name: 'Box', scripts: [flagHat(block('sound_play', { fields: { SOUND: 'missing' } }))] });
    const p = makeProject([box], { sounds: [SOUND] });
    const before = JSON.stringify(p);
    validateForRun(p);
    expect(JSON.stringify(p)).toBe(before);
  });
});

function fakeLoader(): SoundLoader & { loaded: string[]; retained: string[] | null } {
  const loaded: string[] = [];
  const buffers = new Set<string>();
  return {
    loaded,
    retained: null,
    async load(id) {
      loaded.push(id);
      buffers.add(id);
    },
    hasBuffer: (id) => buffers.has(id),
    retain(ids) {
      this.retained = [...ids];
    },
  };
}

const blob = (n: number) => new Blob([new Uint8Array(n)]);

describe('preloadSounds', () => {
  it('loads every project sound and retains only project sounds', async () => {
    const loader = fakeLoader();
    const p = project({ sounds: [SOUND, { ...SOUND, id: 'snd-2', name: 'Tick' }] });
    const issues = await preloadSounds(p, loader, { readSound: async () => blob(4) });
    expect(issues).toEqual([]);
    expect(loader.loaded).toEqual(['snd-1', 'snd-2']);
    expect(loader.retained).toEqual(['snd-1', 'snd-2']);
  });

  it('skips sounds that are already decoded', async () => {
    const loader = fakeLoader();
    await loader.load('snd-1', new ArrayBuffer(1));
    loader.loaded.length = 0;
    await preloadSounds(project(), loader, { readSound: async () => blob(4) });
    expect(loader.loaded).toEqual([]);
  });

  it('reports a sound whose bytes are missing from storage and keeps going', async () => {
    const loader = fakeLoader();
    const p = project({ sounds: [SOUND, { ...SOUND, id: 'snd-2', name: 'Tick' }] });
    const issues = await preloadSounds(p, loader, { readSound: async (id) => (id === 'snd-2' ? blob(4) : null) });
    expect(issues).toEqual([expect.objectContaining({ level: 'error', targetId: null, message: expect.stringMatching(/Pop.*missing from browser storage/) })]);
    expect(loader.loaded).toEqual(['snd-2']);
  });

  it('reports a sound that fails to decode', async () => {
    const loader = fakeLoader();
    loader.load = async () => {
      throw new Error('decode failed');
    };
    const issues = await preloadSounds(project(), loader, { readSound: async () => blob(4) });
    expect(issues).toEqual([expect.objectContaining({ level: 'error', message: expect.stringMatching(/could not be decoded/) })]);
  });

  it('stops early when the Run that started it has been superseded', async () => {
    const loader = fakeLoader();
    const p = project({ sounds: [SOUND, { ...SOUND, id: 'snd-2' }] });
    let calls = 0;
    await preloadSounds(p, loader, { readSound: async () => (calls++, blob(4)) }, () => calls < 1);
    expect(calls).toBe(1);
    expect(loader.loaded).toEqual(['snd-1']);
  });
});
