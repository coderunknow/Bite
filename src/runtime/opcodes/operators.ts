import { valuesEqual } from '../values';
import type { OpContext } from '../context';
import type { BlockNode, Value } from '../../model/types';
import type { ReporterImpl } from './types';

function divide(ctx: OpContext, node: BlockNode, a: number, b: number): number {
  if (b === 0) throw ctx.error(node, 'Division by zero');
  return a / b;
}

function mathOp(ctx: OpContext, node: BlockNode, op: string, x: number): number {
  const deg = Math.PI / 180;
  let r: number;
  switch (op) {
    case 'abs':
      r = Math.abs(x);
      break;
    case 'floor':
      r = Math.floor(x);
      break;
    case 'ceiling':
      r = Math.ceil(x);
      break;
    case 'sqrt':
      r = Math.sqrt(x);
      break;
    case 'sin':
      r = Math.sin(x * deg);
      break;
    case 'cos':
      r = Math.cos(x * deg);
      break;
    case 'tan':
      r = Math.tan(x * deg);
      break;
    default:
      throw ctx.error(node, `Unknown math operation "${op}"`);
  }
  if (!Number.isFinite(r)) throw ctx.error(node, `${op} of ${x} is not a finite number`);
  return r;
}

export const operatorReporters: Record<string, ReporterImpl> = {
  operator_add: (ctx, n) => ctx.num(n, 'A') + ctx.num(n, 'B'),
  operator_subtract: (ctx, n) => ctx.num(n, 'A') - ctx.num(n, 'B'),
  operator_multiply: (ctx, n) => ctx.num(n, 'A') * ctx.num(n, 'B'),
  operator_divide: (ctx, n) => divide(ctx, n, ctx.num(n, 'A'), ctx.num(n, 'B')),
  operator_mod(ctx, n) {
    const a = ctx.num(n, 'A');
    const b = ctx.num(n, 'B');
    if (b === 0) throw ctx.error(n, 'Modulo by zero');
    const r = a % b;
    return r < 0 ? r + Math.abs(b) : r;
  },
  operator_round: (ctx, n) => Math.round(ctx.num(n, 'A')),
  operator_mathOp: (ctx, n) => mathOp(ctx, n, ctx.field(n, 'OP'), ctx.num(n, 'A')),
  operator_random(ctx, n) {
    const a = ctx.num(n, 'FROM');
    const b = ctx.num(n, 'TO');
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (Number.isInteger(lo) && Number.isInteger(hi)) return Math.floor(Math.random() * (hi - lo + 1)) + lo;
    return lo + Math.random() * (hi - lo);
  },
  operator_lt: (ctx, n) => ctx.num(n, 'A') < ctx.num(n, 'B'),
  operator_gt: (ctx, n) => ctx.num(n, 'A') > ctx.num(n, 'B'),
  operator_equals(ctx, n) {
    const a: Value = ctx.value(n, 'A');
    const b: Value = ctx.value(n, 'B');
    return valuesEqual(a, b);
  },
  operator_and: (ctx, n) => ctx.bool(n, 'A') && ctx.bool(n, 'B'),
  operator_or: (ctx, n) => ctx.bool(n, 'A') || ctx.bool(n, 'B'),
  operator_not: (ctx, n) => !ctx.bool(n, 'A'),
  operator_join: (ctx, n) => ctx.text(n, 'A') + ctx.text(n, 'B'),
  operator_length: (ctx, n) => [...ctx.text(n, 'A')].length,
};
