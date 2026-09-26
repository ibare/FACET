import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { updateAnomaly, type UpdateAnomalyFacetData } from './algorithm.js';
import { updateAnomalyScene } from './scene.js';
import { updateAnomalyIRs } from './irs.js';
import { updateAnomalyStageView } from './update-anomaly-stage.js';
import { updateAnomalyFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './update-anomaly-stage.js';
export * from './facet.js';

export function registerUpdateAnomaly(): void {
  registerAlgorithm<UpdateAnomalyFacetData>('updateAnomaly', updateAnomaly, { mechanismKind: 'reactive' });
  registerScenePlan('updateAnomalyScene', updateAnomalyScene);
  for (const ir of updateAnomalyIRs) registerIR(ir.id, ir);
  registerView('update-anomaly-stage', updateAnomalyStageView);
  registerFacets([updateAnomalyFacet]);
}
