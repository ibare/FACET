import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { aging, type AgingFacetData } from './algorithm.js';
import { agingScene } from './scene.js';
import { agingIRs } from './irs.js';
import { agingStageView } from './aging-stage.js';
import { agingFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './aging-stage.js';
export * from './facet.js';

export function registerAging(): void {
  registerAlgorithm<AgingFacetData>('aging', aging, { mechanismKind: 'reactive' });
  registerScenePlan('agingScene', agingScene);
  for (const ir of agingIRs) registerIR(ir.id, ir);
  registerView('aging-stage', agingStageView);
  registerFacets([agingFacet]);
}
