import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { holdOutSome, type HoldOutSomeFacetData } from './algorithm';
import { holdOutSomeScene } from './scene';
import { holdOutSomeStageView } from './hold-out-some-stage';
import { holdOutSomeIRs } from './irs';
import { holdOutSomeFacet } from './facet';

export * from './algorithm';
export * from './scene';
export * from './hold-out-some-stage';
export * from './irs';
export * from './facet';

export function registerHoldOutSome(): void {
  registerAlgorithm<HoldOutSomeFacetData>('holdOutSome', holdOutSome, { mechanismKind: 'reactive' });
  registerScenePlan('holdOutSomeScene', holdOutSomeScene);
  for (const ir of holdOutSomeIRs) registerIR(ir.id, ir);
  registerView('hold-out-some-stage', holdOutSomeStageView);
  registerFacets([holdOutSomeFacet]);
}
