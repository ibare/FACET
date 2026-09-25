import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { baseCase, type BaseCaseFacetData } from './algorithm.js';
import { baseCaseScene } from './scene.js';
import { baseCaseStageView } from './base-case-stage.js';
import { baseCaseIRs } from './irs.js';
import { baseCaseFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './base-case-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerBaseCase(): void {
  registerAlgorithm<BaseCaseFacetData>('baseCase', baseCase, { mechanismKind: 'reactive' });
  registerScenePlan('baseCaseScene', baseCaseScene);
  for (const ir of baseCaseIRs) registerIR(ir.id, ir);
  registerView('base-case-stage', baseCaseStageView);
  registerFacets([baseCaseFacet]);
}
