import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { paddingGap, type PaddingGapFacetData } from './algorithm.js';
import { paddingGapScene } from './scene.js';
import { paddingGapStageView } from './padding-gap-stage.js';
import { paddingGapIRs } from './irs.js';
import { paddingGapFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './padding-gap-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerPaddingGap(): void {
  registerAlgorithm<PaddingGapFacetData>('paddingGap', paddingGap, { mechanismKind: 'reactive' });
  registerScenePlan('paddingGapScene', paddingGapScene);
  for (const ir of paddingGapIRs) registerIR(ir.id, ir);
  registerView('padding-gap-stage', paddingGapStageView);
  registerFacets([paddingGapFacet]);
}
