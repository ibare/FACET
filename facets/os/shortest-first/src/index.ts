import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { shortestFirst, type ShortestFirstFacetData } from './algorithm.js';
import { shortestFirstScene } from './scene.js';
import { shortestFirstStageView } from './shortest-first-stage.js';
import { shortestFirstIRs } from './irs.js';
import { shortestFirstFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './shortest-first-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerShortestFirst(): void {
  registerAlgorithm<ShortestFirstFacetData>('shortestFirst', shortestFirst, { mechanismKind: 'reactive' });
  registerScenePlan('shortestFirstScene', shortestFirstScene);
  for (const ir of shortestFirstIRs) registerIR(ir.id, ir);
  registerView('shortest-first-stage', shortestFirstStageView);
  registerFacets([shortestFirstFacet]);
}
