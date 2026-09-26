import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { shrinkBySummary, type ShrinkBySummaryFacetData } from './algorithm.js';
import { shrinkBySummaryScene } from './scene.js';
import { shrinkBySummaryStageView } from './shrink-by-summary-stage.js';
import { shrinkBySummaryIRs } from './irs.js';
import { shrinkBySummaryFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './shrink-by-summary-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerShrinkBySummary(): void {
  registerAlgorithm<ShrinkBySummaryFacetData>('shrinkBySummary', shrinkBySummary, { mechanismKind: 'reactive' });
  registerScenePlan('shrinkBySummaryScene', shrinkBySummaryScene);
  for (const ir of shrinkBySummaryIRs) registerIR(ir.id, ir);
  registerView('shrink-by-summary-stage', shrinkBySummaryStageView);
  registerFacets([shrinkBySummaryFacet]);
}
