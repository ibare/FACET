import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { passByValueVsReference, type PassByValueVsReferenceFacetData } from './algorithm.js';
import { passByValueVsReferenceScene } from './scene.js';
import { passByValueVsReferenceIRs } from './irs.js';
import { passByValueVsReferenceStageView } from './pass-by-value-vs-reference-stage.js';
import { passByValueVsReferenceFacet } from './facet.js';

export { passByValueVsReference, type PassByValueVsReferenceFacetData } from './algorithm.js';
export { passByValueVsReferenceScene, type PassScene } from './scene.js';
export { passByValueVsReferenceIRs } from './irs.js';
export { passByValueVsReferenceStageView } from './pass-by-value-vs-reference-stage.js';
export { passByValueVsReferenceFacet } from './facet.js';

export function registerPassByValueVsReference(): void {
  registerAlgorithm<PassByValueVsReferenceFacetData>('passByValueVsReference', passByValueVsReference, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('passByValueVsReferenceScene', passByValueVsReferenceScene);
  for (const ir of passByValueVsReferenceIRs) registerIR(ir.id, ir);
  registerView('pass-by-value-vs-reference-stage', passByValueVsReferenceStageView);
  registerFacets([passByValueVsReferenceFacet]);
}
