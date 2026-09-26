import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { rotateTheFold, type RotateTheFoldFacetData } from './algorithm.js';
import { rotateTheFoldScene } from './scene.js';
import { rotateTheFoldIRs } from './irs.js';
import { rotateTheFoldStageView } from './rotate-the-fold-stage.js';
import { rotateTheFoldFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { rotateTheFoldIRs } from './irs.js';
export { rotateTheFoldStageView } from './rotate-the-fold-stage.js';
export { rotateTheFoldFacet } from './facet.js';

export function registerRotateTheFold(): void {
  registerAlgorithm<RotateTheFoldFacetData>('rotateTheFold', rotateTheFold, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('rotateTheFoldScene', rotateTheFoldScene);
  for (const ir of rotateTheFoldIRs) registerIR(ir.id, ir);
  registerView('rotate-the-fold-stage', rotateTheFoldStageView);
  registerFacets([rotateTheFoldFacet]);
}
