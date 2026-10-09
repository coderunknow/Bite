import { controlStatements } from './control';
import { eventStatements } from './events';
import { motionReporters, motionStatements } from './motion';
import { physicsReporters, physicsStatements } from './physics';
import { looksReporters, looksStatements } from './looks';
import { soundReporters, soundStatements } from './sound';
import { sensingReporters, sensingStatements } from './sensing';
import { operatorReporters } from './operators';
import { variableReporters, variableStatements } from './variables';
import { sceneStatements } from './scene';
import type { ReporterImpl, StatementImpl } from './types';

/** Implementations for every non-hat block in the catalog. Hats are dispatched by the runtime (events.ts). */
export const STATEMENTS: Readonly<Record<string, StatementImpl>> = {
  ...eventStatements,
  ...controlStatements,
  ...motionStatements,
  ...physicsStatements,
  ...looksStatements,
  ...soundStatements,
  ...variableStatements,
  ...sceneStatements,
  ...sensingStatements,
};

export const REPORTERS: Readonly<Record<string, ReporterImpl>> = {
  ...motionReporters,
  ...physicsReporters,
  ...looksReporters,
  ...soundReporters,
  ...sensingReporters,
  ...operatorReporters,
  ...variableReporters,
};
