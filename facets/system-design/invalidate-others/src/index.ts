import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { invalidateOthers, type InvalidateOthersFacetData } from './algorithm.js';
import { invalidateOthersScene } from './scene.js';
import { invalidateOthersStageView } from './invalidate-others-stage.js';
import { invalidateOthersIRs } from './irs.js';
import { invalidateOthersFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './invalidate-others-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerInvalidateOthers(): void {
  registerAlgorithm<InvalidateOthersFacetData>('invalidateOthers', invalidateOthers, { mechanismKind: 'reactive' });
  registerScenePlan('invalidateOthersScene', invalidateOthersScene);
  for (const ir of invalidateOthersIRs) registerIR(ir.id, ir);
  registerView('invalidate-others-stage', invalidateOthersStageView);
  registerFacets([invalidateOthersFacet]);
}
