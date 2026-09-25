import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { pageTableLookup, type PageTableLookupFacetData } from './algorithm.js';
import { pageTableLookupScene } from './scene.js';
import { pageTableLookupIRs } from './irs.js';
import { pageTableLookupStageView } from './page-table-lookup-stage.js';
import { pageTableLookupFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './page-table-lookup-stage.js';
export * from './facet.js';

export function registerPageTableLookup(): void {
  registerAlgorithm<PageTableLookupFacetData>('pageTableLookup', pageTableLookup, { mechanismKind: 'reactive' });
  registerScenePlan('pageTableLookupScene', pageTableLookupScene);
  for (const ir of pageTableLookupIRs) registerIR(ir.id, ir);
  registerView('page-table-lookup-stage', pageTableLookupStageView);
  registerFacets([pageTableLookupFacet]);
}
