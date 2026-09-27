import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { bayesUpdate, type BayesUpdateFacetData } from './algorithm.js';
import { bayesUpdateScene } from './scene.js';
import { bayesUpdateStageView } from './bayes-update-stage.js';
import { bayesUpdateIRs } from './irs.js';
import { bayesUpdateFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { bayesUpdateStageView } from './bayes-update-stage.js';
export { bayesUpdateIRs } from './irs.js';
export { bayesUpdateFacet } from './facet.js';

export function registerBayesUpdate(): void {
  registerAlgorithm<BayesUpdateFacetData>('bayesUpdate', bayesUpdate, { mechanismKind: 'reactive' });
  registerScenePlan('bayesUpdateScene', bayesUpdateScene);
  for (const ir of bayesUpdateIRs) registerIR(ir.id, ir);
  registerView('bayes-update-stage', bayesUpdateStageView);
  registerFacets([bayesUpdateFacet]);
}
