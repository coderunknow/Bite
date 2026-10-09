import { BlockError, type OpContext } from '../context';
import type { BlockNode } from '../../model/types';
import type { StatementImpl } from './types';

function requireCamera(ctx: OpContext, node: BlockNode, id: string): string {
  const cam = ctx.runtime.objectTarget(id)?.object;
  if (!cam || cam.kind !== 'camera') throw new BlockError(node.id, 'That camera does not exist (it may have been deleted)');
  return cam.id;
}

export const sceneStatements: Record<string, StatementImpl> = {
  scene_setGravity(ctx, node) {
    ctx.runtime.setGravity([ctx.num(node, 'X'), ctx.num(node, 'Y'), ctx.num(node, 'Z')]);
  },
  scene_setBackground(ctx, node) {
    ctx.runtime.state.backgroundColor = ctx.hex(node, 'COLOR');
  },
  scene_useCamera(ctx, node) {
    ctx.runtime.state.activeCameraId = requireCamera(ctx, node, ctx.field(node, 'CAMERA'));
  },
  scene_resetCamera(ctx) {
    ctx.runtime.state.activeCameraId = null;
  },
};
