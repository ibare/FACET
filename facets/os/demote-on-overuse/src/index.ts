import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { demoteOnOveruse, type DemoteOnOveruseFacetData } from './algorithm.js';
import { demoteOnOveruseScene } from './scene.js';
import { demoteOnOveruseStageView } from './demote-on-overuse-stage.js';
import { demoteOnOveruseIRs } from './irs.js';
import { demoteOnOveruseFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './demote-on-overuse-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerDemoteOnOveruse(): void {
  registerAlgorithm<DemoteOnOveruseFacetData>('demoteOnOveruse', demoteOnOveruse, { mechanismKind: 'reactive' });
  registerScenePlan('demoteOnOveruseScene', demoteOnOveruseScene);
  for (const ir of demoteOnOveruseIRs) registerIR(ir.id, ir);
  registerView('demote-on-overuse-stage', demoteOnOveruseStageView);
  registerFacets([demoteOnOveruseFacet]);
}
