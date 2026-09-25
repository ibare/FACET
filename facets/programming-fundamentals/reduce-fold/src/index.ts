import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { reduceFold, type ReduceFoldFacetData } from './algorithm.js';
import { reduceFoldScene } from './scene.js';
import { reduceFoldIRs } from './irs.js';
import { reduceFoldStageView } from './reduce-fold-stage.js';
import { reduceFoldFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './reduce-fold-stage.js';
export * from './facet.js';

export function registerReduceFold(): void {
  registerAlgorithm<ReduceFoldFacetData>('reduceFold', reduceFold, { mechanismKind: 'reactive' });
  registerScenePlan('reduceFoldScene', reduceFoldScene);
  for (const ir of reduceFoldIRs) registerIR(ir.id, ir);
  registerView('reduce-fold-stage', reduceFoldStageView);
  registerFacets([reduceFoldFacet]);
}
