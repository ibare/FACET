import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { lockOrdering, type LockOrderingFacetData } from './algorithm';
import { lockOrderingScene } from './scene';
import { lockOrderingIRs } from './irs';
import { lockOrderingStageView } from './lock-ordering-stage';
import { lockOrderingFacet } from './facet';

export * from './algorithm';
export * from './scene';
export * from './irs';
export * from './lock-ordering-stage';
export * from './facet';

export function registerLockOrdering(): void {
  registerAlgorithm<LockOrderingFacetData>('lockOrdering', lockOrdering, { mechanismKind: 'reactive' });
  registerScenePlan('lockOrderingScene', lockOrderingScene);
  for (const ir of lockOrderingIRs) registerIR(ir.id, ir);
  registerView('lock-ordering-stage', lockOrderingStageView);
  registerFacets([lockOrderingFacet]);
}
