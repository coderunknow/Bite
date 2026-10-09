// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import * as Blockly from 'blockly';
import { defineBiteBlocks, buildToolbox, toolboxBlockTypes, BLOCK_DEFS, parseMessage, setOptionProvider } from '../../src/editor/blockDefs';
import { createStarterProject } from '../../src/core/templates';
import { BLOCK_SPECS } from '../../src/core/blockTypes';
import { implementedTypes } from '../../src/runtime/blocks';
import { parseScriptTree, type RawBlock } from '../../src/core/scripts';
import { createEmptyProject, createSceneObject } from '../../src/core/project';
import { buildHats, buildLiveTargets, buildRuntimeModel } from '../../src/runtime/model';
import { Runtime } from '../../src/runtime/runtime';
import { SceneState } from '../../src/runtime/sceneState';
import { FakeAudio } from '../helpers/fakes';
import type { ScriptsJSON } from '../../src/core/types';

beforeAll(() => {
  defineBiteBlocks();
});

describe('blockly definitions match the runtime', () => {
  it('every block in the toolbox has a runtime implementation', () => {
    const implemented = implementedTypes();
    const missing = toolboxBlockTypes().filter((t) => !implemented.has(t));
    expect(missing).toEqual([]);
  });

  it('every runtime block has a Blockly definition and a spec', () => {
    for (const spec of BLOCK_SPECS) {
      if (spec.category === 'internal') continue;
      expect(BLOCK_DEFS[spec.type], spec.type).toBeDefined();
    }
  });

  it('every argument of every block has a placeholder in its message (otherwise Blockly drops the input)', () => {
    for (const [type, def] of Object.entries(BLOCK_DEFS)) {
      const placeholders = new Set(parseMessage(def.message).flatMap((p) => ('name' in p ? [p.name] : [])));
      for (const arg of Object.keys(def.args)) {
        expect(placeholders.has(arg), `${type} is missing {${arg}} in its message`).toBe(true);
      }
    }
  });

  it('a stale dropdown value (for example a deleted sound) is kept on save, not replaced by the first option', () => {
    setOptionProvider(() => [['Chime', 'Chime']]);
    const ws = new Blockly.Workspace();
    const scripts = { blocks: { languageVersion: 0, blocks: [{ type: 'sound_stop', id: 'x1', fields: { SOUND: 'Missing' } }] } };
    Blockly.serialization.workspaces.load(scripts as never, ws);
    const saved = Blockly.serialization.workspaces.save(ws) as unknown as { blocks: { blocks: Array<{ fields: Record<string, unknown> }> } };
    expect(saved.blocks.blocks[0].fields.SOUND).toBe('Missing');
    ws.dispose();
  });

  it('the starter project scripts load into Blockly without error', () => {
    const project = createStarterProject({ id: 's', name: 'S', now: new Date(0), soundAssetId: 'a' });
    const targets = [project.stage.scripts, ...project.objects.map((o) => o.scripts)];
    for (const scripts of targets) {
      const ws = new Blockly.Workspace();
      expect(() => Blockly.serialization.workspaces.load(scripts as never, ws)).not.toThrow();
      ws.dispose();
    }
  });

  it('the toolbox has nine categories and a button for variables and messages', () => {
    const toolbox = buildToolbox();
    expect(toolbox.contents.map((c) => c.name)).toEqual(['Events', 'Motion', 'Looks', 'Sound', 'Control', 'Sensing', 'Operators', 'Variables', 'Physics']);
    const variables = toolbox.contents.find((c) => c.name === 'Variables')!;
    expect(variables.contents.some((c) => c.kind === 'button' && c.callbackKey === 'BITE_NEW_VARIABLE')).toBe(true);
  });

  it('can create every toolbox block headlessly', () => {
    const ws = new Blockly.Workspace();
    for (const type of toolboxBlockTypes()) {
      const block = ws.newBlock(type);
      expect(block.type).toBe(type);
      block.dispose(false);
    }
    ws.dispose();
  });
});

