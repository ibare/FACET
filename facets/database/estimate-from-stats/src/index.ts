import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { estimateFromStats, type EstimateFromStatsFacetData } from './algorithm.js';
import { estimateFromStatsScene } from './scene.js';
import { estimateFromStatsStageView } from './estimate-from-stats-stage.js';
import { estimateFromStatsIRs } from './irs.js';
import { estimateFromStatsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './estimate-from-stats-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerEstimateFromStats(): void {
  registerAlgorithm<EstimateFromStatsFacetData>('estimateFromStats', estimateFromStats, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('estimateFromStatsScene', estimateFromStatsScene);
  for (const ir of estimateFromStatsIRs) registerIR(ir.id, ir);
  registerView('estimate-from-stats-stage', estimateFromStatsStageView);
  registerFacets([estimateFromStatsFacet]);
}
