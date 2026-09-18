import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { overlapTheSeam, type OverlapTheSeamFacetData } from './algorithm.js';
import { overlapTheSeamScene } from './scene.js';
import { overlapTheSeamIRs } from './irs.js';
import { overlapTheSeamStageView } from './overlap-the-seam-stage.js';
import { overlapTheSeamFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './overlap-the-seam-stage.js';
export * from './facet.js';

export function registerOverlapTheSeam(): void {
  registerAlgorithm<OverlapTheSeamFacetData>('overlapTheSeam', overlapTheSeam, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('overlapTheSeamScene', overlapTheSeamScene);
  for (const ir of overlapTheSeamIRs) registerIR(ir.id, ir);
  registerView('overlap-the-seam-stage', overlapTheSeamStageView);
  registerFacets([overlapTheSeamFacet]);
}
