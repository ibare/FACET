import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { stageOverlap, type StageOverlapFacetData } from './algorithm.js';
import { stageOverlapFacet } from './facet.js';
import { stageOverlapIRs } from './irs.js';
import { stageOverlapScene } from './scene.js';
import { stageOverlapStageView } from './stage-overlap-stage.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './stage-overlap-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerStageOverlap(): void {
  registerAlgorithm<StageOverlapFacetData>('stageOverlap', stageOverlap, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('stageOverlapScene', stageOverlapScene);
  for (const ir of stageOverlapIRs) registerIR(ir.id, ir);
  registerView('stage-overlap-stage', stageOverlapStageView);
  registerFacets([stageOverlapFacet]);
}
