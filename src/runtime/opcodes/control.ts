import type { BlockNode } from '../../model/types';
import { OpContext, ScriptStop } from '../context';
import { runStack } from '../runner';
import type { StatementImpl } from './types';

export const controlStatements: Record<string, StatementImpl> = {
  control_wait(ctx, node) {
    return waitSeconds(ctx, node);
  },
  control_waitUntil(ctx, node) {
    return waitUntil(ctx, node);
  },
  control_repeat(ctx, node) {
    return repeat(ctx, node);
  },
  control_forever(ctx, node) {
    return forever(ctx, node);
  },
  control_repeatUntil(ctx, node) {
    return repeatUntil(ctx, node);
  },
  control_if(ctx, node) {
    return ifThen(ctx, node);
  },
  control_ifElse(ctx, node) {
    return ifElse(ctx, node);
  },
  control_stop(ctx, node) {
    const option = ctx.field(node, 'OPTION');
    if (option === 'this') throw new ScriptStop();
    if (option === 'all') {
      ctx.runtime.requestStopAll();
      throw new ScriptStop();
    }
    if (option === 'others') {
      ctx.runtime.stopOtherThreadsOfTarget(ctx.thread);
      return;
    }
    throw ctx.error(node, `Unknown stop option "${option}"`);
  },
};

/** Waits at least one frame, then until the simulated clock reaches the end time. */
function* waitSeconds(ctx: OpContext, node: BlockNode): Generator<void, void, void> {
  const secs = Math.max(0, ctx.num(node, 'SECS'));
  const end = ctx.runtime.state.clock + secs;
  yield;
  while (ctx.runtime.state.clock < end) yield;
}

function* waitUntil(ctx: OpContext, node: BlockNode): Generator<void, void, void> {
  while (!ctx.bool(node, 'CONDITION')) yield;
}

function* repeat(ctx: OpContext, node: BlockNode): Generator<void, void, void> {
  const times = Math.round(ctx.num(node, 'TIMES'));
  const body = node.stacks?.BODY ?? [];
  for (let i = 0; i < times; i++) {
    yield* runStack(ctx, body);
    yield;
  }
}

function* forever(ctx: OpContext, node: BlockNode): Generator<void, void, void> {
  const body = node.stacks?.BODY ?? [];
  for (;;) {
    yield* runStack(ctx, body);
    yield;
  }
}

function* repeatUntil(ctx: OpContext, node: BlockNode): Generator<void, void, void> {
  const body = node.stacks?.BODY ?? [];
  while (!ctx.bool(node, 'CONDITION')) {
    yield* runStack(ctx, body);
    yield;
  }
}

function ifThen(ctx: OpContext, node: BlockNode): Generator<void, void, void> | void {
  if (!ctx.bool(node, 'CONDITION')) return;
  return runStack(ctx, node.stacks?.BODY ?? []);
}

function ifElse(ctx: OpContext, node: BlockNode): Generator<void, void, void> {
  const branch = ctx.bool(node, 'CONDITION') ? 'THEN' : 'ELSE';
  return runStack(ctx, node.stacks?.[branch] ?? []);
}
