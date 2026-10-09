import type { BlockNode, Variable } from '../../model/types';
import { BlockError, type OpContext } from '../context';
import { normalizeStoredValue, toNumberValue } from '../values';
import type { ReporterImpl, StatementImpl } from './types';

/** Object-local variables shadow global (stage) variables with the same id. */
function findVariable(ctx: OpContext, node: BlockNode): Variable {
  const id = ctx.field(node, 'VARIABLE');
  const v = ctx.target.variables.find((x) => x.id === id) ?? ctx.runtime.stage.variables.find((x) => x.id === id);
  if (!v) throw new BlockError(node.id, 'That variable does not exist (it may have been deleted)');
  return v;
}

export const variableStatements: Record<string, StatementImpl> = {
  data_setVariable(ctx, node) {
    const v = findVariable(ctx, node);
    v.value = normalizeStoredValue(ctx.value(node, 'VALUE'));
  },
  data_changeVariable(ctx, node) {
    const v = findVariable(ctx, node);
    const current = toNumberValue(v.value);
    if (current === null) throw ctx.error(node, `Variable "${v.name}" does not hold a number (it is "${String(v.value)}")`);
    v.value = current + ctx.num(node, 'VALUE');
  },
};

export const variableReporters: Record<string, ReporterImpl> = {
  data_variable(ctx, node) {
    return findVariable(ctx, node).value;
  },
};
