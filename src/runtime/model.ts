/** Builds the runtime's view of a project: name lookups, variable scopes, and the initial live state. */
import type { Project } from '../core/project';
import { STAGE_TARGET_ID, type ScriptsJSON } from '../core/types';
import type { LiveTargetInit } from './sceneState';
import type { RuntimeModel, RuntimeModelObject } from './types';
import { collectHats } from './runtime';
import type { Hat } from './types';

export function buildRuntimeModel(project: Project): RuntimeModel {
  const objects = new Map<string, RuntimeModelObject>();
  for (const obj of project.objects) {
    objects.set(obj.id, { id: obj.id, name: obj.name, kind: obj.kind, parentId: obj.parentId });
  }
  const variables: RuntimeModel['variables'] = new Map();
  for (const v of project.variables) {
    variables.set(v.id, { id: v.id, name: v.name, scope: v.scope, ownerId: v.ownerId, initial: v.value });
  }
  const messages = new Map(project.messages.map((m) => [m.id, { id: m.id, name: m.name }]));
  const sounds = new Map(project.sounds.map((s) => [s.id, { id: s.id, name: s.name }]));
  return { objects, variables, messages, sounds };
}

/** Initial live state of all objects, in project order. Parents are not required to come first. */
export function buildLiveTargets(project: Project): LiveTargetInit[] {
  return project.objects.map((obj) => ({
    id: obj.id,
    name: obj.name,
    kind: obj.kind,
    parentId: obj.parentId,
    position: [...obj.transform.position] as LiveTargetInit['position'],
    rotation: [...obj.transform.rotation] as LiveTargetInit['rotation'],
    scale: [...obj.transform.scale] as LiveTargetInit['scale'],
    visible: obj.visible,
    color: obj.material.color,
    opacity: obj.material.opacity,
    soundVolume: obj.soundVolume,
  }));
}

/** Hats of the stage and of every object, in a stable order (stage first). */
export function buildHats(project: Project): Hat[] {
  const sources: Array<{ targetId: string; scripts: ScriptsJSON }> = [{ targetId: STAGE_TARGET_ID, scripts: project.stage.scripts as ScriptsJSON }];
  for (const obj of project.objects) {
    sources.push({ targetId: obj.id, scripts: obj.scripts as ScriptsJSON });
  }
  return collectHats(sources);
}
