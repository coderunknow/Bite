/**
 * Pure document operations on a Project (scene objects, hierarchy, variables, messages, sounds).
 * Functions mutate the given project object, so they can run inside an immer draft.
 * Every rule that protects data integrity (unique names, no parent cycles, scope conflicts)
 * is enforced here, not in UI code.
 */
import { createSceneObject, DEFAULT_OBJECT_NAMES, MAX_NAME_LENGTH, type Project, type ProjectMessage, type ProjectSound, type ProjectVariable, type SceneObject } from './project';
import { UserError } from './errors';
import { newId } from './ids';
import { countFieldReferences, remapFieldValues } from './scripts';
import type { ObjectKind, ScriptsJSON, VariableScope, Vec3 } from './types';

export function findObject(project: Pick<Project, 'objects'>, id: string | null | undefined): SceneObject | undefined {
  if (!id) return undefined;
  return project.objects.find((o) => o.id === id);
}

export function childrenOf(project: Pick<Project, 'objects'>, id: string | null): SceneObject[] {
  return project.objects.filter((o) => o.parentId === id);
}

/** The object and all of its descendants, parents first. */
export function subtreeOf(project: Pick<Project, 'objects'>, id: string): SceneObject[] {
  const result: SceneObject[] = [];
  const root = findObject(project, id);
  if (!root) return result;
  const visit = (obj: SceneObject): void => {
    result.push(obj);
    for (const child of childrenOf(project, obj.id)) visit(child);
  };
  visit(root);
  return result;
}

/** Path of names from the root to the object (inclusive), used for display. */
export function hierarchyDepth(project: Pick<Project, 'objects'>, id: string): number {
  let depth = 0;
  let cursor = findObject(project, id);
  const guard = new Set<string>();
  while (cursor?.parentId && !guard.has(cursor.id)) {
    guard.add(cursor.id);
    depth += 1;
    cursor = findObject(project, cursor.parentId);
  }
  return depth;
}

export function validateName(name: string, label: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new UserError(`${label} name cannot be empty.`);
  if (trimmed.length > MAX_NAME_LENGTH) throw new UserError(`${label} name must be at most ${MAX_NAME_LENGTH} characters.`);
  return trimmed;
}

export function isObjectNameTaken(project: Pick<Project, 'objects'>, name: string, exceptId?: string): boolean {
  const key = name.trim().toLowerCase();
  return project.objects.some((o) => o.id !== exceptId && o.name.trim().toLowerCase() === key);
}

