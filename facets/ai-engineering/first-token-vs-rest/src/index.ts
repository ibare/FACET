import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { firstTokenVsRest, type FirstTokenVsRestFacetData } from './algorithm.js';
import { firstTokenVsRestScene } from './scene.js';
import { firstTokenVsRestStageView } from './first-token-vs-rest-stage.js';
import { firstTokenVsRestIRs } from './irs.js';
import { firstTokenVsRestFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './first-token-vs-rest-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerFirstTokenVsRest(): void {
  registerAlgorithm<FirstTokenVsRestFacetData>('firstTokenVsRest', firstTokenVsRest, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('firstTokenVsRestScene', firstTokenVsRestScene);
  for (const ir of firstTokenVsRestIRs) registerIR(ir.id, ir);
  registerView('first-token-vs-rest-stage', firstTokenVsRestStageView);
  registerFacets([firstTokenVsRestFacet]);
}
