/**
 * Dropdown options that depend on the project (objects, cameras, variables, messages, sounds).
 * The code editor reads this module when a dropdown opens, so the lists are always current.
 * Values that no longer exist in the project stay visible as "(missing)" so that opening a project
 * never silently rewrites a script.
 */
import { SUPPORTED_KEYS } from '../model/types';

export type OptionSource = 'objects' | 'objectsAndAny' | 'cameras' | 'variables' | 'messages' | 'sounds' | 'keys';

export type Options = [label: string, value: string][];

export interface ProjectOptions {
  objects: { id: string; name: string }[];
  cameras: { id: string; name: string }[];
  variables: { id: string; name: string }[];
  messages: string[];
  sounds: { id: string; name: string }[];
}

const EMPTY: ProjectOptions = { objects: [], cameras: [], variables: [], messages: [], sounds: [] };
let current: ProjectOptions = EMPTY;
const missing = new Map<OptionSource, Set<string>>();

export function setProjectOptions(next: ProjectOptions): void {
  current = next;
}

/** Remembers a value that was loaded from a script but is not in the project (kept visible, marked missing). */
export function noteMissing(source: OptionSource, value: string): void {
  if (!missing.has(source)) missing.set(source, new Set());
  missing.get(source)!.add(value);
}

export function clearMissing(): void {
  missing.clear();
}

const KEY_LABELS: Record<string, string> = {
  any: 'any key',
  space: 'space',
  enter: 'enter',
  'up arrow': 'up arrow',
  'down arrow': 'down arrow',
  'left arrow': 'left arrow',
  'right arrow': 'right arrow',
  shift: 'shift',
};

export function keyLabel(key: string): string {
  return KEY_LABELS[key] ?? key.toUpperCase();
}

function withMissing(source: OptionSource, base: Options): Options {
  const extras = missing.get(source);
  if (!extras) return base;
  const known = new Set(base.map(([, v]) => v));
  const out = [...base];
  for (const v of extras) if (!known.has(v)) out.push([`${v} (missing)`, v]);
  return out;
}

const PLACEHOLDER: Options = [['(none yet)', '__none__']];

/** Options for a dropdown source. Never empty (Blockly requires at least one option). */
export function optionsFor(source: OptionSource): Options {
  let base: Options;
  switch (source) {
    case 'keys':
      base = SUPPORTED_KEYS.map((k) => [keyLabel(k), k] as [string, string]);
      break;
    case 'objects':
      base = current.objects.map((o) => [o.name, o.id]);
      break;
    case 'objectsAndAny':
      base = [['any object', '__any__'], ...current.objects.map((o) => [o.name, o.id] as [string, string])];
      break;
    case 'cameras':
      base = current.cameras.map((o) => [o.name, o.id]);
      break;
    case 'variables':
      base = current.variables.map((v) => [v.name, v.id]);
      break;
    case 'messages':
      base = current.messages.map((m) => [m, m]);
      break;
    case 'sounds':
      base = current.sounds.map((s) => [s.name, s.id]);
      break;
  }
  const merged = withMissing(source, base);
  return merged.length > 0 ? merged : PLACEHOLDER;
}
