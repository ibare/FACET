import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { shortestPathTree } from './algorithm.js';
import type { ShortestPathTreeFacetData } from './algorithm.js';
import { shortestPathTreeScene } from './scene.js';
import { shortestPathTreeStageView } from './shortest-path-tree-stage.js';
import { shortestPathTreeIRs } from './irs.js';
import { shortestPathTreeFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { shortestPathTreeStageView } from './shortest-path-tree-stage.js';
export { shortestPathTreeIRs } from './irs.js';
export { shortestPathTreeFacet } from './facet.js';

export function registerShortestPathTree(): void {
  registerAlgorithm<ShortestPathTreeFacetData>('shortestPathTree', shortestPathTree, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('shortestPathTreeScene', shortestPathTreeScene);
  for (const ir of shortestPathTreeIRs) registerIR(ir.id, ir);
  registerView('shortest-path-tree-stage', shortestPathTreeStageView);
  registerFacets([shortestPathTreeFacet]);
}
