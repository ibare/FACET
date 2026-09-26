import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { acceptState, type AcceptStateFacetData } from './algorithm.js';
import { acceptStateScene } from './scene.js';
import { acceptStateStageView } from './accept-state-stage.js';
import { acceptStateIRs } from './irs.js';
import { acceptStateFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './accept-state-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerAcceptState(): void {
  registerAlgorithm<AcceptStateFacetData>('acceptState', acceptState, { mechanismKind: 'reactive' });
  registerScenePlan('acceptStateScene', acceptStateScene);
  for (const ir of acceptStateIRs) registerIR(ir.id, ir);
  registerView('accept-state-stage', acceptStateStageView);
  registerFacets([acceptStateFacet]);
}
