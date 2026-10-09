import { worldPosition } from '../../model/transform';
import { SUPPORTED_KEYS } from '../../model/types';
import { BlockError } from '../context';
import type { ReporterImpl, StatementImpl } from './types';

const KEY_SET = new Set<string>(SUPPORTED_KEYS);

const AXIS_INDEX: Record<'x' | 'y' | 'z', 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

export const sensingStatements: Record<string, StatementImpl> = {
  sensing_resetTimer(ctx) {
    ctx.runtime.state.timerStart = ctx.runtime.state.clock;
  },
};

export const sensingReporters: Record<string, ReporterImpl> = {
  sensing_keyPressed(ctx, node) {
    const key = ctx.field(node, 'KEY');
    if (!KEY_SET.has(key)) throw ctx.error(node, `Unknown key "${key}"`);
    return ctx.runtime.isKeyDown(key);
  },
  sensing_mouseDown(ctx) {
    return ctx.runtime.state.mouseDown;
  },
  sensing_touching(ctx, node) {
    const self = ctx.requireObject(node);
    const id = ctx.field(node, 'TARGET');
    if (id === '__any__') {
      for (const t of ctx.runtime.objectTargets()) {
        if (t.id !== self.id && ctx.runtime.isTouching(ctx.target, t)) return true;
      }
      return false;
    }
    const other = ctx.runtime.objectTarget(id);
    if (!other) throw ctx.error(node, 'The object to check no longer exists');
    if (other.id === self.id) return false;
    return ctx.runtime.isTouching(ctx.target, other);
  },
  sensing_distanceTo(ctx, node) {
    const self = ctx.requireObject(node);
    const other = ctx.runtime.objectTarget(ctx.field(node, 'TARGET'));
    if (!other) throw ctx.error(node, 'The object to measure to no longer exists');
    const a = worldPosition(ctx.runtime.objects, self.id);
    const b = worldPosition(ctx.runtime.objects, other.id);
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  },
  sensing_of(ctx, node) {
    const prop = ctx.field(node, 'PROPERTY');
    const target = ctx.runtime.objectTarget(ctx.field(node, 'TARGET'));
    if (!target?.object) throw new BlockError(node.id, 'The object to read no longer exists');
    const o = target.object;
    if (prop === 'x' || prop === 'y' || prop === 'z') return worldPosition(ctx.runtime.objects, o.id)[AXIS_INDEX[prop]];
    switch (prop) {
      case 'rx':
        return o.transform.rotation[0];
      case 'ry':
        return o.transform.rotation[1];
      case 'rz':
        return o.transform.rotation[2];
      case 'size':
        return ((o.transform.scale[0] + o.transform.scale[1] + o.transform.scale[2]) / 3) * 100;
      default:
        throw ctx.error(node, `Unknown property "${prop}"`);
    }
  },
  sensing_timer(ctx) {
    return ctx.runtime.state.clock - ctx.runtime.state.timerStart;
  },
};
