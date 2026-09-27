import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { bipartiteColoring, type BipartiteColoringFacetData } from './algorithm.js';
import { bipartiteColoringScene } from './scene.js';
import { bipartiteColoringStageView } from './bipartite-coloring-stage.js';
import { bipartiteColoringIRs } from './irs.js';
import { bipartiteColoringFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { bipartiteColoringStageView } from './bipartite-coloring-stage.js';
export { bipartiteColoringIRs } from './irs.js';
export { bipartiteColoringFacet } from './facet.js';

export function registerBipartiteColoring(): void {
  registerAlgorithm<BipartiteColoringFacetData>('bipartiteColoring', bipartiteColoring, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('bipartiteColoringScene', bipartiteColoringScene);
  for (const ir of bipartiteColoringIRs) registerIR(ir.id, ir);
  registerView('bipartite-coloring-stage', bipartiteColoringStageView);
  registerFacets([bipartiteColoringFacet]);
}
