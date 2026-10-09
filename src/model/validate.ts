/**
 * Strict validation of untrusted project data (files, imports, recovered drafts).
 *
 * `validateProject` never throws. It returns either a fully typed project with optional warnings, or a
 * list of errors with JSON-path-like locations. Callers must not use data that failed validation.
 */
import { getBlockSpec, type BlockSpec } from '../blocks/catalog';
import {
  BODY_TYPES,
  COLLIDER_SHAPES,
  OBJECT_KINDS,
  PROJECT_FORMAT,
  PROJECT_FORMAT_VERSION,
  type BlockNode,
  type InputValue,
  type ObjectKind,
  type Project,
  type SceneObject,
  type Script,
  type SoundAsset,
  type Variable,
  type Vec3,
} from './types';

export const LIMITS = {
  maxObjects: 2000,
  maxBlocks: 50000,
  maxSounds: 500,
  maxNameLength: 120,
  maxMessageLength: 120,
  maxVariables: 2000,
  maxScripts: 5000,
} as const;

export const ALLOWED_SOUND_EXTENSIONS = ['wav', 'mp3', 'ogg', 'm4a', 'flac', 'aac', 'webm'] as const;

export interface ValidationResult {
  ok: boolean;
  project?: Project;
  errors: string[];
  warnings: string[];
}

type Obj = Record<string, unknown>;

class Collector {
  readonly errors: string[] = [];
  readonly warnings: string[] = [];
  error(path: string, message: string): void {
    if (this.errors.length < 200) this.errors.push(`${path}: ${message}`);
  }
  warn(path: string, message: string): void {
    if (this.warnings.length < 200) this.warnings.push(`${path}: ${message}`);
  }
}

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

function readString(c: Collector, obj: Obj, key: string, path: string, opts: { min?: number; max?: number; allowEmpty?: boolean } = {}): string {
  const v = obj[key];
  if (typeof v !== 'string') {
    c.error(`${path}.${key}`, 'must be a string');
    return '';
  }
  const min = opts.min ?? (opts.allowEmpty ? 0 : 1);
  if (v.length < min) c.error(`${path}.${key}`, 'must not be empty');
  if (opts.max !== undefined && v.length > opts.max) c.error(`${path}.${key}`, `must be at most ${opts.max} characters`);
  return v;
}

function readNumber(c: Collector, obj: Obj, key: string, path: string, min: number, max: number, fallback: number): number {
  const v = obj[key];
  if (!isFiniteNum(v)) {
    c.error(`${path}.${key}`, 'must be a finite number');
    return fallback;
  }
  if (v < min || v > max) {
    c.error(`${path}.${key}`, `must be between ${min} and ${max}`);
    return fallback;
  }
  return v;
}

function readBool(c: Collector, obj: Obj, key: string, path: string, fallback: boolean): boolean {
  const v = obj[key];
  if (typeof v !== 'boolean') {
    c.error(`${path}.${key}`, 'must be true or false');
    return fallback;
  }
  return v;
}

function readEnum<T extends string>(c: Collector, obj: Obj, key: string, path: string, values: readonly T[], fallback: T): T {
  const v = obj[key];
  if (typeof v !== 'string' || !(values as readonly string[]).includes(v)) {
    c.error(`${path}.${key}`, `must be one of ${values.join(', ')}`);
    return fallback;
  }
  return v as T;
}

function readVec3(c: Collector, v: unknown, path: string, fallback: Vec3, range: [number, number] = [-1e6, 1e6]): Vec3 {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(isFiniteNum)) {
    c.error(path, 'must be an array of three finite numbers');
    return [...fallback] as Vec3;
  }
  const out = v as Vec3;
  for (const n of out) {
    if (n < range[0] || n > range[1]) {
      c.error(path, `values must be between ${range[0]} and ${range[1]}`);
      return [...fallback] as Vec3;
    }
  }
  return [out[0], out[1], out[2]];
}

function readArray(c: Collector, obj: Obj, key: string, path: string): unknown[] {
  const v = obj[key];
  if (!Array.isArray(v)) {
    c.error(`${path}.${key}`, 'must be an array');
    return [];
  }
  return v;
}

