import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { recursionSelfCall, type RecursionSelfCallFacetData } from './algorithm.js';
import { recursionSelfCallScene } from './scene.js';
import { recursionSelfCallStageView } from './recursion-self-call-stage.js';
import { recursionSelfCallIRs } from './irs.js';
import { recursionSelfCallFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './recursion-self-call-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerRecursionSelfCall(): void {
  registerAlgorithm<RecursionSelfCallFacetData>('recursionSelfCall', recursionSelfCall, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('recursionSelfCallScene', recursionSelfCallScene);
  for (const ir of recursionSelfCallIRs) registerIR(ir.id, ir);
  registerView('recursion-self-call-stage', recursionSelfCallStageView);
  registerFacets([recursionSelfCallFacet]);
}
