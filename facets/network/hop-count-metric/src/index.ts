import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { hopCountMetric, type HopCountMetricFacetData } from './algorithm.js';
import { hopCountMetricFacet } from './facet.js';
import { hopCountMetricStageView } from './hop-count-metric-stage.js';
import { hopCountMetricIRs } from './irs.js';
import { hopCountMetricScene } from './scene.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './hop-count-metric-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerHopCountMetric(): void {
  registerAlgorithm<HopCountMetricFacetData>('hopCountMetric', hopCountMetric, { mechanismKind: 'reactive' });
  registerScenePlan('hopCountMetricScene', hopCountMetricScene);
  for (const ir of hopCountMetricIRs) registerIR(ir.id, ir);
  registerView('hop-count-metric-stage', hopCountMetricStageView);
  registerFacets([hopCountMetricFacet]);
}
