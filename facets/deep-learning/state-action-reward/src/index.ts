import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { stateActionReward, type StateActionRewardFacetData } from './algorithm.js';
import { stateActionRewardScene } from './scene.js';
import { stateActionRewardStageView } from './state-action-reward-stage.js';
import { stateActionRewardIRs } from './irs.js';
import { stateActionRewardFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './state-action-reward-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerStateActionReward(): void {
  registerAlgorithm<StateActionRewardFacetData>('stateActionReward', stateActionReward, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('stateActionRewardScene', stateActionRewardScene);
  for (const ir of stateActionRewardIRs) registerIR(ir.id, ir);
  registerView('state-action-reward-stage', stateActionRewardStageView);
  registerFacets([stateActionRewardFacet]);
}
