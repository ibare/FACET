import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { backtrackOnFail, type BacktrackOnFailFacetData } from './algorithm.js';
import { backtrackOnFailScene } from './scene.js';
import { backtrackOnFailStageView } from './backtrack-on-fail-stage.js';
import { backtrackOnFailIRs } from './irs.js';
import { backtrackOnFailFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './backtrack-on-fail-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerBacktrackOnFail(): void {
  registerAlgorithm<BacktrackOnFailFacetData>('backtrackOnFail', backtrackOnFail, { mechanismKind: 'reactive' });
  registerScenePlan('backtrackOnFailScene', backtrackOnFailScene);
  for (const ir of backtrackOnFailIRs) registerIR(ir.id, ir);
  registerView('backtrack-on-fail-stage', backtrackOnFailStageView);
  registerFacets([backtrackOnFailFacet]);
}
