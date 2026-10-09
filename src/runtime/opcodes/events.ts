import type { BlockNode } from '../../model/types';
import type { OpContext } from '../context';
import type { StatementImpl } from './types';

/** Hat blocks. They are never executed as statements; the runtime starts scripts when their event fires. */
export const HAT_OPCODES = new Set([
  'event_whenflagclicked',
  'event_whenkeypressed',
  'event_whenthisspriteclicked',
  'event_whenbroadcastreceived',
]);

export const HAT_TO_EVENT: Record<string, 'flag' | 'key' | 'click' | 'broadcast'> = {
  event_whenflagclicked: 'flag',
  event_whenkeypressed: 'key',
  event_whenthisspriteclicked: 'click',
  event_whenbroadcastreceived: 'broadcast',
};

export const eventStatements: Record<string, StatementImpl> = {
  event_broadcast(ctx, node) {
    ctx.runtime.broadcast(ctx.field(node, 'MESSAGE'));
  },
  event_broadcastandwait(ctx, node) {
    return broadcastAndWait(ctx, node);
  },
};

/** Starts every receiver and waits until all of them have finished (or were stopped). */
function* broadcastAndWait(ctx: OpContext, node: BlockNode): Generator<void, void, void> {
  const started = ctx.runtime.broadcast(ctx.field(node, 'MESSAGE'));
  while (started.some((t) => t.status === 'active')) yield;
}
