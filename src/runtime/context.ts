import { getBlockSpec, type ArgSpec } from '../blocks/catalog';
import type { BlockNode, Value } from '../model/types';
import type { Runtime } from './runtime';
import { normalizeHex, toBool, toNumberValue, toText } from './values';
import type { RuntimeTarget, Thread } from './types';

/** A user-facing error raised by a block. The runtime stops the script and highlights the block. */
export class BlockError extends Error {
  constructor(
    readonly blockId: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'BlockError';
  }
}

/** Internal control signal used to unwind a script ("stop this script"). Not an error. */
export class ScriptStop extends Error {
  constructor() {
    super('script stopped');
    this.name = 'ScriptStop';
  }
}

/** Maximum blocks a single thread may execute between two yields (guards against synchronous runaway). */
export const MAX_OPS_PER_STEP = 200_000;

/** Helper passed to every opcode implementation. It evaluates inputs and reports errors with block ids. */
export class OpContext {
  constructor(
    readonly runtime: Runtime,
    readonly thread: Thread,
  ) {}

  get target(): RuntimeTarget {
    return this.thread.target;
  }

  /** Throws a BlockError for the given block when the target is the stage (object-only blocks). */
  requireObject(node: BlockNode): NonNullable<RuntimeTarget['object']> {
    const obj = this.target.object;
    if (!obj) throw new BlockError(node.id, `"${labelOf(node.opcode)}" can only be used by objects, not the stage`);
    return obj;
  }

  spec(node: BlockNode) {
    return getBlockSpec(node.opcode);
  }

  /** Raw input value: a literal, the result of a nested reporter, or the spec default. */
  value(node: BlockNode, name: string): Value {
    const spec = getBlockSpec(node.opcode);
    const arg: ArgSpec | undefined = spec?.args[name];
    const input = node.inputs?.[name];
    if (input === undefined) {
      if (arg?.type === 'number') return arg.default;
      if (arg?.type === 'text') return arg.default;
      if (arg?.type === 'boolean') return false;
      throw new BlockError(node.id, `"${labelOf(node.opcode)}" is missing a value for ${name}`);
    }
    if (typeof input === 'object') {
      const reporter = this.runtime.reporterOf(input.opcode);
      if (!reporter) throw new BlockError(node.id, `"${labelOf(input.opcode)}" cannot be used as a value here`);
      return reporter(this, input);
    }
    return input;
  }

  num(node: BlockNode, name: string): number {
    const v = this.value(node, name);
    const n = toNumberValue(v);
    if (n === null) throw new BlockError(node.id, `"${labelOf(node.opcode)}" expects a number for ${name}, but got "${toText(v)}"`);
    return n;
  }

  text(node: BlockNode, name: string): string {
    return toText(this.value(node, name));
  }

  bool(node: BlockNode, name: string): boolean {
    return toBool(this.value(node, name));
  }

  /** Dropdown or other field value (the raw stored string). */
  field(node: BlockNode, name: string): string {
    const v = node.fields?.[name];
    if (v !== undefined) return String(v);
    const spec = getBlockSpec(node.opcode);
    const arg = spec?.args[name];
    if (arg?.type === 'dropdown' && arg.default !== undefined) return arg.default;
    if (arg?.type === 'dropdown' && arg.source.kind === 'static') return arg.source.options[0]!.value;
    throw new BlockError(node.id, `"${labelOf(node.opcode)}" has no ${name} selected`);
  }

  hex(node: BlockNode, name: string): string {
    const raw = this.text(node, name);
    const hex = normalizeHex(raw);
    if (!hex) throw new BlockError(node.id, `"${raw}" is not a colour. Use a hex value such as #ff6680`);
    return hex;
  }

  error(node: BlockNode, message: string): BlockError {
    return new BlockError(node.id, message);
  }

  /** Warnings are throttled by the diagnostics log (identical messages are folded). */
  warn(node: BlockNode, message: string): void {
    this.runtime.log.warn(message, this.runtime.state.clock, { targetId: this.target.id, targetName: this.target.name, blockId: node.id });
  }
}

/** Human-readable label of an opcode for messages. */
export function labelOf(opcode: string): string {
  const spec = getBlockSpec(opcode);
  return spec ? spec.label.replace(/\[([A-Z_]+)\]|\{([A-Z_]+)\}/g, (_m, a: string | undefined, b: string | undefined) => (a ?? b ?? '').toLowerCase()).replace(/\n/g, ' ') : opcode;
}
