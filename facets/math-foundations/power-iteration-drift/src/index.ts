import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { powerIterationDrift, type PowerIterationDriftFacetData } from './algorithm.js';
import { powerIterationDriftScene } from './scene.js';
import { powerIterationDriftIRs } from './irs.js';
import { powerIterationDriftStageView } from './power-iteration-drift-stage.js';
import { powerIterationDriftFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './power-iteration-drift-stage.js';
export * from './facet.js';

export function registerPowerIterationDrift(): void {
  registerAlgorithm<PowerIterationDriftFacetData>('powerIterationDrift', powerIterationDrift, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('powerIterationDriftScene', powerIterationDriftScene);
  for (const ir of powerIterationDriftIRs) registerIR(ir.id, ir);
  registerView('power-iteration-drift-stage', powerIterationDriftStageView);
  registerFacets([powerIterationDriftFacet]);
}
