import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { appendOnlyLog, type AppendOnlyLogFacetData } from './algorithm.js';
import { appendOnlyLogScene } from './scene.js';
import { appendOnlyLogStageView } from './append-only-log-stage.js';
import { appendOnlyLogIRs } from './irs.js';
import { appendOnlyLogFacet } from './facet.js';

export { appendOnlyLog, narrowAppendOnlyLogData } from './algorithm.js';
export type { AppendOnlyLogFacetData, LogRecord } from './algorithm.js';
export { appendOnlyLogScene } from './scene.js';
export type { AppendOnlyLogScene, AppendStep, LogEntry } from './scene.js';
export { appendOnlyLogStageView } from './append-only-log-stage.js';
export { appendOnlyLogIRs } from './irs.js';
export { appendOnlyLogFacet } from './facet.js';

export function registerAppendOnlyLog(): void {
  registerAlgorithm<AppendOnlyLogFacetData>('appendOnlyLog', appendOnlyLog, { mechanismKind: 'reactive' });
  registerScenePlan('appendOnlyLogScene', appendOnlyLogScene);
  for (const ir of appendOnlyLogIRs) registerIR(ir.id, ir);
  registerView('append-only-log-stage', appendOnlyLogStageView);
  registerFacets([appendOnlyLogFacet]);
}
