/** Test helpers that build scripts in Blockly's serialization format, without a DOM. */
import type { RawBlock } from '../../src/core/scripts';
import type { ScriptsJSON } from '../../src/core/types';

let counter = 0;
const nextId = (): string => `b${++counter}`;

/** A block. `values` are literal shadow inputs; `inputs` are nested blocks (statements or reporters). */
export function blk(
  type: string,
  options: { fields?: Record<string, unknown>; values?: Record<string, unknown>; inputs?: Record<string, RawBlock | RawBlock[]>; id?: string } = {},
): RawBlock {
  const inputs: Record<string, { block?: RawBlock; shadow?: RawBlock }> = {};
  for (const [name, value] of Object.entries(options.values ?? {})) {
    inputs[name] = { shadow: typeof value === 'string' ? { type: 'bite_text', id: nextId(), fields: { TEXT: value } } : { type: 'bite_number', id: nextId(), fields: { NUM: value } } };
  }
  for (const [name, value] of Object.entries(options.inputs ?? {})) {
    inputs[name] = { block: Array.isArray(value) ? chain(...value) : value };
  }
  return { type, id: options.id ?? nextId(), fields: options.fields ?? {}, inputs };
}

/** A literal number in a value slot. */
export function num(value: number): RawBlock {
  return { type: 'bite_number', id: nextId(), fields: { NUM: value } };
}

export function txt(value: string): RawBlock {
  return { type: 'bite_text', id: nextId(), fields: { TEXT: value } };
}

/** Links blocks into one stack using `next`. Returns the first block. */
export function chain(...blocks: RawBlock[]): RawBlock {
  if (blocks.length === 0) throw new Error('empty chain');
  for (let i = 0; i < blocks.length - 1; i += 1) {
    blocks[i].next = { block: blocks[i + 1] };
  }
  return blocks[0];
}

/** A workspace with the given stacks. Each stack is an array of blocks linked in order. */
export function workspace(...stacks: RawBlock[][]): ScriptsJSON {
  return { blocks: { languageVersion: 0, blocks: stacks.map((stack) => chain(...stack)) } };
}
