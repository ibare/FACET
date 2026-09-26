import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { lowerToSimpler, type LowerToSimplerFacetData } from './algorithm.js';
import { lowerToSimplerScene } from './scene.js';
import { lowerToSimplerStageView } from './lower-to-simpler-stage.js';
import { lowerToSimplerIRs } from './irs.js';
import { lowerToSimplerFacet } from './facet.js';

export { lowerToSimpler, type LowerToSimplerFacetData } from './algorithm.js';
export { lowerToSimplerScene, type LowerScene } from './scene.js';
export { lowerToSimplerStageView } from './lower-to-simpler-stage.js';
export { lowerToSimplerIRs } from './irs.js';
export { lowerToSimplerFacet } from './facet.js';

export function registerLowerToSimpler(): void {
  registerAlgorithm<LowerToSimplerFacetData>('lowerToSimpler', lowerToSimpler, { mechanismKind: 'reactive' });
  registerScenePlan('lowerToSimplerScene', lowerToSimplerScene);
  for (const ir of lowerToSimplerIRs) registerIR(ir.id, ir);
  registerView('lower-to-simpler-stage', lowerToSimplerStageView);
  registerFacets([lowerToSimplerFacet]);
}
