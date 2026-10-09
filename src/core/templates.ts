/**
 * The starter project created by "New project". It shows the core features in a few blocks:
 * a bouncing cube (key and physics blocks), a falling ball (touching, sound, variables).
 * The sound is a built-in sound stored as an asset by the project service.
 */
import { addObject, addSound, addVariable } from './sceneOps';
import { createEmptyProject, type Project } from './project';
import type { ScriptsJSON } from './types';
import { ANY_OBJECT_ID } from './types';

export interface TemplateInput {
  type: string;
  id: string;
  fields?: Record<string, string | number | boolean>;
  inputs?: Record<string, { block?: TemplateInput; shadow?: TemplateInput }>;
  next?: { block: TemplateInput };
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `t${counter}`;
}

/** A literal shadow block (number, text or colour). */
function lit(value: number | string): { shadow: TemplateInput } {
  if (typeof value === 'number') return { shadow: { type: 'bite_number', id: nextId(), fields: { NUM: value } } };
  return { shadow: { type: 'bite_text', id: nextId(), fields: { TEXT: value } } };
}

/** A Blockly-format block with optional inputs. */
function b(type: string, fields: Record<string, string | number | boolean> = {}, inputs: Record<string, { block?: TemplateInput; shadow?: TemplateInput }> = {}): TemplateInput {
  return { type, id: nextId(), fields, inputs };
}

/** Links blocks into a stack and returns the first one. */
function stack(...blocks: TemplateInput[]): TemplateInput {
  for (let i = blocks.length - 2; i >= 0; i -= 1) blocks[i].next = { block: blocks[i + 1] };
  return blocks[0];
}

function scripts(...roots: TemplateInput[]): ScriptsJSON {
  return { blocks: { languageVersion: 0, blocks: roots.map((root, i) => ({ ...root, x: 40, y: 40 + i * 200 })) } } as ScriptsJSON;
}

/** Creates the starter project. `soundAssetId` is the stored asset id of the built-in "Chime" sound. */
export function createStarterProject(input: { id: string; name: string; now: Date; soundAssetId: string }): Project {
  const project = createEmptyProject({ id: input.id, name: input.name, now: input.now });

  const ground = addObject(project, 'plane', { name: 'Ground' });
  ground.transform.scale = [20, 1, 20];
  ground.physics.mode = 'static';
  ground.material.color = '#8fbf7a';

  const score = addVariable(project, { name: 'score', scope: 'global', ownerId: null, value: 0 });
  const chime = addSound(project, 'Chime', input.soundAssetId);

  const bouncer = addObject(project, 'cube', { name: 'Bouncer' });
  bouncer.transform.position = [-2, 3, 0];
  bouncer.physics.mode = 'dynamic';
  bouncer.physics.restitution = 0.7;
  bouncer.scripts = scripts(
    stack(
      b('event_whenflagclicked'),
      b('data_setvariableto', { VAR: score.id }, { VALUE: lit(0) }),
      b('motion_gotoxyz', {}, { X: lit(-2), Y: lit(3), Z: lit(0) }),
    ),
    stack(b('event_whenkeypressed', { KEY: 'space' }), b('physics_impulse', {}, { X: lit(0), Y: lit(6), Z: lit(0) })),
  );

  const ball = addObject(project, 'sphere', { name: 'Ball' });
  // Above the Bouncer, so the Ball lands on it once the Bouncer has dropped to the ground.
  ball.transform.position = [-2, 6, 0];
  ball.physics.mode = 'dynamic';
  ball.material.color = '#ff6f61';
  const onTouch = b('control_if', {}, {
    CONDITION: { block: b('sensing_touching', { OBJECT: ANY_OBJECT_ID }) },
    SUBSTACK: {
      block: stack(
        b('sound_play', { SOUND: chime.id }),
        b('data_changevariableby', { VAR: score.id }, { VALUE: lit(1) }),
        b('control_wait', {}, { SECS: lit(0.5) }),
      ),
    },
  });
  ball.scripts = scripts(
    stack(
      b('event_whenflagclicked'),
      b('motion_gotoxyz', {}, { X: lit(-2), Y: lit(6), Z: lit(0) }),
      b('control_forever', {}, { SUBSTACK: { block: onTouch } }),
    ),
  );
  return project;
}
