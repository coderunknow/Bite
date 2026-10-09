/**
 * Helpers for the Blockly serialization format used to store scripts.
 * `ScriptsJSON` is what Blockly's `serialization.workspaces.save` produces.
 * Runtime and validation both use `walkRawBlocks` / `parseScriptTree`, so the editor and
 * the runtime agree on the same data (see DESIGN_LOG.md, D-03).
 */
import type { ScriptsJSON } from './types';

export interface RawBlock {
  type: string;
  id?: string;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block?: RawBlock; shadow?: RawBlock }>;
  next?: { block?: RawBlock };
  x?: number;
  y?: number;
  [key: string]: unknown;
}

/** Returns all top-level blocks of a workspace (each is the root of a stack). */
export function topLevelRawBlocks(scripts: ScriptsJSON | undefined | null): RawBlock[] {
  const list = scripts?.blocks?.blocks;
  return Array.isArray(list) ? (list as RawBlock[]) : [];
}

/** Visits every block (including shadows, inputs and next chains) in a workspace. */
export function walkRawBlocks(scripts: ScriptsJSON | undefined | null, visit: (block: RawBlock) => void): void {
  const visitTree = (block: RawBlock | undefined): void => {
    let current = block;
    while (current) {
      visit(current);
      for (const input of Object.values(current.inputs ?? {})) {
        visitTree(input.block);
        visitTree(input.shadow);
      }
      current = current.next?.block;
    }
  };
  for (const root of topLevelRawBlocks(scripts)) visitTree(root);
}

/** Counts blocks that reference a given field value (e.g. a variable id) in a field name. */
export function countFieldReferences(scripts: ScriptsJSON | undefined | null, fieldName: string, value: string): number {
  let count = 0;
  walkRawBlocks(scripts, (block) => {
    if (block.fields && block.fields[fieldName] === value) count += 1;
  });
  return count;
}

/** Returns a deep copy of the scripts, with a field remapped wherever it matches `fieldName` and an old value. */
export function remapFieldValues(
  scripts: ScriptsJSON,
  fieldName: string,
  mapping: Map<string, string>,
  idMap?: Map<string, string>,
): ScriptsJSON {
  const copy = structuredClone(scripts);
  walkRawBlocks(copy, (block) => {
    if (block.fields && typeof block.fields[fieldName] === 'string') {
      const mapped = mapping.get(block.fields[fieldName] as string);
      if (mapped !== undefined) block.fields[fieldName] = mapped;
    }
    if (idMap && typeof block.id === 'string') {
      const mapped = idMap.get(block.id);
      if (mapped !== undefined) block.id = mapped;
    }
  });
  return copy;
}

/** A parsed block node (what the runtime and validator consume). */
export interface ScriptNode {
  id: string;
  type: string;
  fields: Record<string, unknown>;
  inputs: Record<string, ScriptNode | undefined>;
  next?: ScriptNode;
}

function parseRaw(raw: RawBlock, depth: number): ScriptNode {
  if (depth > 5000) throw new Error('Script is too deeply nested.');
  const inputs: Record<string, ScriptNode | undefined> = {};
  for (const [name, input] of Object.entries(raw.inputs ?? {})) {
    const child = input.block ?? input.shadow;
    inputs[name] = child ? parseRaw(child, depth + 1) : undefined;
  }
  return {
    id: typeof raw.id === 'string' ? raw.id : `anon_${depth}`,
    type: String(raw.type),
    fields: raw.fields ?? {},
    inputs,
    next: raw.next?.block ? parseRaw(raw.next.block, depth + 1) : undefined,
  };
}

/** Parses one top-level block (a stack root) into a ScriptNode tree. */
export function parseScriptTree(raw: RawBlock): ScriptNode {
  return parseRaw(raw, 0);
}
