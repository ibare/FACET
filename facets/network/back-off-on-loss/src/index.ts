import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { backOffOnLoss, type BackOffOnLossFacetData } from './algorithm.js';
import { backOffOnLossScene } from './scene.js';
import { backOffOnLossStageView } from './back-off-on-loss-stage.js';
import { backOffOnLossIRs } from './irs.js';
import { backOffOnLossFacet } from './facet.js';

export { backOffOnLoss, type BackOffOnLossFacetData } from './algorithm.js';
export * from './scene.js';
export { backOffOnLossStageView } from './back-off-on-loss-stage.js';
export { backOffOnLossIRs } from './irs.js';
export { backOffOnLossFacet } from './facet.js';

export function registerBackOffOnLoss(): void {
  registerAlgorithm<BackOffOnLossFacetData>('backOffOnLoss', backOffOnLoss, { mechanismKind: 'reactive' });
  registerScenePlan('backOffOnLossScene', backOffOnLossScene);
  for (const ir of backOffOnLossIRs) registerIR(ir.id, ir);
  registerView('back-off-on-loss-stage', backOffOnLossStageView);
  registerFacets([backOffOnLossFacet]);
}
