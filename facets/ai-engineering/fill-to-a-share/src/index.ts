import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { fillToAShare, type FillToAShareFacetData } from './algorithm.js';
import { fillToAShareScene } from './scene.js';
import { fillToAShareStageView } from './fill-to-a-share-stage.js';
import { fillToAShareIRs } from './irs.js';
import { fillToAShareFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './fill-to-a-share-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerFillToAShare(): void {
  registerAlgorithm<FillToAShareFacetData>('fillToAShare', fillToAShare, { mechanismKind: 'reactive' });
  registerScenePlan('fillToAShareScene', fillToAShareScene);
  for (const ir of fillToAShareIRs) registerIR(ir.id, ir);
  registerView('fill-to-a-share-stage', fillToAShareStageView);
  registerFacets([fillToAShareFacet]);
}
