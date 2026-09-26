import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { deferVsAsync } from './algorithm.js';
import { deferVsAsyncFacet } from './facet.js';
import { deferVsAsyncStageView } from './defer-vs-async-stage.js';
import { deferVsAsyncIRs } from './irs.js';
import { deferVsAsyncScene } from './scene.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './defer-vs-async-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerDeferVsAsync(): void {
  registerAlgorithm('deferVsAsync', deferVsAsync, { mechanismKind: 'reactive' });
  registerScenePlan('deferVsAsyncScene', deferVsAsyncScene);
  for (const ir of deferVsAsyncIRs) registerIR(ir.id, ir);
  registerView('defer-vs-async-stage', deferVsAsyncStageView);
  registerFacets([deferVsAsyncFacet]);
}