/** Validates one block node (and its children). `ids` collects every block id for uniqueness. */
function validateNode(
  c: Collector,
  raw: unknown,
  path: string,
  ids: Set<string>,
  counter: { blocks: number },
  position: 'top' | 'input' | 'stack-member',
): BlockNode | null {
  if (!isObj(raw)) {
    c.error(path, 'must be a block object');
    return null;
  }
  counter.blocks++;
  if (counter.blocks > LIMITS.maxBlocks) {
    c.error(path, `project has more than ${LIMITS.maxBlocks} blocks`);
    return null;
  }
  const id = readString(c, raw, 'id', path, { max: 128 });
  if (id) {
    if (ids.has(id)) c.error(`${path}.id`, `duplicate block id "${id}"`);
    ids.add(id);
  }
  const opcode = readString(c, raw, 'opcode', path, { max: 128 });
  const spec: BlockSpec | undefined = opcode ? getBlockSpec(opcode) : undefined;
  if (opcode && !spec) c.error(`${path}.opcode`, `unknown block type "${opcode}"`);
  if (spec) {
    if (position === 'top' && spec.shape === 'reporter') c.error(path, `reporter "${opcode}" cannot be a stack block`);
    if (position === 'top' && spec.shape === 'boolean') c.error(path, `boolean "${opcode}" cannot be a stack block`);
    if (position === 'input' && spec.shape !== 'reporter' && spec.shape !== 'boolean') c.error(path, `"${opcode}" is a command and cannot be placed in an input`);
    if (position === 'stack-member' && (spec.shape === 'reporter' || spec.shape === 'boolean')) c.error(path, `reporter "${opcode}" cannot be a stack block`);
    if (spec.shape === 'hat' && position !== 'top') c.error(path, 'event hat blocks can only start a script');
  }
  const node: BlockNode = { id, opcode };

  if (raw.fields !== undefined) {
    if (!isObj(raw.fields)) c.error(`${path}.fields`, 'must be an object');
    else {
      const fields: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(raw.fields)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          if (typeof v === 'number' && !Number.isFinite(v)) c.error(`${path}.fields.${k}`, 'must be finite');
          else fields[k] = v;
        } else c.error(`${path}.fields.${k}`, 'must be a string, number or boolean');
      }
      if (Object.keys(fields).length) node.fields = fields;
      if (spec) for (const k of Object.keys(fields)) if (!(k in spec.args)) c.warn(`${path}.fields.${k}`, `unknown field for "${opcode}" (ignored)`);
    }
  }

  if (raw.inputs !== undefined) {
    if (!isObj(raw.inputs)) c.error(`${path}.inputs`, 'must be an object');
    else {
      const inputs: Record<string, InputValue> = {};
      for (const [k, v] of Object.entries(raw.inputs)) {
        const p = `${path}.inputs.${k}`;
        if (typeof v === 'string' || typeof v === 'boolean') inputs[k] = v;
        else if (typeof v === 'number') {
          if (Number.isFinite(v)) inputs[k] = v;
          else c.error(p, 'must be finite');
        } else if (isObj(v)) {
          const child = validateNode(c, v, p, ids, counter, 'input');
          if (child) inputs[k] = child;
        } else c.error(p, 'must be a literal or a block');
        if (spec && !(k in spec.args)) c.warn(p, `unknown input for "${opcode}" (ignored)`);
      }
      if (Object.keys(inputs).length) node.inputs = inputs;
    }
  }

  if (raw.stacks !== undefined) {
    if (!isObj(raw.stacks)) c.error(`${path}.stacks`, 'must be an object');
    else {
      const stacks: Record<string, BlockNode[]> = {};
      for (const [k, v] of Object.entries(raw.stacks)) {
        const p = `${path}.stacks.${k}`;
        if (!Array.isArray(v)) {
          c.error(p, 'must be an array of blocks');
          continue;
        }
        stacks[k] = [];
        v.forEach((member, i) => {
          const child = validateNode(c, member, `${p}[${i}]`, ids, counter, 'stack-member');
          if (child) stacks[k]!.push(child);
        });
        if (spec && !(k in spec.args)) c.warn(p, `unknown statement input for "${opcode}" (ignored)`);
      }
      if (Object.keys(stacks).length) node.stacks = stacks;
    }
  }

  // Missing value inputs and empty C-block bodies are valid: the runtime uses the spec defaults / empty stacks.
  return node;
}

