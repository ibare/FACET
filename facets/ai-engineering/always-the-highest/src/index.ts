import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { alwaysTheHighest, type AlwaysTheHighestFacetData } from './algorithm.js';
import { alwaysTheHighestScene } from './scene.js';
import { alwaysTheHighestIRs } from './irs.js';
import { alwaysTheHighestStageView } from './always-the-highest-stage.js';
import { alwaysTheHighestFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './always-the-highest-stage.js';
export * from './facet.js';

export function registerAlwaysTheHighest(): void {
  registerAlgorithm<AlwaysTheHighestFacetData>('alwaysTheHighest', alwaysTheHighest, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('alwaysTheHighestScene', alwaysTheHighestScene);
  for (const ir of alwaysTheHighestIRs) registerIR(ir.id, ir);
  registerView('always-the-highest-stage', alwaysTheHighestStageView);
  registerFacets([alwaysTheHighestFacet]);
}
