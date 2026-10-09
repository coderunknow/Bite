import { forwardOf, worldPosition, yawTowards } from '../../model/transform';
import type { Vec3 } from '../../model/types';
import type { OpContext } from '../context';
import type { BlockNode } from '../../model/types';
import { axisOf, type ReporterImpl, type StatementImpl } from './types';

function touch(ctx: OpContext): void {
  ctx.target.poseDirty = true;
}

export const motionStatements: Record<string, StatementImpl> = {
  motion_moveForward(ctx, node) {
    const obj = ctx.requireObject(node);
    const d = ctx.num(node, 'DISTANCE');
    const f = forwardOf(obj.transform.rotation);
    const p = obj.transform.position;
    obj.transform.position = [p[0] + f[0] * d, p[1] + f[1] * d, p[2] + f[2] * d];
    touch(ctx);
  },
  motion_turn(ctx, node) {
    const obj = ctx.requireObject(node);
    const deg = ctx.num(node, 'DEGREES');
    const sign = ctx.field(node, 'DIRECTION') === 'left' ? 1 : -1;
    obj.transform.rotation[1] += sign * deg;
    touch(ctx);
  },
  motion_goTo(ctx, node) {
    const o = ctx.requireObject(node);
    const p: Vec3 = [ctx.num(node, 'X'), ctx.num(node, 'Y'), ctx.num(node, 'Z')];
    o.transform.position = p;
    touch(ctx);
  },
  motion_glide(ctx, node) {
    return glide(ctx, node);
  },
  motion_setPosition(ctx, node) {
    const obj = ctx.requireObject(node);
    const i = axisOf(ctx, node, 'AXIS');
    obj.transform.position[i] = ctx.num(node, 'VALUE');
    touch(ctx);
  },
  motion_changePosition(ctx, node) {
    const obj = ctx.requireObject(node);
    const i = axisOf(ctx, node, 'AXIS');
    obj.transform.position[i] += ctx.num(node, 'VALUE');
    touch(ctx);
  },
  motion_setRotation(ctx, node) {
    const obj = ctx.requireObject(node);
    const i = axisOf(ctx, node, 'AXIS');
    obj.transform.rotation[i] = ctx.num(node, 'VALUE');
    touch(ctx);
  },
  motion_changeRotation(ctx, node) {
    const obj = ctx.requireObject(node);
    const i = axisOf(ctx, node, 'AXIS');
    obj.transform.rotation[i] += ctx.num(node, 'VALUE');
    touch(ctx);
  },
  motion_pointTowards(ctx, node) {
    const obj = ctx.requireObject(node);
    const id = ctx.field(node, 'TARGET');
    const other = ctx.runtime.objectTarget(id);
    if (!other) throw ctx.error(node, 'The object to point towards no longer exists');
    if (other.id === obj.id) return;
    const from = worldPosition(ctx.runtime.objects, obj.id);
    const to = worldPosition(ctx.runtime.objects, other.id);
    obj.transform.rotation[1] = yawTowards(from, to);
    touch(ctx);
  },
};

function* glide(ctx: OpContext, node: BlockNode): Generator<void, void, void> {
  const o = ctx.requireObject(node);
  const secs = ctx.num(node, 'SECS');
  const end: Vec3 = [ctx.num(node, 'X'), ctx.num(node, 'Y'), ctx.num(node, 'Z')];
  if (!(secs > 0)) {
    o.transform.position = end;
    touch(ctx);
    return;
  }
  const start: Vec3 = [...o.transform.position];
  const t0 = ctx.runtime.state.clock;
  for (;;) {
    const p = Math.min(1, (ctx.runtime.state.clock - t0) / secs);
    o.transform.position = [0, 1, 2].map((i) => start[i]! + (end[i]! - start[i]!) * p) as Vec3;
    touch(ctx);
    if (p >= 1) return;
    yield;
  }
}

export const motionReporters: Record<string, ReporterImpl> = {
  motion_position(ctx, node) {
    const o = ctx.requireObject(node);
    const w = worldPosition(ctx.runtime.objects, o.id);
    return w[axisOf(ctx, node, 'AXIS')];
  },
  motion_rotation(ctx, node) {
    const o = ctx.requireObject(node);
    return o.transform.rotation[axisOf(ctx, node, 'AXIS')];
  },
};
