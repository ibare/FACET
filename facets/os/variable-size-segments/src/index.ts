import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { variableSizeSegments, type VariableSizeSegmentsFacetData } from './algorithm.js';
import { variableSizeSegmentsScene } from './scene.js';
import { variableSizeSegmentsStageView } from './variable-size-segments-stage.js';
import { variableSizeSegmentsIRs } from './irs.js';
import { variableSizeSegmentsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './variable-size-segments-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerVariableSizeSegments(): void {
  registerAlgorithm<VariableSizeSegmentsFacetData>('variableSizeSegments', variableSizeSegments, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('variableSizeSegmentsScene', variableSizeSegmentsScene);
  for (const ir of variableSizeSegmentsIRs) registerIR(ir.id, ir);
  registerView('variable-size-segments-stage', variableSizeSegmentsStageView);
  registerFacets([variableSizeSegmentsFacet]);
}
