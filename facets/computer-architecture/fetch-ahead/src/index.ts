import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { fetchAhead, type FetchAheadFacetData } from './algorithm.js';
import { fetchAheadStageView } from './fetch-ahead-stage.js';
import { fetchAheadFacet } from './facet.js';
import { fetchAheadIRs } from './irs.js';
import { fetchAheadScene } from './scene.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './fetch-ahead-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerFetchAhead(): void {
  registerAlgorithm<FetchAheadFacetData>('fetchAhead', fetchAhead, { mechanismKind: 'reactive' });
  registerScenePlan('fetchAheadScene', fetchAheadScene);
  for (const ir of fetchAheadIRs) registerIR(ir.id, ir);
  registerView('fetch-ahead-stage', fetchAheadStageView);
  registerFacets([fetchAheadFacet]);
}
