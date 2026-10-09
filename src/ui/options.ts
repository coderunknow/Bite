import type { Project } from '../core/project';
import { variablesVisibleTo } from '../core/sceneOps';
import type { OptionList, OptionSource } from '../editor/blockDefs';
import { KEY_OPTIONS } from '../core/keys';
import { ANY_OBJECT_ID, STAGE_TARGET_ID } from '../core/types';

const NONE: OptionList = [['(none)', '']];

/** Dropdown choices for the block editor. `target` is the object or Stage whose scripts are open. */
export function optionsFor(project: Project | null, target: string, source: OptionSource): OptionList {
  if (!project) return NONE;
  const owner = target === STAGE_TARGET_ID ? null : target;
  const others = project.objects.filter((o) => o.id !== owner).map((o): [string, string] => [o.name, o.id]);
  let list: OptionList;
  switch (source) {
    case 'keys':
      list = KEY_OPTIONS.map(([label, value]) => [label, value]);
      break;
    case 'messages':
      list = project.messages.map((m) => [m.name, m.id]);
      break;
    case 'sounds':
      list = project.sounds.map((s) => [s.name, s.id]);
      break;
    case 'variables':
      list = variablesVisibleTo(project, owner).map((v) => [v.name, v.id]);
      break;
    case 'objects':
      list = others;
      break;
    case 'anyObject':
      list = [['any object', ANY_OBJECT_ID], ...others];
      break;
  }
  return list.length > 0 ? list : NONE;
}
