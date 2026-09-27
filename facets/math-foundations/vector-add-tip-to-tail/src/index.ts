import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { vectorAddTipToTail, type VectorAddTipToTailFacetData } from './algorithm.js';
import { vectorAddTipToTailScene } from './scene.js';
import { vectorAddTipToTailStageView } from './vector-add-tip-to-tail-stage.js';
import { vectorAddTipToTailIRs } from './irs.js';
import { vectorAddTipToTailFacet } from './facet.js';

export {
  vectorAddTipToTail,
  narrowVectorAddTipToTailData,
  type VectorAddTipToTailFacetData,
} from './algorithm.js';
export { vectorAddTipToTailScene, type VectorAddTipToTailScene } from './scene.js';
export { vectorAddTipToTailStageView } from './vector-add-tip-to-tail-stage.js';
export { vectorAddTipToTailIRs } from './irs.js';
export { vectorAddTipToTailFacet } from './facet.js';

export function registerVectorAddTipToTail(): void {
  registerAlgorithm<VectorAddTipToTailFacetData>('vectorAddTipToTail', vectorAddTipToTail, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('vectorAddTipToTailScene', vectorAddTipToTailScene);
  for (const ir of vectorAddTipToTailIRs) registerIR(ir.id, ir);
  registerView('vector-add-tip-to-tail-stage', vectorAddTipToTailStageView);
  registerFacets([vectorAddTipToTailFacet]);
}
