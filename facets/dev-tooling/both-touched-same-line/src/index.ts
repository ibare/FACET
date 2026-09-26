import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { bothTouchedSameLine, type BothTouchedSameLineFacetData } from './algorithm.js';
import { bothTouchedSameLineScene } from './scene.js';
import { bothTouchedSameLineIRs } from './irs.js';
import { bothTouchedSameLineStageView } from './both-touched-same-line-stage.js';
import { bothTouchedSameLineFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './both-touched-same-line-stage.js';
export * from './facet.js';

export function registerBothTouchedSameLine(): void {
  registerAlgorithm<BothTouchedSameLineFacetData>('bothTouchedSameLine', bothTouchedSameLine, { mechanismKind: 'reactive' });
  registerScenePlan('bothTouchedSameLineScene', bothTouchedSameLineScene);
  for (const ir of bothTouchedSameLineIRs) registerIR(ir.id, ir);
  registerView('both-touched-same-line-stage', bothTouchedSameLineStageView);
  registerFacets([bothTouchedSameLineFacet]);
}
