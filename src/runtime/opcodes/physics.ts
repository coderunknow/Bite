import type { Vec3 } from '../../model/types';
import type { OpContext } from '../context';
import type { BlockNode } from '../../model/types';
import { axisOf, type ReporterImpl, type StatementImpl } from './types';

function requireDynamic(ctx: OpContext, node: BlockNode): boolean {
  const o = ctx.requireObject(node);
  if (o.physics.bodyType === 'dynamic') return true;
  ctx.warn(node, `Ignored: "${o.name}" is not a dynamic body (set Body type to Dynamic in the Physics inspector)`);
  return false;
}

export const physicsStatements: Record<string, StatementImpl> = {
  physics_applyImpulse(ctx, node) {
    if (!requireDynamic(ctx, node)) return;
    const v: Vec3 = [ctx.num(node, 'X'), ctx.num(node, 'Y'), ctx.num(node, 'Z')];
    const cur = ctx.target.pendingImpulse ?? [0, 0, 0];
    ctx.target.pendingImpulse = [cur[0] + v[0], cur[1] + v[1], cur[2] + v[2]];
  },
  physics_setVelocity(ctx, node) {
    if (!requireDynamic(ctx, node)) return;
    ctx.target.pendingVelocity = [ctx.num(node, 'X'), ctx.num(node, 'Y'), ctx.num(node, 'Z')];
  },
};

export const physicsReporters: Record<string, ReporterImpl> = {
  physics_velocity(ctx, node) {
    ctx.requireObject(node);
    const v = ctx.runtime.physics.linearVelocity(ctx.target);
    if (!v) return 0;
    return v[axisOf(ctx, node, 'AXIS')];
  },
};