function validateScripts(c: Collector, raw: unknown[], path: string, ids: Set<string>, counter: { blocks: number }, target: 'object' | 'stage'): Script[] {
  const scripts: Script[] = [];
  if (raw.length > LIMITS.maxScripts) c.error(path, `more than ${LIMITS.maxScripts} scripts`);
  raw.forEach((rawScript, i) => {
    const p = `${path}[${i}]`;
    if (!isObj(rawScript)) return c.error(p, 'must be a script object');
    const id = readString(c, rawScript, 'id', p, { max: 128 });
    if (id) {
      if (ids.has(id)) c.error(`${p}.id`, `duplicate id "${id}"`);
      ids.add(id);
    }
    const pos = isObj(rawScript.position) ? rawScript.position : {};
    const x = readNumber(c, pos, 'x', `${p}.position`, -1e6, 1e6, 0);
    const y = readNumber(c, pos, 'y', `${p}.position`, -1e6, 1e6, 0);
    const nodes: BlockNode[] = [];
    const rawNodes = Array.isArray(rawScript.nodes) ? rawScript.nodes : (c.error(`${p}.nodes`, 'must be an array of blocks'), []);
    rawNodes.forEach((rawNode, j) => {
      const child = validateNode(c, rawNode, `${p}.nodes[${j}]`, ids, counter, 'top');
      if (child) nodes.push(child);
    });
    for (const n of nodes) {
      const spec = getBlockSpec(n.opcode);
      if (spec && !spec.targets.includes(target)) c.warn(p, `"${spec.label}" is not available for ${target === 'stage' ? 'the stage' : 'objects'} and will report an error when run`);
    }
    scripts.push({ id, position: { x, y }, nodes });
  });
  return scripts;
}

function validateVariables(c: Collector, raw: unknown[], path: string, ids: Set<string>): Variable[] {
  const vars: Variable[] = [];
  const names = new Set<string>();
  if (raw.length > LIMITS.maxVariables) c.error(path, `more than ${LIMITS.maxVariables} variables`);
  raw.forEach((rawVar, i) => {
    const p = `${path}[${i}]`;
    if (!isObj(rawVar)) return c.error(p, 'must be a variable object');
    const id = readString(c, rawVar, 'id', p, { max: 128 });
    if (id) {
      if (ids.has(id)) c.error(`${p}.id`, `duplicate id "${id}"`);
      ids.add(id);
    }
    const name = readString(c, rawVar, 'name', p, { max: LIMITS.maxNameLength });
    if (name && names.has(name)) c.error(`${p}.name`, `duplicate variable name "${name}" in this scope`);
    names.add(name);
    const v: unknown = rawVar.value;
    if (typeof v === 'number' && Number.isFinite(v)) vars.push({ id, name, value: v });
    else if (typeof v === 'string' || typeof v === 'boolean') vars.push({ id, name, value: v });
    else c.error(`${p}.value`, 'must be a finite number, string or boolean');
  });
  return vars;
}

