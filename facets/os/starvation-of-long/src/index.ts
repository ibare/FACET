import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { starvationOfLong, type StarvationOfLongFacetData } from './algorithm.js';
import { starvationOfLongScene } from './scene.js';
import { starvationOfLongIRs } from './irs.js';
import { starvationOfLongStageView } from './starvation-of-long-stage.js';
import { starvationOfLongFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './starvation-of-long-stage.js';
export * from './facet.js';

export function registerStarvationOfLong(): void {
  registerAlgorithm<StarvationOfLongFacetData>('starvationOfLong', starvationOfLong, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('starvationOfLongScene', starvationOfLongScene);
  for (const ir of starvationOfLongIRs) registerIR(ir.id, ir);
  registerView('starvation-of-long-stage', starvationOfLongStageView);
  registerFacets([starvationOfLongFacet]);
}
