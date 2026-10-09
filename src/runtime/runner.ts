import type { BlockNode } from '../model/types';
import { getBlockSpec } from '../blocks/catalog';
import { BlockError, MAX_OPS_PER_STEP, type OpContext } from './context';
import { STATEMENTS } from './opcodes';
import { HAT_OPCODES } from './opcodes/events';

/** Runs a stack of statement blocks in order. Yields (suspends the script) only where a block yields. */
export function* runStack(ctx: OpContext, nodes: readonly BlockNode[]): Generator<void, void, void> {
  for (const node of nodes) yield* runBlock(ctx, node);
}

function* runBlock(ctx: OpContext, node: BlockNode): Generator<void, void, void> {
  const thread = ctx.thread;
  const spec = getBlockSpec(node.opcode);
  if (!spec) throw new BlockError(node.id, `Unknown block "${node.opcode}"`);
  if (HAT_OPCODES.has(node.opcode)) throw new BlockError(node.id, 'An event block must be the first block of a script');
  if (spec.shape === 'reporter' || spec.shape === 'boolean') throw new BlockError(node.id, `"${spec.label}" must be placed in an input, not run as a block`);
  if (!spec.targets.includes(ctx.target.isStage ? 'stage' : 'object')) {
    throw new BlockError(node.id, `"${spec.label.replace(/\[|\]|\{|\}/g, '')}" is not available for ${ctx.target.isStage ? 'the stage' : 'objects'}`);
  }
  thread.opsThisStep += 1;
  if (thread.opsThisStep > MAX_OPS_PER_STEP) {
    throw new BlockError(node.id, 'Script ran too many blocks without waiting. Add a wait or a loop with a delay.');
  }
  thread.currentBlockId = node.id;
  const op = STATEMENTS[node.opcode];
  if (!op) throw new BlockError(node.id, `"${node.opcode}" has no runtime implementation`);
  const result = op(ctx, node);
  if (result) yield* result;
}