function validateObjects(c: Collector, raw: unknown[], ids: Set<string>, counter: { blocks: number }): SceneObject[] {
  if (raw.length > LIMITS.maxObjects) c.error('objects', `more than ${LIMITS.maxObjects} objects`);
  const objects: SceneObject[] = [];
  raw.forEach((rawObj, i) => {
    const p = `objects[${i}]`;
    if (!isObj(rawObj)) return c.error(p, 'must be an object');
    const id = readString(c, rawObj, 'id', p, { max: 128 });
    if (id) {
      if (ids.has(id)) c.error(`${p}.id`, `duplicate id "${id}"`);
      ids.add(id);
    }
    const name = readString(c, rawObj, 'name', p, { max: LIMITS.maxNameLength });
    const kind = readEnum<ObjectKind>(c, rawObj, 'kind', p, OBJECT_KINDS, 'group');
    const parentId = rawObj.parentId === null || rawObj.parentId === undefined ? null : typeof rawObj.parentId === 'string' ? rawObj.parentId : (c.error(`${p}.parentId`, 'must be a string or null'), null);
    const visible = readBool(c, rawObj, 'visible', p, true);

    const tr = isObj(rawObj.transform) ? rawObj.transform : (c.error(`${p}.transform`, 'must be an object'), {});
    const transform = {
      position: readVec3(c, tr.position, `${p}.transform.position`, [0, 0, 0], [-1e5, 1e5]),
      rotation: readVec3(c, tr.rotation, `${p}.transform.rotation`, [0, 0, 0], [-1e5, 1e5]),
      scale: readVec3(c, tr.scale, `${p}.transform.scale`, [1, 1, 1], [-1000, 1000]),
    };

    const mt = isObj(rawObj.material) ? rawObj.material : (c.error(`${p}.material`, 'must be an object'), {});
    const material = {
      color: isHex(mt.color) ? mt.color : (c.error(`${p}.material.color`, 'must be a #rrggbb colour'), '#999999'),
      opacity: readNumber(c, mt, 'opacity', `${p}.material`, 0, 1, 1),
      metalness: readNumber(c, mt, 'metalness', `${p}.material`, 0, 1, 0),
      roughness: readNumber(c, mt, 'roughness', `${p}.material`, 0, 1, 0.6),
    };

    const ph = isObj(rawObj.physics) ? rawObj.physics : (c.error(`${p}.physics`, 'must be an object'), {});
    const physics = {
      bodyType: readEnum(c, ph, 'bodyType', `${p}.physics`, BODY_TYPES, 'none'),
      shape: readEnum(c, ph, 'shape', `${p}.physics`, COLLIDER_SHAPES, 'auto'),
      mass: readNumber(c, ph, 'mass', `${p}.physics`, 0.001, 1e6, 1),
      friction: readNumber(c, ph, 'friction', `${p}.physics`, 0, 10, 0.6),
      restitution: readNumber(c, ph, 'restitution', `${p}.physics`, 0, 1, 0.2),
      gravityScale: readNumber(c, ph, 'gravityScale', `${p}.physics`, -10, 10, 1),
      lockRotation: readBool(c, ph, 'lockRotation', `${p}.physics`, false),
    };

    let light: SceneObject['light'] = null;
    if (rawObj.light !== null && rawObj.light !== undefined) {
      if (!isObj(rawObj.light)) c.error(`${p}.light`, 'must be an object or null');
      else light = {
        kind: readEnum(c, rawObj.light, 'kind', `${p}.light`, ['directional', 'point'] as const, 'directional'),
        intensity: readNumber(c, rawObj.light, 'intensity', `${p}.light`, 0, 100, 1),
      };
    }
    if (kind === 'light' && !light) light = { kind: 'directional', intensity: 1 };
    if (kind !== 'light' && light) c.warn(`${p}.light`, 'light settings on a non-light object (ignored)');

    let camera: SceneObject['camera'] = null;
    if (rawObj.camera !== null && rawObj.camera !== undefined) {
      if (!isObj(rawObj.camera)) c.error(`${p}.camera`, 'must be an object or null');
      else camera = { fov: readNumber(c, rawObj.camera, 'fov', `${p}.camera`, 10, 120, 50) };
    }
    if (kind === 'camera' && !camera) camera = { fov: 50 };

    const variables = validateVariables(c, Array.isArray(rawObj.variables) ? rawObj.variables : (c.error(`${p}.variables`, 'must be an array'), []), `${p}.variables`, ids);
    const scripts = validateScripts(c, Array.isArray(rawObj.scripts) ? rawObj.scripts : (c.error(`${p}.scripts`, 'must be an array'), []), `${p}.scripts`, ids, counter, 'object');

    objects.push({
      id,
      name,
      kind,
      parentId,
      visible,
      transform,
      material,
      physics,
      light,
      camera,
      variables,
      scripts,
    });
  });

  // Parent references must exist and must not form cycles.
  const byId = new Map(objects.map((o) => [o.id, o]));
  for (const o of objects) {
    if (o.parentId && !byId.has(o.parentId)) c.error(`objects["${o.name}"].parentId`, `refers to missing object "${o.parentId}"`);
    const seen = new Set<string>([o.id]);
    let cur = o.parentId ? byId.get(o.parentId) : undefined;
    while (cur) {
      if (seen.has(cur.id)) {
        c.error(`objects["${o.name}"].parentId`, 'creates a parent cycle');
        break;
      }
      seen.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
  }
  return objects;
}

function validateSounds(c: Collector, raw: unknown[], ids: Set<string>): SoundAsset[] {
  if (raw.length > LIMITS.maxSounds) c.error('sounds', `more than ${LIMITS.maxSounds} sounds`);
  const sounds: SoundAsset[] = [];
  raw.forEach((rawSound, i) => {
    const p = `sounds[${i}]`;
    if (!isObj(rawSound)) return c.error(p, 'must be an object');
    const id = readString(c, rawSound, 'id', p, { max: 128 });
    if (id) {
      if (ids.has(id)) c.error(`${p}.id`, `duplicate id "${id}"`);
      ids.add(id);
    }
    const name = readString(c, rawSound, 'name', p, { max: LIMITS.maxNameLength });
    const ext = readString(c, rawSound, 'extension', p, { max: 8 }).toLowerCase();
    if (ext && !(ALLOWED_SOUND_EXTENSIONS as readonly string[]).includes(ext)) c.error(`${p}.extension`, `unsupported audio type "${ext}"`);
    const mimeType = readString(c, rawSound, 'mimeType', p, { max: 100, allowEmpty: true });
    const byteLength = readNumber(c, rawSound, 'byteLength', p, 0, 512 * 1024 * 1024, 0);
    const dur = rawSound.durationSec;
    const durationSec = dur === null || dur === undefined ? null : isFiniteNum(dur) && dur >= 0 ? dur : (c.error(`${p}.durationSec`, 'must be a non-negative number or null'), null);
    const builtIn = readBool(c, rawSound, 'builtIn', p, false);
    sounds.push({ id, name, extension: ext, mimeType, byteLength: Math.round(byteLength), durationSec, builtIn });
  });
  return sounds;
}

/**
 * Validates an untrusted value against the project format. Never throws.
 */
export function validateProject(input: unknown): ValidationResult {
  const c = new Collector();
  if (!isObj(input)) {
    c.error('$', 'the file does not contain a JSON object');
    return { ok: false, errors: c.errors, warnings: c.warnings };
  }
  if (input.format !== PROJECT_FORMAT) {
    c.error('format', `expected "${PROJECT_FORMAT}" but found ${JSON.stringify(input.format)}; this is not a Bite project file`);
    return { ok: false, errors: c.errors, warnings: c.warnings };
  }
  if (input.formatVersion !== PROJECT_FORMAT_VERSION) {
    c.error('formatVersion', `unsupported project format version ${JSON.stringify(input.formatVersion)} (this app reads version ${PROJECT_FORMAT_VERSION})`);
    return { ok: false, errors: c.errors, warnings: c.warnings };
  }

  const id = readString(c, input, 'id', '$', { max: 128 });
  const name = readString(c, input, 'name', '$', { max: LIMITS.maxNameLength });
  const appVersion = readString(c, input, 'appVersion', '$', { allowEmpty: true, max: 64 });
  const createdAt = readString(c, input, 'createdAt', '$', { max: 64, allowEmpty: true });
  const updatedAt = readString(c, input, 'updatedAt', '$', { max: 64, allowEmpty: true });

  const st = isObj(input.settings) ? input.settings : (c.error('settings', 'must be an object'), {});
  const sc = isObj(st.stageCamera) ? st.stageCamera : (c.error('settings.stageCamera', 'must be an object'), {});
  const settings: Project['settings'] = {
    gravity: readVec3(c, st.gravity, 'settings.gravity', [0, -9.81, 0], [-1000, 1000]),
    backgroundColor: isHex(st.backgroundColor) ? st.backgroundColor : (c.error('settings.backgroundColor', 'must be a #rrggbb colour'), '#1d2433'),
    shadows: readBool(c, st, 'shadows', 'settings', true),
    stageCamera: {
      position: readVec3(c, sc.position, 'settings.stageCamera.position', [0, 4, 12]),
      target: readVec3(c, sc.target, 'settings.stageCamera.target', [0, 1, 0]),
      fov: readNumber(c, sc, 'fov', 'settings.stageCamera', 10, 120, 50),
    },
    activeCameraId: st.activeCameraId === null || st.activeCameraId === undefined ? null : typeof st.activeCameraId === 'string' ? st.activeCameraId : (c.error('settings.activeCameraId', 'must be a string or null'), null),
    masterVolume: readNumber(c, st, 'masterVolume', 'settings', 0, 100, 100),
  };

  const ids = new Set<string>();
  const counter = { blocks: 0 };

  const stageRaw = isObj(input.stage) ? input.stage : (c.error('stage', 'must be an object'), {});
  if (stageRaw.id !== 'stage') c.error('stage.id', 'must be "stage"');
  if (typeof stageRaw.id === 'string' && ids.has(stageRaw.id)) c.error('stage.id', 'duplicate id');
  ids.add('stage');
  const stage: Project['stage'] = {
    id: 'stage',
    name: readString(c, stageRaw, 'name', 'stage', { max: LIMITS.maxNameLength, allowEmpty: true }) || 'Stage',
    variables: validateVariables(c, Array.isArray(stageRaw.variables) ? stageRaw.variables : (c.error('stage.variables', 'must be an array'), []), 'stage.variables', ids),
    scripts: validateScripts(c, Array.isArray(stageRaw.scripts) ? stageRaw.scripts : (c.error('stage.scripts', 'must be an array'), []), 'stage.scripts', ids, counter, 'stage'),
  };

  const objects = validateObjects(c, readArray(c, input, 'objects', '$'), ids, counter);
  if (settings.activeCameraId && !objects.some((o) => o.id === settings.activeCameraId && o.kind === 'camera')) {
    c.warn('settings.activeCameraId', 'the active camera object does not exist; the stage camera will be used');
    settings.activeCameraId = null;
  }

  const messages: string[] = [];
  const rawMessages = readArray(c, input, 'messages', '$');
  rawMessages.forEach((m, i) => {
    if (typeof m !== 'string' || m.length === 0 || m.length > LIMITS.maxMessageLength) c.error(`messages[${i}]`, 'must be a non-empty string');
    else if (messages.includes(m)) c.error(`messages[${i}]`, `duplicate message "${m}"`);
    else messages.push(m);
  });

  const soundIds = new Set<string>();
  const sounds = validateSounds(c, readArray(c, input, 'sounds', '$'), soundIds);

  // Sound references in dropdown fields must point to existing sounds (otherwise the blocks cannot run).
  const checkSoundRefs = (nodes: BlockNode[], path: string) => {
    for (const n of nodes) {
      const spec = getBlockSpec(n.opcode);
      if (spec && 'SOUND' in spec.args && n.fields?.SOUND !== undefined && typeof n.fields.SOUND === 'string' && !soundIds.has(n.fields.SOUND) && n.fields.SOUND !== '') {
        c.warn(path, `sound "${n.fields.SOUND}" does not exist in this project`);
      }
    }
  };
  const walk = (scripts: Script[], path: string) => scripts.forEach((s, i) => s.nodes.forEach((n) => checkSoundRefs([n], `${path}[${i}]`)));
  walk(stage.scripts, 'stage.scripts');
  objects.forEach((o) => walk(o.scripts, `objects["${o.name}"].scripts`));

  const project: Project = {
    format: PROJECT_FORMAT,
    formatVersion: PROJECT_FORMAT_VERSION,
    appVersion,
    id,
    name,
    createdAt,
    updatedAt,
    settings,
    stage,
    objects,
    messages,
    sounds,
  };

  if (c.errors.length) return { ok: false, errors: c.errors, warnings: c.warnings };
  return { ok: true, project, errors: [], warnings: c.warnings };
}

/** Catalog-driven check used by tests and the editor: the set of block opcodes a project uses. */
export function usedOpcodes(project: Project): Set<string> {
  const out = new Set<string>();
  const visit = (n: BlockNode) => {
    out.add(n.opcode);
    for (const v of Object.values(n.inputs ?? {})) if (typeof v === 'object') visit(v);
    for (const stack of Object.values(n.stacks ?? {})) stack.forEach(visit);
  };
  const scan = (scripts: Script[]) => scripts.forEach((s) => s.nodes.forEach(visit));
  scan(project.stage.scripts);
  project.objects.forEach((o) => scan(o.scripts));
  return out;
}

