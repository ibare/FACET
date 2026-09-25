import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { loopBack, type LoopBackFacetData } from './algorithm';
import { loopBackScene } from './scene';
import { loopBackIRs } from './irs';
import { loopBackStageView } from './loop-back-stage';
import { loopBackFacet } from './facet';

export * from './algorithm';
export * from './scene';
export * from './irs';
export * from './loop-back-stage';
export * from './facet';

export function registerLoopBack(): void {
  registerAlgorithm<LoopBackFacetData>('loopBack', loopBack, { mechanismKind: 'reactive' });
  registerScenePlan('loopBackScene', loopBackScene);
  for (const ir of loopBackIRs) registerIR(ir.id, ir);
  registerView('loop-back-stage', loopBackStageView);
  registerFacets([loopBackFacet]);
}
