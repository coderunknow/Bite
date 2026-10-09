import type { OpContext } from '../context';
import type { ReporterImpl, StatementImpl } from './types';

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function touch(ctx: OpContext): void {
  ctx.target.poseDirty = true;
}

const MATERIAL_PROPS = ['metalness', 'roughness'] as const;

export const looksStatements: Record<string, StatementImpl> = {
  looks_show(ctx, node) {
    ctx.requireObject(node).visible = true;
  },
  looks_hide(ctx, node) {
    ctx.requireObject(node).visible = false;
  },
  looks_setColor(ctx, node) {
    ctx.requireObject(node).material.color = ctx.hex(node, 'COLOR');
  },
  looks_setOpacity(ctx, node) {
    ctx.requireObject(node).material.opacity = clamp(ctx.num(node, 'PERCENT') / 100, 0, 1);
  },
  looks_setSize(ctx, node) {
    const o = ctx.requireObject(node);
    const s = Math.max(0.01, ctx.num(node, 'PERCENT') / 100);
    o.transform.scale = [s, s, s];
    touch(ctx);
  },
  looks_changeSize(ctx, node) {
    const o = ctx.requireObject(node);
    const f = Math.max(0.01, 1 + ctx.num(node, 'PERCENT') / 100);
    o.transform.scale = o.transform.scale.map((c) => Math.max(0.01, c * f)) as [number, number, number];
    touch(ctx);
  },
  looks_setMaterial(ctx, node) {
    const o = ctx.requireObject(node);
    const prop = ctx.field(node, 'PROPERTY');
    if (!(MATERIAL_PROPS as readonly string[]).includes(prop)) throw ctx.error(node, `Unknown material property "${prop}"`);
    o.material[prop as 'metalness' | 'roughness'] = clamp(ctx.num(node, 'VALUE'), 0, 1);
  },
  looks_say(ctx, node) {
    ctx.requireObject(node);
    const text = ctx.text(node, 'MESSAGE');
    const secs = ctx.num(node, 'SECS');
    const clock = ctx.runtime.state.clock;
    ctx.target.says = { text, until: secs > 0 ? clock + secs : null };
  },
  looks_clearSay(ctx, node) {
    ctx.requireObject(node);
    ctx.target.says = null;
  },
};

export const looksReporters: Record<string, ReporterImpl> = {
  looks_isVisible(ctx, node) {
    return ctx.requireObject(node).visible;
  },
};
