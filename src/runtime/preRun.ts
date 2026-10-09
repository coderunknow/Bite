/**
 * Checks made just before a Play session starts, and preloading of project sounds.
 *
 * Pre-run issues are reported to the Console and attached to blocks in the code editor. They do not stop Run:
 * a broken block that is never reached is harmless, and the runtime still reports a broken block when it runs.
 */
import { getBlockSpec, type ArgSpec } from '../blocks/catalog';
import type { BlockNode, Project, Script } from '../model/types';
import { SUPPORTED_KEYS } from '../model/types';

export interface PreRunIssue {
  level: 'warning' | 'error';
  /** Target that owns the block, or null for project-level issues. */
  targetId: string | null;
  blockId: string | null;
  message: string;
}

/** Minimal audio surface used for preloading, so tests can pass a fake. */
export interface SoundLoader {
  load(soundId: string, bytes: ArrayBuffer): Promise<void>;
  hasBuffer(soundId: string): boolean;
  retain(soundIds: Iterable<string>): void;
}

export interface SoundSource {
  readSound(soundId: string): Promise<Blob | null>;
}

const NONE = '__none__';

type Dropdown = Extract<ArgSpec, { type: 'dropdown' }>;

interface Refs {
  objectIds: Set<string>;
  cameraIds: Set<string>;
  messages: Set<string>;
  soundIds: Set<string>;
  keys: Set<string>;
}

/** Validates the authored project for references and setup problems. Pure: never mutates the project. */
export function validateForRun(project: Project): PreRunIssue[] {
  const issues: PreRunIssue[] = [];
  const refs: Refs = {
    objectIds: new Set(project.objects.map((o) => o.id)),
    cameraIds: new Set(project.objects.filter((o) => o.kind === 'camera').map((o) => o.id)),
    messages: new Set(project.messages),
    soundIds: new Set(project.sounds.map((s) => s.id)),
    keys: new Set<string>([...SUPPORTED_KEYS, 'any']),
  };
  const objectById = new Map(project.objects.map((o) => [o.id, o]));

  const targets: { id: string; name: string; scripts: Script[]; variableIds: Set<string> }[] = [
    { id: 'stage', name: 'Stage', scripts: project.stage.scripts, variableIds: new Set(project.stage.variables.map((v) => v.id)) },
    ...project.objects.map((o) => ({
      id: o.id,
      name: o.name,
      scripts: o.scripts,
      variableIds: new Set([...o.variables.map((v) => v.id), ...project.stage.variables.map((v) => v.id)]),
    })),
  ];

  for (const t of targets) {
    for (const script of t.scripts) {
      walk(script.nodes, (node) => {
        const spec = getBlockSpec(node.opcode);
        if (!spec) {
          issues.push({ level: 'error', targetId: t.id, blockId: node.id, message: `Unknown block "${node.opcode}" in ${t.name}.` });
          return;
        }
        for (const [name, arg] of Object.entries(spec.args)) {
          if (arg.type !== 'dropdown') continue;
          const value = node.fields?.[name];
          const problem = checkDropdown(arg, value === undefined ? undefined : String(value), refs, t.variableIds);
          if (problem) issues.push({ level: 'error', targetId: t.id, blockId: node.id, message: `${spec.label.replace(/\{[^}]*\}/g, '…').trim()}: ${problem}` });
        }
      });
    }
  }

  for (const o of project.objects) {
    if (o.parentId && o.physics.bodyType !== 'none') {
      const parentExists = objectById.has(o.parentId);
      issues.push({
        level: 'warning',
        targetId: o.id,
        blockId: null,
        message: parentExists ? `"${o.name}" is a child object, so its physics is ignored. Physics applies to top-level objects only.` : `"${o.name}" refers to a parent that no longer exists.`,
      });
    }
  }
  const active = project.settings.activeCameraId;
  if (active && !refs.cameraIds.has(active)) {
    issues.push({ level: 'warning', targetId: null, blockId: null, message: 'The play camera was deleted. The stage camera will be used instead.' });
  }
  return issues;
}

function checkDropdown(arg: Dropdown, value: string | undefined, refs: Refs, variableIds: Set<string>): string | null {
  const src = arg.source;
  if (value === undefined || value === '') return 'no value is set.';
  if (value === NONE) {
    return src.kind === 'sounds' ? 'there are no sounds in this project. Add one in the Sounds tab.' : src.kind === 'variables' ? 'there are no variables. Add one in the Scene or Stage inspector.' : src.kind === 'messages' ? 'there are no messages. Add one in the Stage inspector.' : src.kind === 'cameras' ? 'there are no cameras. Add one with “+ Camera”.' : 'there is nothing to choose from.';
  }
  switch (src.kind) {
    case 'objects':
      return refs.objectIds.has(value) ? null : 'the object was deleted. Choose another one.';
    case 'objectsAndAny':
      return value === '__any__' || refs.objectIds.has(value) ? null : 'the object was deleted. Choose another one.';
    case 'cameras':
      return refs.cameraIds.has(value) ? null : 'the camera was deleted. Choose another one.';
    case 'variables':
      return variableIds.has(value) ? null : 'the variable was deleted. Choose another one.';
    case 'messages':
      return refs.messages.has(value) ? null : `the message "${value}" no longer exists.`;
    case 'sounds':
      return refs.soundIds.has(value) ? null : 'the sound was removed from the project. Choose another one.';
    case 'keys':
      return refs.keys.has(value) ? null : `"${value}" is not a supported key.`;
    case 'static':
      return src.options.some((o) => o.value === value) ? null : `"${value}" is not an available choice.`;
  }
}

function walk(nodes: BlockNode[], visit: (node: BlockNode) => void): void {
  for (const node of nodes) {
    visit(node);
    for (const v of Object.values(node.inputs ?? {})) {
      if (v && typeof v === 'object') walk([v], visit);
    }
    for (const stack of Object.values(node.stacks ?? {})) walk(stack, visit);
  }
}

/**
 * Loads every project sound into the audio engine before Run, so that play blocks do not wait on decoding.
 * Sounds that are missing from storage or fail to decode are reported, and the rest still load.
 * `isCurrent` lets a superseded Run (Stop or Reset pressed meanwhile) abandon the work.
 */
export async function preloadSounds(project: Project, audio: SoundLoader, source: SoundSource, isCurrent: () => boolean = () => true): Promise<PreRunIssue[]> {
  const issues: PreRunIssue[] = [];
  audio.retain(project.sounds.map((s) => s.id));
  for (const sound of project.sounds) {
    if (!isCurrent()) break;
    if (audio.hasBuffer(sound.id)) continue;
    try {
      const blob = await source.readSound(sound.id);
      if (!blob) {
        issues.push({ level: 'error', targetId: null, blockId: null, message: `The sound "${sound.name}" is missing from browser storage. Remove it and add it again.` });
        continue;
      }
      await audio.load(sound.id, await blob.arrayBuffer());
    } catch {
      issues.push({ level: 'error', targetId: null, blockId: null, message: `The sound "${sound.name}" could not be decoded. Use WAV, MP3, OGG, FLAC or M4A.` });
    }
  }
  return issues;
}
