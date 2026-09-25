import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { beladyAnomaly, type BeladyAnomalyFacetData } from './algorithm.js';
import { beladyAnomalyScene } from './scene.js';
import { beladyAnomalyStageView } from './belady-anomaly-stage.js';
import { beladyAnomalyIRs } from './irs.js';
import { beladyAnomalyFacet } from './facet.js';

export { beladyAnomaly, type BeladyAnomalyFacetData } from './algorithm.js';
export { beladyAnomalyScene, type BeladyScene } from './scene.js';
export { beladyAnomalyStageView } from './belady-anomaly-stage.js';
export { beladyAnomalyIRs } from './irs.js';
export { beladyAnomalyFacet } from './facet.js';

export function registerBeladyAnomaly(): void {
  registerAlgorithm<BeladyAnomalyFacetData>('beladyAnomaly', beladyAnomaly, { mechanismKind: 'reactive' });
  registerScenePlan('beladyAnomalyScene', beladyAnomalyScene);
  for (const ir of beladyAnomalyIRs) registerIR(ir.id, ir);
  registerView('belady-anomaly-stage', beladyAnomalyStageView);
  registerFacets([beladyAnomalyFacet]);
}
