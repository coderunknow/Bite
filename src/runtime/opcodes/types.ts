import type { BlockNode, Value } from '../../model/types';
import type { OpContext } from '../context';

/** Statement blocks either run synchronously or are generators that yield once per frame. */
export type StatementImpl = (ctx: OpContext, node: BlockNode) => Generator<void, void, void> | void;

/** Reporter and boolean blocks are synchronous and return a value. */
export type ReporterImpl = (ctx: OpContext, node: BlockNode) => Value;

export const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;
export type Axis = keyof typeof AXIS_INDEX;

export function axisOf(ctx: OpContext, node: BlockNode, name: string): 0 | 1 | 2 {
  const f = ctx.field(node, name);
  if (f !== 'x' && f !== 'y' && f !== 'z') throw ctx.error(node, `Unknown axis "${f}"`);
  return AXIS_INDEX[f];
}
