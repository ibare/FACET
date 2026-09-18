import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { whereToCut, type WhereToCutFacetData } from './algorithm.js';
import { whereToCutScene } from './scene.js';
import { whereToCutStageView } from './where-to-cut-stage.js';
import { whereToCutIRs } from './irs.js';
import { whereToCutFacet } from './facet.js';

export { whereToCut, type WhereToCutFacetData } from './algorithm.js';
export { whereToCutScene, type WhereToCutScene, type WhereToCutStep, type Cut } from './scene.js';
export { whereToCutStageView } from './where-to-cut-stage.js';
export { whereToCutIRs } from './irs.js';
export { whereToCutFacet } from './facet.js';

export function registerWhereToCut(): void {
  registerAlgorithm<WhereToCutFacetData>('whereToCut', whereToCut, { mechanismKind: 'reactive' });
  registerScenePlan('whereToCutScene', whereToCutScene);
  for (const ir of whereToCutIRs) registerIR(ir.id, ir);
  registerView('where-to-cut-stage', whereToCutStageView);
  registerFacets([whereToCutFacet]);
}
