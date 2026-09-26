import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { lookaheadOne, type LookaheadOneFacetData } from './algorithm.js';
import { lookaheadOneScene } from './scene.js';
import { lookaheadOneIRs } from './irs.js';
import { lookaheadOneStageView } from './lookahead-one-stage.js';
import { lookaheadOneFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './lookahead-one-stage.js';
export * from './facet.js';

export function registerLookaheadOne(): void {
  registerAlgorithm<LookaheadOneFacetData>('lookaheadOne', lookaheadOne, { mechanismKind: 'reactive' });
  registerScenePlan('lookaheadOneScene', lookaheadOneScene);
  for (const ir of lookaheadOneIRs) registerIR(ir.id, ir);
  registerView('lookahead-one-stage', lookaheadOneStageView);
  registerFacets([lookaheadOneFacet]);
}