describe('create, connect, edit, remove, serialize', () => {
  it('builds a script, edits it, round-trips it through JSON, and the runtime runs the saved result', () => {
    const ws = new Blockly.Workspace();
    const flag = ws.newBlock('event_whenflagclicked');
    const move = ws.newBlock('motion_changeposition');
    move.setFieldValue('x', 'AXIS');
    const delta = ws.newBlock('bite_number');
    delta.setFieldValue(2, 'NUM');
    delta.setShadow(true);
    move.getInput('DELTA')!.connection!.connect(delta.outputConnection!);
    flag.nextConnection!.connect(move.previousConnection!);

    // Add a second statement: wait 0.5 seconds, then move back by changing the value.
    const wait = ws.newBlock('control_wait');
    const secs = ws.newBlock('bite_number');
    secs.setFieldValue(0.5, 'NUM');
    secs.setShadow(true);
    wait.getInput('SECS')!.connection!.connect(secs.outputConnection!);
    move.nextConnection!.connect(wait.previousConnection!);

    const saved = Blockly.serialization.workspaces.save(ws) as ScriptsJSON;
    const blocks = (saved.blocks as { blocks: Array<Record<string, unknown>> }).blocks;
    expect(blocks).toHaveLength(1);

    // Round trip: load into a new workspace and save again. The result must be identical.
    const ws2 = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(saved as never, ws2);
    const again = Blockly.serialization.workspaces.save(ws2);
    expect(again).toEqual(saved);

    // Remove a block: the wait disappears from the chain.
    const reloaded = ws2.getAllBlocks(false).find((b) => b.type === 'control_wait')!;
    reloaded.dispose(true);
    expect(ws2.getAllBlocks(false).some((b) => b.type === 'control_wait')).toBe(false);
    expect(ws2.getAllBlocks(false).some((b) => b.type === 'bite_number')).toBe(true);

    // Edit a field value and check it reaches the JSON.
    const movement = ws2.getAllBlocks(false).find((b) => b.type === 'motion_changeposition')!;
    movement.setFieldValue('z', 'AXIS');
    const edited = Blockly.serialization.workspaces.save(ws2) as ScriptsJSON;
    expect(JSON.stringify(edited)).toContain('"AXIS":"z"');

    // The saved JSON runs in the runtime and moves the object.
    const project = createEmptyProject({ id: 'p', name: 'P', now: new Date(0) });
    const obj = createSceneObject({ id: 'cube', name: 'Cube', kind: 'cube' });
    obj.transform.position = [0, 0, 0];
    obj.scripts = edited;
    project.objects.push(obj);
    const scene = new SceneState();
    scene.replaceAll(buildLiveTargets(project));
    const runtime = new Runtime({ model: buildRuntimeModel(project), hats: buildHats(project), scene, audio: new FakeAudio(), physics: null, onLog: () => undefined });
    runtime.start();
    for (let i = 0; i < 2; i += 1) runtime.tick(1 / 60);
    expect(scene.get('cube')!.position[2]).toBe(2);
    ws.dispose();
    ws2.dispose();
  });

  it('parses saved Blockly JSON into the runtime tree, with shadows read as literal inputs', () => {
    const ws = new Blockly.Workspace();
    const repeat = ws.newBlock('control_repeat');
    const times = ws.newBlock('bite_number');
    times.setFieldValue(3, 'NUM');
    times.setShadow(true);
    repeat.getInput('TIMES')!.connection!.connect(times.outputConnection!);
    const saved = Blockly.serialization.workspaces.save(ws) as ScriptsJSON;
    const raw = (saved.blocks as { blocks: RawBlock[] }).blocks[0];
    const tree = parseScriptTree(raw);
    expect(tree.type).toBe('control_repeat');
    expect(tree.inputs.TIMES).toBeDefined();
    expect(tree.inputs.TIMES?.fields.NUM).toBe(3);
    ws.dispose();
  });
});