/** "Cube", "Cube 2", "Cube 3", ... — the first name not used by an object. */
export function uniqueObjectName(project: Pick<Project, 'objects'>, base: string): string {
  if (!isObjectNameTaken(project, base)) return base;
  let n = 2;
  while (isObjectNameTaken(project, `${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export function addObject(
  project: Project,
  kind: ObjectKind,
  options: { parentId?: string | null; name?: string; id?: string } = {},
): SceneObject {
  const parentId = options.parentId ?? null;
  if (parentId !== null && !findObject(project, parentId)) throw new UserError('The parent object no longer exists.');
  const requested = options.name ? validateName(options.name, 'Object') : DEFAULT_OBJECT_NAMES[kind];
  const name = isObjectNameTaken(project, requested) ? uniqueObjectName(project, requested) : requested;
  const obj = createSceneObject({ id: options.id ?? newId('obj'), name, kind, parentId });
  if (kind === 'group') obj.transform.position = [0, 0, 0];
  project.objects.push(obj);
  return obj;
}

export function renameObject(project: Project, id: string, name: string): void {
  const obj = findObject(project, id);
  if (!obj) throw new UserError('That object no longer exists.');
  const trimmed = validateName(name, 'Object');
  if (isObjectNameTaken(project, trimmed, id)) throw new UserError(`Another object is already named "${trimmed}". Object names must be unique.`);
  obj.name = trimmed;
}

/** Reparents an object. Throws if the target is the object itself or one of its descendants. */
export function setParent(project: Project, id: string, parentId: string | null): void {
  const obj = findObject(project, id);
  if (!obj) throw new UserError('That object no longer exists.');
  if (parentId !== null) {
    if (!findObject(project, parentId)) throw new UserError('The new parent does not exist.');
    if (subtreeOf(project, id).some((o) => o.id === parentId)) {
      throw new UserError('An object cannot be placed inside itself or one of its children.');
    }
  }
  obj.parentId = parentId;
}

/** Local variables of an object, plus the globals, in the order the UI shows them. */
export function variablesVisibleTo(project: Pick<Project, 'variables'>, targetId: string | null): ProjectVariable[] {
  return project.variables.filter((v) => v.scope === 'global' || (targetId !== null && v.ownerId === targetId));
}

/**
 * Duplicates an object and its descendants. Local variables are copied with new ids and
 * scripts referencing them are remapped; the copy is offset by one meter on X.
 */
export function duplicateObject(project: Project, id: string): SceneObject {
  const original = findObject(project, id);
  if (!original) throw new UserError('That object no longer exists.');
  const subtree = subtreeOf(project, id);
  const idMap = new Map<string, string>();
  for (const obj of subtree) idMap.set(obj.id, newId('obj'));

  const variableMap = new Map<string, string>();
  for (const v of project.variables) {
    if (v.scope === 'local' && idMap.has(v.ownerId ?? '')) {
      const copyId = newId('var');
      variableMap.set(v.id, copyId);
      project.variables.push({ ...structuredClone(v), id: copyId, ownerId: idMap.get(v.ownerId ?? '') ?? null });
    }
  }

  let copyOfRoot: SceneObject | undefined;
  for (const obj of subtree) {
    let scripts: ScriptsJSON = structuredClone(obj.scripts) as ScriptsJSON;
    for (const [oldVar, newVar] of variableMap) {
      scripts = remapFieldValues(scripts, 'VAR', new Map([[oldVar, newVar]]));
    }
    const copy: SceneObject = {
      ...structuredClone(obj),
      id: idMap.get(obj.id) as string,
      parentId: obj.id === id ? obj.parentId : (idMap.get(obj.parentId ?? '') ?? null),
      scripts: scripts as SceneObject['scripts'],
    };
    if (obj.id === id) {
      copy.name = uniqueObjectName(project, `${original.name}`.replace(/ \d+$/, ''));
      copy.transform.position = [obj.transform.position[0] + 1, obj.transform.position[1], obj.transform.position[2]];
      copyOfRoot = copy;
    } else {
      copy.name = uniqueObjectName(project, obj.name);
    }
    project.objects.push(copy);
  }
  return copyOfRoot as SceneObject;
}

/** Deletes an object with its descendants and their local variables. Returns deleted object ids. */
export function deleteObject(project: Project, id: string): string[] {
  const subtree = subtreeOf(project, id);
  if (subtree.length === 0) throw new UserError('That object no longer exists.');
  const removed = new Set(subtree.map((o) => o.id));
  project.objects = project.objects.filter((o) => !removed.has(o.id));
  project.variables = project.variables.filter((v) => !(v.scope === 'local' && v.ownerId !== null && removed.has(v.ownerId)));
  if (project.settings.stageCameraId && removed.has(project.settings.stageCameraId)) {
    project.settings.stageCameraId = null;
  }
  return [...removed];
}

export function setObjectTransformAxis(obj: SceneObject, field: 'position' | 'rotation' | 'scale', axis: 0 | 1 | 2, value: number): void {
  const vector = obj.transform[field] as Vec3;
  vector[axis] = value;
}

// ---------------------------------------------------------------- variables

export interface VariableInput {
  name: string;
  scope: VariableScope;
  ownerId: string | null;
  value: number | string | boolean;
}

/** Throws UserError if the name would be ambiguous in the given scope. */
export function assertVariableNameAvailable(project: Pick<Project, 'variables' | 'objects'>, name: string, scope: VariableScope, ownerId: string | null, exceptId?: string): void {
  const key = name.toLowerCase();
  const clash = (v: ProjectVariable): boolean => v.id !== exceptId && v.name.toLowerCase() === key;
  if (scope === 'global') {
    if (project.variables.some((v) => v.scope === 'global' && clash(v))) throw new UserError(`A global variable named "${name}" already exists.`);
    if (project.variables.some((v) => v.scope === 'local' && clash(v))) {
      throw new UserError(`An object already has a local variable named "${name}", so a global variable with this name would be ambiguous.`);
    }
  } else {
    if (project.variables.some((v) => v.scope === 'global' && clash(v))) {
      throw new UserError(`A global variable named "${name}" already exists. Local variables cannot share a global name.`);
    }
    if (project.variables.some((v) => v.scope === 'local' && v.ownerId === ownerId && clash(v))) {
      throw new UserError(`This object already has a local variable named "${name}".`);
    }
  }
}

export function addVariable(project: Project, input: VariableInput): ProjectVariable {
  const name = validateName(input.name, 'Variable');
  if (input.scope === 'local') {
    if (!input.ownerId || !findObject(project, input.ownerId)) throw new UserError('Local variables must belong to an existing object.');
  } else if (input.ownerId !== null) {
    throw new UserError('Global variables cannot have an owner.');
  }
  assertVariableNameAvailable(project, name, input.scope, input.ownerId);
  const variable: ProjectVariable = { id: newId('var'), name, scope: input.scope, ownerId: input.ownerId, value: input.value };
  project.variables.push(variable);
  return variable;
}

export function renameVariable(project: Project, id: string, name: string): void {
  const variable = project.variables.find((v) => v.id === id);
  if (!variable) throw new UserError('That variable no longer exists.');
  const trimmed = validateName(name, 'Variable');
  assertVariableNameAvailable(project, trimmed, variable.scope, variable.ownerId, id);
  variable.name = trimmed;
}

export function setVariableValue(project: Project, id: string, value: number | string | boolean): void {
  const variable = project.variables.find((v) => v.id === id);
  if (!variable) throw new UserError('That variable no longer exists.');
  variable.value = value;
}

/** Number of script blocks in the project that reference a variable. */
export function variableReferenceCount(project: Project, id: string): number {
  let count = countFieldReferences(project.stage.scripts, 'VAR', id);
  for (const obj of project.objects) count += countFieldReferences(obj.scripts, 'VAR', id);
  return count;
}

export function deleteVariable(project: Project, id: string): void {
  const before = project.variables.length;
  project.variables = project.variables.filter((v) => v.id !== id);
  if (project.variables.length === before) throw new UserError('That variable no longer exists.');
}

// ----------------------------------------------------------------- messages

export function addMessage(project: Project, name: string): ProjectMessage {
  const trimmed = validateName(name, 'Message');
  if (project.messages.some((m) => m.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new UserError(`A message named "${trimmed}" already exists.`);
  }
  const message: ProjectMessage = { id: newId('msg'), name: trimmed };
  project.messages.push(message);
  return message;
}

export function messageReferenceCount(project: Project, id: string): number {
  let count = countFieldReferences(project.stage.scripts, 'MESSAGE', id);
  for (const obj of project.objects) count += countFieldReferences(obj.scripts, 'MESSAGE', id);
  return count;
}

export function deleteMessage(project: Project, id: string): void {
  if (messageReferenceCount(project, id) > 0) {
    throw new UserError('This message is still used by blocks. Remove those blocks first.');
  }
  project.messages = project.messages.filter((m) => m.id !== id);
}

// ------------------------------------------------------------------- sounds

export function addSound(project: Project, name: string, assetId: string): ProjectSound {
  const trimmed = validateName(name, 'Sound');
  let unique = trimmed;
  let n = 2;
  while (project.sounds.some((s) => s.name.toLowerCase() === unique.toLowerCase())) {
    unique = `${trimmed} ${n}`;
    n += 1;
  }
  const sound: ProjectSound = { id: newId('snd'), name: unique, assetId };
  project.sounds.push(sound);
  return sound;
}

export function soundReferenceCount(project: Project, id: string): number {
  let count = countFieldReferences(project.stage.scripts, 'SOUND', id);
  for (const obj of project.objects) count += countFieldReferences(obj.scripts, 'SOUND', id);
  return count;
}

export function deleteSound(project: Project, id: string): void {
  if (soundReferenceCount(project, id) > 0) {
    throw new UserError('This sound is still used by blocks. Remove those blocks first.');
  }
  project.sounds = project.sounds.filter((s) => s.id !== id);
}
