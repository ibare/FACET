import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { nudgeTowardReward, type NudgeTowardRewardFacetData } from './algorithm.js';
import { nudgeTowardRewardScene } from './scene.js';
import { nudgeTowardRewardStageView } from './nudge-toward-reward-stage.js';
import { nudgeTowardRewardIRs } from './irs.js';
import { nudgeTowardRewardFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './nudge-toward-reward-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerNudgeTowardReward(): void {
  registerAlgorithm<NudgeTowardRewardFacetData>('nudgeTowardReward', nudgeTowardReward, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('nudgeTowardRewardScene', nudgeTowardRewardScene);
  for (const ir of nudgeTowardRewardIRs) registerIR(ir.id, ir);
  registerView('nudge-toward-reward-stage', nudgeTowardRewardStageView);
  registerFacets([nudgeTowardRewardFacet]);
}
