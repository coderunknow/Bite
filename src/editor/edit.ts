/**
 * Pure project edits used by the UI. Every function returns a new Project and never mutates its input,
 * so the store can compare snapshots and undo support can be added without touching these rules.
 */
import { createSceneObject } from '../model/defaults';
import { newId } from '../model/ids';
import type { BlockNode, ObjectKind, Project, SceneObject, Script, Variable } from '../model/types';

export class EditError extends Error {}

/** "Base", "Base 2", "Base 3"... the first name not already taken (case-insensitive). */
export function uniqueName(base: string, taken: readonly string[]): string {
  const lower = new Set(taken.map((t) => t.toLowerCase()));
  const clean = base.trim() || 'Untitled';
  if (!lower.has(clean.toLowerCase())) return clean;
  for (let i = 2; ; i++) {
    const candidate = `${clean} ${i}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

function cloneProject(p: Project): Project {
  return structuredClone(p);
}

export function findObject(p: Project, id: string): SceneObject | undefined {
  return p.objects.find((o) => o.id === id);
}

export function childrenOf(p: Project, id: string): SceneObject[] {
  return p.objects.filter((o) => o.parentId === id);
}

/** The object plus all of its descendants, in project order. */
export function subtreeIds(p: Project, id: string): string[] {
  const out: string[] = [];
  const visit = (oid: string) => {
    out.push(oid);
    for (const c of childrenOf(p, oid)) visit(c.id);
  };
  visit(id);
  return out;
}

export function addObject(p: Project, kind: ObjectKind, parentId: string | null = null, now = new Date()): { project: Project; id: string } {
  const next = cloneProject(p);
  const base = createSceneObject(kind);
  const names = next.objects.map((o) => o.name);
  const obj: SceneObject = { ...base, name: uniqueName(base.name, names), parentId: parentId && findObject(next, parentId) ? parentId : null };
  if (kind === 'camera') obj.name = uniqueName('Camera', names);
  next.objects.push(obj);
  next.updatedAt = now.toISOString();
  return { project: next, id: obj.id };
}

export function patchObject(p: Project, id: string, patch: (o: SceneObject) => void, now = new Date()): Project {
  const next = cloneProject(p);
  const o = findObject(next, id);
  if (!o) throw new EditError('That object no longer exists.');
  patch(o);
  next.updatedAt = now.toISOString();
  return next;
}

export function renameObject(p: Project, id: string, name: string): Project {
  const trimmed = name.trim();
  if (!trimmed) throw new EditError('Names cannot be empty.');
  if (trimmed.length > 120) throw new EditError('Names are limited to 120 characters.');
  const others = p.objects.filter((o) => o.id !== id).map((o) => o.name);
  if (others.some((n) => n.toLowerCase() === trimmed.toLowerCase())) throw new EditError(`Another object is already called "${trimmed}".`);
  return patchObject(p, id, (o) => {
    o.name = trimmed;
  });
}

/** Deletes an object and its children. Scripts elsewhere that reference it will report a runtime error. */
export function deleteObject(p: Project, id: string, now = new Date()): Project {
  const remove = new Set(subtreeIds(p, id));
  const next = cloneProject(p);
  next.objects = next.objects.filter((o) => !remove.has(o.id));
  if (next.settings.activeCameraId && remove.has(next.settings.activeCameraId)) next.settings.activeCameraId = null;
  next.updatedAt = now.toISOString();
  return next;
}

/** Duplicates an object and its descendants with new ids (object, blocks, variables). */
export function duplicateObject(p: Project, id: string, now = new Date()): { project: Project; id: string } {
  const source = findObject(p, id);
  if (!source) throw new EditError('That object no longer exists.');
  const next = cloneProject(p);
  const idMap = new Map<string, string>();
  const ids = subtreeIds(p, id);
  for (const oid of ids) idMap.set(oid, newId());
  const names = next.objects.map((o) => o.name);
  let rootCopy = '';
  for (const oid of ids) {
    const orig = findObject(p, oid)!;
    const copy = structuredClone(orig);
    copy.id = idMap.get(oid)!;
    copy.parentId = oid === id ? orig.parentId : idMap.get(orig.parentId ?? '') ?? null;
    if (oid === id) {
      copy.name = uniqueName(`${orig.name} copy`, names);
      rootCopy = copy.id;
      copy.transform.position = [orig.transform.position[0] + 1, orig.transform.position[1], orig.transform.position[2]];
    }
    copy.variables = copy.variables.map((v) => ({ ...v, id: newId() }));
    remapVariableReferences(copy.scripts, copy.variables, orig.variables);
    copy.scripts = copy.scripts.map((s) => refreshScriptIds(s));
    next.objects.push(copy);
    names.push(copy.name);
  }
  next.updatedAt = now.toISOString();
  return { project: next, id: rootCopy };
}

/** Variable ids are regenerated on copy; references inside the copied object's scripts follow them. */
function remapVariableReferences(scripts: Script[], copiedVars: Variable[], originalVars: Variable[]): void {
  const map = new Map(originalVars.map((v, i) => [v.id, copiedVars[i]!.id]));
  const visit = (n: BlockNode) => {
    if (n.fields?.VARIABLE && map.has(String(n.fields.VARIABLE))) n.fields.VARIABLE = map.get(String(n.fields.VARIABLE))!;
    for (const v of Object.values(n.inputs ?? {})) if (typeof v === 'object') visit(v);
    for (const stack of Object.values(n.stacks ?? {})) stack.forEach(visit);
  };
  scripts.forEach((s) => s.nodes.forEach(visit));
}

/** Gives every block and script in a script a fresh id (used when copying). */
export function refreshScriptIds(script: Script): Script {
  const fresh = (n: BlockNode): BlockNode => {
    const out: BlockNode = { ...n, id: newId() };
    if (n.inputs) out.inputs = Object.fromEntries(Object.entries(n.inputs).map(([k, v]) => [k, typeof v === 'object' ? fresh(v) : v]));
    if (n.stacks) out.stacks = Object.fromEntries(Object.entries(n.stacks).map(([k, v]) => [k, v.map(fresh)]));
    return out;
  };
  return { ...script, id: newId(), nodes: script.nodes.map(fresh) };
}

/** Changes the parent. Refuses to create a cycle. */
export function setParent(p: Project, id: string, parentId: string | null, now = new Date()): Project {
  if (parentId !== null) {
    if (!findObject(p, parentId)) throw new EditError('The new parent does not exist.');
    if (subtreeIds(p, id).includes(parentId)) throw new EditError('An object cannot be placed inside itself.');
  }
  return patchObject(p, id, (o) => {
    o.parentId = parentId;
  }, now);
}

export function setScripts(p: Project, target: string, scripts: Script[], now = new Date()): Project {
  const next = cloneProject(p);
  if (target === 'stage') next.stage.scripts = scripts;
  else {
    const o = findObject(next, target);
    if (!o) return p;
    o.scripts = scripts;
  }
  next.updatedAt = now.toISOString();
  return next;
}

/** Variables of an object (target id) or of the stage ('stage'). */
export function variablesOf(p: Project, target: string): Variable[] {
  return target === 'stage' ? p.stage.variables : findObject(p, target)?.variables ?? [];
}

export function addVariable(p: Project, target: string, name: string, now = new Date()): Project {
  const next = cloneProject(p);
  const list = target === 'stage' ? next.stage.variables : findObject(next, target)?.variables;
  if (!list) throw new EditError('That target no longer exists.');
  const clean = uniqueName(name, list.map((v) => v.name));
  list.push({ id: newId(), name: clean, value: 0 });
  next.updatedAt = now.toISOString();
  return next;
}

export function patchVariable(p: Project, target: string, varId: string, patch: Partial<Pick<Variable, 'name' | 'value'>>, now = new Date()): Project {
  const next = cloneProject(p);
  const list = target === 'stage' ? next.stage.variables : findObject(next, target)?.variables;
  const v = list?.find((x) => x.id === varId);
  if (!list || !v) throw new EditError('That variable no longer exists.');
  if (patch.name !== undefined) {
    const clean = patch.name.trim();
    if (!clean) throw new EditError('Variable names cannot be empty.');
    if (list.some((x) => x.id !== varId && x.name.toLowerCase() === clean.toLowerCase())) throw new EditError(`A variable called "${clean}" already exists here.`);
    v.name = clean;
  }
  if (patch.value !== undefined) v.value = patch.value;
  next.updatedAt = now.toISOString();
  return next;
}

export function deleteVariable(p: Project, target: string, varId: string, now = new Date()): Project {
  const next = cloneProject(p);
  if (target === 'stage') next.stage.variables = next.stage.variables.filter((v) => v.id !== varId);
  else {
    const o = findObject(next, target);
    if (o) o.variables = o.variables.filter((v) => v.id !== varId);
  }
  next.updatedAt = now.toISOString();
  return next;
}

export function addMessage(p: Project, name: string, now = new Date()): Project {
  const clean = name.trim();
  if (!clean) throw new EditError('Message names cannot be empty.');
  if (clean.length > 120) throw new EditError('Message names are limited to 120 characters.');
  if (p.messages.includes(clean)) return p;
  const next = cloneProject(p);
  next.messages.push(clean);
  next.updatedAt = now.toISOString();
  return next;
}

/** Renames a broadcast message everywhere it is used. */
export function renameMessage(p: Project, from: string, to: string, now = new Date()): Project {
  const clean = to.trim();
  if (!clean) throw new EditError('Message names cannot be empty.');
  if (p.messages.includes(clean) && clean !== from) throw new EditError(`A message called "${clean}" already exists.`);
  const next = cloneProject(p);
  next.messages = next.messages.map((m) => (m === from ? clean : m));
  const rewrite = (scripts: Script[]) =>
    scripts.forEach((s) => s.nodes.forEach(function visit(n: BlockNode) {
      if ((n.opcode === 'event_broadcast' || n.opcode === 'event_broadcastandwait' || n.opcode === 'event_whenbroadcastreceived') && n.fields?.MESSAGE === from) n.fields.MESSAGE = clean;
      for (const v of Object.values(n.inputs ?? {})) if (typeof v === 'object') visit(v);
      for (const stack of Object.values(n.stacks ?? {})) stack.forEach(visit);
    }));
  rewrite(next.stage.scripts);
  next.objects.forEach((o) => rewrite(o.scripts));
  next.updatedAt = now.toISOString();
  return next;
}

export function deleteMessage(p: Project, name: string, now = new Date()): Project {
  const next = cloneProject(p);
  next.messages = next.messages.filter((m) => m !== name);
  next.updatedAt = now.toISOString();
  return next;
}
