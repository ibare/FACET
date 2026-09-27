import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { bayesAlgorithm, type BayesData } from './algorithm.js';
import { bayesProjector } from './projector.js';
import { bayesIRs } from './irs.js';
import { bayesStageView } from './bayes-stage.js';
import { bayesFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './bayes-stage.js';
export * from './facet.js';

export function registerBayes(): void {
  registerAlgorithm<BayesData>('bayes', bayesAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('bayesProjector', bayesProjector);
  for (const ir of bayesIRs) registerIR(ir.id, ir);
  registerView('bayes-stage', bayesStageView);
  registerFacets([bayesFacet]);
}
