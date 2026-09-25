import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { interleaving, type InterleavingFacetData } from './algorithm.js';
import { interleavingScene } from './scene.js';
import { interleavingStageView } from './interleaving-stage.js';
import { interleavingIRs } from './irs.js';
import { interleavingFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './interleaving-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerInterleaving(): void {
  registerAlgorithm<InterleavingFacetData>('interleaving', interleaving, { mechanismKind: 'reactive' });
  registerScenePlan('interleavingScene', interleavingScene);
  for (const ir of interleavingIRs) registerIR(ir.id, ir);
  registerView('interleaving-stage', interleavingStageView);
  registerFacets([interleavingFacet]);
}
