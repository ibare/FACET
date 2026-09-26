import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { keepUnmatched, type KeepUnmatchedFacetData } from './algorithm.js';
import { keepUnmatchedFacet } from './facet.js';
import { keepUnmatchedIRs } from './irs.js';
import { keepUnmatchedStageView } from './keep-unmatched-stage.js';
import { keepUnmatchedScene } from './scene.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './keep-unmatched-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerKeepUnmatched(): void {
  registerAlgorithm<KeepUnmatchedFacetData>('keepUnmatched', keepUnmatched, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('keepUnmatchedScene', keepUnmatchedScene);
  for (const ir of keepUnmatchedIRs) registerIR(ir.id, ir);
  registerView('keep-unmatched-stage', keepUnmatchedStageView);
  registerFacets([keepUnmatchedFacet]);
}
