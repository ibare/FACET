import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { lookCloselyAtFew, type LookCloselyAtFewFacetData } from './algorithm.js';
import { lookCloselyAtFewFacet } from './facet.js';
import { lookCloselyAtFewIRs } from './irs.js';
import { lookCloselyAtFewStageView } from './look-closely-at-few-stage.js';
import { lookCloselyAtFewScene } from './scene.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './look-closely-at-few-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerLookCloselyAtFew(): void {
  registerAlgorithm<LookCloselyAtFewFacetData>('lookCloselyAtFew', lookCloselyAtFew, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('lookCloselyAtFewScene', lookCloselyAtFewScene);
  for (const ir of lookCloselyAtFewIRs) registerIR(ir.id, ir);
  registerView('look-closely-at-few-stage', lookCloselyAtFewStageView);
  registerFacets([lookCloselyAtFewFacet]);
}
